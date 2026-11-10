/**
 * FROM K CAR — 관리자 로그인 (아이디·비밀번호 + 인증 앱 2차 인증).
 *
 *  - 계정: 대표 1명(환경변수 ADMIN_USER / ADMIN_PASSWORD) + 직원 계정(대표가 만들고, 비밀번호는 scrypt 해시로 저장).
 *    계정 정보는 data/admin_accounts.json, 서명 키는 data/admin_secrets.json (둘 다 git에 올라가지 않는다).
 *  - 2차 인증: TOTP(RFC 6238, 6자리·30초). 첫 로그인 때 인증 앱(구글 OTP 등)에 등록하고, 그 뒤로는 매번 코드를 입력한다.
 *    휴대폰을 잃어버렸을 때 쓰는 일회용 백업 코드 8개는 등록 때 한 번만 보여준다.
 *  - 세션: 로그인에 성공하면 서버가 서명한 토큰(12시간)을 준다. 비밀번호는 로그인할 때만 오가고, 이후 요청에는 토큰만 쓴다.
 *  - 로그인 시도 제한: 아이디별 5회·IP별 20회 틀리면 15분간 막는다.
 * 외부 라이브러리 없이 Node 기본 모듈만 쓴다.
 *
 * 2차 인증 켜기/끄기: 환경변수 ADMIN_2FA=1 이면 위 방식 전체가 동작하고, 없으면(기본) 대표 계정이 아이디·비밀번호만으로 로그인한다
 * (세션 토큰은 그대로 쓴다). 꺼져 있는 동안 직원 계정은 로그인할 수 없고 계정 관리 기능도 막혀 있다.
 */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const ISSUER = 'FROM K CAR';
const USER_MAX_FAILS = 5;
const IP_MAX_FAILS = 20;
const LOCK_MS = 15 * 60 * 1000;
const MAX_ACCOUNTS = 10;

/* ---------------- TOTP (RFC 6238) ---------------- */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
}

function base32Decode(str) {
  let bits = '';
  for (const ch of String(str).replace(/=+$/, '').toUpperCase()) {
    const v = B32.indexOf(ch);
    if (v < 0) throw new Error('bad base32');
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function hotp(secretBuf, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', secretBuf).update(msg).digest();
  const o = h[19] & 15;
  const code = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(code % 1000000).padStart(6, '0');
}

const safeEqual = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

// 맞는 코드면 그 코드의 30초 구간 번호를, 아니면 null. 직전·다음 구간까지 허용하고, 이미 쓴 구간은 다시 받지 않는다.
function checkTotp(secret, code, lastStep) {
  let key;
  try { key = base32Decode(secret); } catch (e) { return null; }
  const now = Math.floor(Date.now() / 30000);
  for (const d of [-1, 0, 1]) {
    const step = now + d;
    if (step <= (lastStep || 0)) continue;
    if (safeEqual(hotp(key, step), code)) return step;
  }
  return null;
}

/* ---------------- 비밀번호 ---------------- */
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `s1$${salt}$${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
}

function checkPasswordHash(pw, stored) {
  const [ver, salt, hash] = String(stored || '').split('$');
  if (ver !== 's1' || !salt || !hash) return false;
  const a = crypto.scryptSync(pw, salt, 64);
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const hashCode = (c) => crypto.createHash('sha256').update(c).digest('hex');

function createAdminAuth({ dataDir, ownerUser, ownerPassword, twoFactor, sendJson, readRequestBody, clientIp }) {
  const accountsFile = path.join(dataDir, 'admin_accounts.json');
  const secretsFile = path.join(dataDir, 'admin_secrets.json');
  const enabled = !!(ownerUser && ownerPassword);
  const ownerKey = String(ownerUser || '').trim().toLowerCase();
  if (!enabled) console.warn('[admin] ADMIN_USER / ADMIN_PASSWORD 환경변수가 없어서 관리자 로그인을 막아 두었습니다.');

  const ensureDir = () => { if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true }); };

  /* 서명 키: 처음 한 번 만들어 디스크에 둔다 (재배포해도 로그인이 유지되도록) */
  let sessionSecret = null;
  function getSecret() {
    if (sessionSecret) return sessionSecret;
    try {
      sessionSecret = JSON.parse(fs.readFileSync(secretsFile, 'utf-8')).session_secret;
    } catch (e) { /* 없으면 새로 만든다 */ }
    if (!sessionSecret) {
      sessionSecret = crypto.randomBytes(32).toString('hex');
      ensureDir();
      fs.writeFileSync(secretsFile, JSON.stringify({ session_secret: sessionSecret }), { encoding: 'utf-8', mode: 0o600 });
    }
    return sessionSecret;
  }

  const b64u = (buf) => Buffer.from(buf).toString('base64url');
  function sign(payload) {
    const body = b64u(JSON.stringify(payload));
    return `${body}.${crypto.createHmac('sha256', getSecret()).update(body).digest('base64url')}`;
  }
  function verifyToken(token) {
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig) return null;
    const expect = crypto.createHmac('sha256', getSecret()).update(body).digest('base64url');
    if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
    try {
      const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
      return p && p.exp > Date.now() ? p : null;
    } catch (e) { return null; }
  }

  /* 계정 저장소 */
  let accounts = null;
  function load() {
    if (accounts) return accounts;
    try { accounts = JSON.parse(fs.readFileSync(accountsFile, 'utf-8')); } catch (e) { accounts = []; }
    if (!Array.isArray(accounts)) accounts = [];
    // 휴대폰·백업 코드를 모두 잃어버린 대표용 비상 장치: 환경변수 ADMIN_RESET_2FA=1 로 한 번 띄우면 2차 인증을 다시 등록하게 한다
    if (process.env.ADMIN_RESET_2FA === '1') {
      const o = accounts.find((a) => a.role === 'owner');
      if (o) {
        Object.assign(o, { totp_secret: null, pending_secret: null, backup_hashes: [], token_version: (o.token_version || 0) + 1 });
        save();
        console.warn('[admin] ADMIN_RESET_2FA=1: 대표 계정의 2차 인증을 초기화했습니다. 다시 등록한 뒤 이 환경변수를 꼭 지우세요.');
      }
    }
    return accounts;
  }
  function save() {
    ensureDir();
    fs.writeFileSync(accountsFile, JSON.stringify(accounts, null, 2), { encoding: 'utf-8', mode: 0o600 });
  }
  function findAccount(name) {
    const n = String(name || '').trim().toLowerCase();
    if (!n) return null;
    const list = load();
    if (n === ownerKey) {
      let o = list.find((a) => a.role === 'owner' && a.username.toLowerCase() === ownerKey);
      if (!o) {
        o = { username: ownerUser, role: 'owner', totp_secret: null, backup_hashes: [], token_version: 0, created_at: Date.now() };
        list.push(o);
        save();
      }
      return o;
    }
    return list.find((a) => a.role === 'staff' && a.username.toLowerCase() === n) || null;
  }
  function passwordOk(acct, pw) {
    if (!acct) { crypto.scryptSync('x', 'dummy-salt-for-timing', 64); return false; } // 없는 아이디도 같은 시간이 걸리게
    return acct.role === 'owner' ? safeEqual(pw, ownerPassword) : checkPasswordHash(String(pw), acct.pw_hash);
  }

  /* 로그인 시도 제한 */
  const fails = new Map();
  function lockedFor(key) {
    const e = fails.get(key);
    if (!e) return 0;
    if (e.until && e.until > Date.now()) return e.until - Date.now();
    if (Date.now() - e.t > LOCK_MS) fails.delete(key);
    return 0;
  }
  function recordFail(key, max) {
    const e = fails.get(key) && Date.now() - fails.get(key).t <= LOCK_MS ? fails.get(key) : { n: 0, t: Date.now() };
    e.n += 1;
    if (e.n >= max) e.until = Date.now() + LOCK_MS;
    fails.set(key, e);
  }
  function tooMany(res, ms) {
    return sendJson(res, 429, { error: `로그인 시도가 너무 많아요. ${Math.ceil(ms / 60000)}분 뒤에 다시 시도해 주세요.`, retry_after_ms: ms });
  }

  function newSession(acct) {
    const exp = Date.now() + SESSION_TTL_MS;
    return { token: sign({ t: 's', u: acct.username, r: acct.role, v: acct.token_version || 0, exp }), expires_at: exp };
  }

  function otpauthUrl(user, secret) {
    return `otpauth://totp/${encodeURIComponent(`${ISSUER}:${user}`)}?secret=${secret}&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=6&period=30`;
  }

  /* 모든 관리자 API가 부르는 검사: 유효한 세션 토큰이면 true (req.admin에 누구인지 담는다) */
  function isAuthorized(req) {
    if (!enabled) return false;
    const h = req.headers['authorization'] || '';
    if (!h.startsWith('Bearer ')) return false;
    const p = verifyToken(h.slice(7));
    if (!p || p.t !== 's') return false;
    const acct = findAccount(p.u);
    if (!acct || (acct.token_version || 0) !== p.v) return false;
    if (!twoFactor && acct.role !== 'owner') return false; // 2차 인증이 꺼져 있으면 대표 계정만
    // 임시 비밀번호로 들어온 직원은 비밀번호를 바꾸기 전까지 다른 기능을 쓸 수 없다
    if (acct.must_change_pw && !/^\/admin\/(password|session)$/.test(String(req.url || '').split('?')[0])) return false;
    req.admin = { username: acct.username, role: acct.role, must_change_pw: !!acct.must_change_pw, exp: p.exp };
    return true;
  }

  const publicAccount = (a) => ({ username: a.username, role: a.role, totp_enabled: !!a.totp_secret, must_change_pw: !!a.must_change_pw, created_at: a.created_at });

  /* ---------------- 요청 처리 ---------------- */
  async function handle(req, res, urlObj) {
    res.setHeader('Cache-Control', 'no-store');
    const p = urlObj.pathname;
    const method = req.method;
    const body = async () => { try { return (await readRequestBody(req, 16 * 1024)) || {}; } catch (e) { return null; } };

    // 1단계: 아이디 + 비밀번호
    if (p === '/admin/login' && method === 'POST') {
      if (!enabled) return sendJson(res, 503, { error: '서버에 관리자 계정이 설정되지 않았어요. (ADMIN_USER, ADMIN_PASSWORD 환경변수)' });
      const b = await body();
      if (!b) return sendJson(res, 400, { error: '잘못된 요청입니다.' });
      const ipKey = `ip:${clientIp(req)}`;
      const userKey = `u:${String(b.username || '').trim().toLowerCase()}`;
      const wait = Math.max(lockedFor(ipKey), lockedFor(userKey));
      if (wait) return tooMany(res, wait);
      const acct = findAccount(b.username);
      if (!passwordOk(acct, String(b.password || ''))) {
        recordFail(ipKey, IP_MAX_FAILS);
        recordFail(userKey, USER_MAX_FAILS);
        console.warn(`[admin] 로그인 실패: ${String(b.username || '').slice(0, 30)} (${clientIp(req)})`);
        return sendJson(res, 401, { error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
      }
      if (!twoFactor) {
        if (acct.role !== 'owner') return sendJson(res, 401, { error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
        fails.delete(userKey);
        const s = newSession(acct);
        console.log(`[admin] 로그인: ${acct.username} (${clientIp(req)})`);
        return sendJson(res, 200, { token: s.token, expires_at: s.expires_at, username: acct.username, role: acct.role, must_change_pw: false });
      }
      const challenge = sign({ t: 'pre', u: acct.username, exp: Date.now() + CHALLENGE_TTL_MS });
      if (acct.totp_secret) return sendJson(res, 200, { step: 'totp', challenge });
      if (!acct.pending_secret) { acct.pending_secret = base32Encode(crypto.randomBytes(20)); save(); }
      return sendJson(res, 200, { step: 'enroll', challenge, secret: acct.pending_secret, otpauth: otpauthUrl(acct.username, acct.pending_secret) });
    }

    // 2단계: 인증 앱의 6자리 코드(또는 백업 코드). 처음 로그인이면 이 코드로 등록을 마친다.
    if (p === '/admin/login/verify' && method === 'POST') {
      if (!twoFactor) return sendJson(res, 404, { error: 'Not found' });
      const b = await body();
      const pre = b && verifyToken(b.challenge);
      if (!pre || pre.t !== 'pre') return sendJson(res, 401, { error: '인증 시간이 지났어요. 처음부터 다시 로그인해 주세요.', restart: true });
      const ipKey = `ip:${clientIp(req)}`;
      const userKey = `u:${String(pre.u).toLowerCase()}`;
      const wait = Math.max(lockedFor(ipKey), lockedFor(userKey));
      if (wait) return tooMany(res, wait);
      const acct = findAccount(pre.u);
      if (!acct) return sendJson(res, 401, { error: '계정을 찾을 수 없어요.', restart: true });
      const code = String(b.code || '').replace(/[\s-]/g, '');
      const fail = () => {
        recordFail(ipKey, IP_MAX_FAILS);
        recordFail(userKey, USER_MAX_FAILS);
        console.warn(`[admin] 2차 인증 실패: ${acct.username} (${clientIp(req)})`);
        return sendJson(res, 401, { error: '인증 코드가 올바르지 않습니다.' });
      };
      let backupCodes = null;
      if (!acct.totp_secret) {
        // 등록 단계: 앱에 넣은 키로 만든 코드가 맞으면 등록 완료
        if (!acct.pending_secret || !/^\d{6}$/.test(code)) return fail();
        const step = checkTotp(acct.pending_secret, code, 0);
        if (step === null) return fail();
        acct.totp_secret = acct.pending_secret;
        acct.pending_secret = null;
        acct.totp_last_step = step;
        backupCodes = Array.from({ length: 8 }, () => {
          const h = crypto.randomBytes(5).toString('hex');
          return `${h.slice(0, 5)}-${h.slice(5)}`;
        });
        acct.backup_hashes = backupCodes.map((c) => hashCode(c.replace('-', '')));
        save();
      } else if (/^\d{6}$/.test(code)) {
        const step = checkTotp(acct.totp_secret, code, acct.totp_last_step);
        if (step === null) return fail();
        acct.totp_last_step = step;
        save();
      } else {
        const h = hashCode(code.toLowerCase());
        const idx = (acct.backup_hashes || []).indexOf(h);
        if (idx < 0) return fail();
        acct.backup_hashes.splice(idx, 1); // 백업 코드는 한 번만 쓸 수 있다
        save();
      }
      fails.delete(userKey);
      const s = newSession(acct);
      console.log(`[admin] 로그인: ${acct.username} (${clientIp(req)})`);
      return sendJson(res, 200, {
        token: s.token, expires_at: s.expires_at, username: acct.username, role: acct.role,
        must_change_pw: !!acct.must_change_pw, backup_codes: backupCodes, backup_left: (acct.backup_hashes || []).length
      });
    }

    // 이하는 로그인한 관리자만
    if (!isAuthorized(req)) return sendJson(res, 401, { error: 'Unauthorized' });
    const me = req.admin;

    if (p === '/admin/session' && method === 'GET') {
      const acct = findAccount(me.username);
      return sendJson(res, 200, { ok: true, two_factor: !!twoFactor, username: me.username, role: me.role, must_change_pw: me.must_change_pw, expires_at: me.exp, backup_left: (acct.backup_hashes || []).length });
    }

    // 내 비밀번호 바꾸기 (직원 계정. 대표 비밀번호는 서버 환경변수로 관리한다)
    if (p === '/admin/password' && method === 'POST') {
      const b = await body();
      if (!b) return sendJson(res, 400, { error: '잘못된 요청입니다.' });
      const acct = findAccount(me.username);
      if (acct.role === 'owner') return sendJson(res, 400, { error: '대표 비밀번호는 Render의 ADMIN_PASSWORD 환경변수에서 바꿀 수 있어요.' });
      if (!checkPasswordHash(String(b.old_password || ''), acct.pw_hash)) return sendJson(res, 400, { error: '현재 비밀번호가 올바르지 않습니다.' });
      const np = String(b.new_password || '');
      if (np.length < 10) return sendJson(res, 400, { error: '새 비밀번호는 10자 이상이어야 해요.' });
      if (np === String(b.old_password)) return sendJson(res, 400, { error: '이전과 다른 비밀번호를 입력해 주세요.' });
      acct.pw_hash = hashPassword(np);
      acct.must_change_pw = false;
      acct.token_version = (acct.token_version || 0) + 1; // 다른 곳에 로그인된 세션은 모두 끊는다
      save();
      const s = newSession(acct);
      return sendJson(res, 200, { ok: true, token: s.token, expires_at: s.expires_at });
    }

    // 계정 관리 (대표만, 2차 인증을 켠 경우에만)
    if (!twoFactor) return sendJson(res, 403, { error: '2차 인증이 꺼져 있어서 계정 관리를 쓸 수 없어요.' });
    const m = p.match(/^\/admin\/accounts(?:\/([A-Za-z0-9_.-]+)(\/reset)?)?$/);
    if (!m) return sendJson(res, 404, { error: 'Not found' });
    if (me.role !== 'owner') return sendJson(res, 403, { error: '대표 계정만 쓸 수 있어요.' });

    if (!m[1] && method === 'GET') return sendJson(res, 200, { data: [findAccount(ownerUser), ...load().filter((a) => a.role === 'staff')].map(publicAccount) });

    if (!m[1] && method === 'POST') {
      const b = await body();
      if (!b) return sendJson(res, 400, { error: '잘못된 요청입니다.' });
      const name = String(b.username || '').trim();
      if (!/^[A-Za-z0-9_.-]{3,24}$/.test(name)) return sendJson(res, 400, { error: '아이디는 영문·숫자·_ . - 3~24자로 만들어 주세요.' });
      if (name.toLowerCase() === ownerKey || findAccount(name)) return sendJson(res, 400, { error: '이미 있는 아이디예요.' });
      if (String(b.password || '').length < 10) return sendJson(res, 400, { error: '임시 비밀번호는 10자 이상이어야 해요.' });
      if (load().length >= MAX_ACCOUNTS) return sendJson(res, 400, { error: '계정을 더 만들 수 없어요.' });
      const acct = { username: name, role: 'staff', pw_hash: hashPassword(String(b.password)), totp_secret: null, backup_hashes: [], token_version: 0, must_change_pw: true, created_at: Date.now() };
      load().push(acct);
      save();
      return sendJson(res, 201, publicAccount(acct));
    }

    const target = m[1] && load().find((a) => a.role === 'staff' && a.username.toLowerCase() === m[1].toLowerCase());
    if (m[1] && !target) return sendJson(res, 404, { error: '직원 계정을 찾을 수 없어요.' });

    // 비밀번호·2차 인증 초기화 (휴대폰을 바꾸거나 잃어버렸을 때): 새 임시 비밀번호를 정하고, 다음 로그인에서 인증 앱을 다시 등록하게 한다
    if (m[1] && m[2] && method === 'POST') {
      const b = await body();
      if (!b || String(b.password || '').length < 10) return sendJson(res, 400, { error: '임시 비밀번호는 10자 이상이어야 해요.' });
      Object.assign(target, { pw_hash: hashPassword(String(b.password)), totp_secret: null, pending_secret: null, backup_hashes: [], must_change_pw: true, token_version: (target.token_version || 0) + 1 });
      save();
      return sendJson(res, 200, publicAccount(target));
    }

    if (m[1] && !m[2] && method === 'DELETE') {
      accounts = load().filter((a) => a !== target);
      save();
      res.writeHead(204);
      return res.end();
    }
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  return { isAuthorized, handle, enabled };
}

module.exports = { createAdminAuth, _test: { hotp, base32Encode, base32Decode, checkTotp } };
