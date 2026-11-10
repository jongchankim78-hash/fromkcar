/**
 * FROM K CAR — 관리자 페이지 로그인 게이트 (아이디·비밀번호 + 인증 앱 2차 인증)
 * 1) 아이디+비밀번호 → /admin/login   2) 인증 앱의 6자리 코드(처음이면 앱에 등록) → /admin/login/verify
 * 통과하면 서버가 서명한 12시간짜리 세션 토큰을 주고, 이후 모든 관리자 요청에는 이 토큰만 실어 보낸다 (비밀번호는 저장하지 않는다).
 */
(function () {
  const SESSION_KEY = 'fkcar_admin_session';

  const gate = document.getElementById('admin-login-gate');
  const content = document.getElementById('admin-content');
  const card = document.getElementById('admin-login-card');
  const form = document.getElementById('admin-login-form');
  const userInput = document.getElementById('admin-username-input');
  const passInput = document.getElementById('admin-password-input');
  const errorEl = document.getElementById('admin-login-error');
  const submitBtn = document.getElementById('admin-login-submit');
  const logoutBtn = document.getElementById('admin-logout-btn');
  const step2 = document.getElementById('admin-gate-step2');
  const intro = document.getElementById('admin-login-intro');

  let lastPassword = ''; // 임시 비밀번호를 바꿀 때 "현재 비밀번호"로 쓰기 위해 로그인하는 동안만 메모리에 둔다

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function tokenPayload(t) {
    try { return JSON.parse(atob(String(t).split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))); } catch (e) { return null; }
  }

  function readToken() {
    try { return localStorage.getItem(SESSION_KEY); } catch (e) { return null; }
  }

  function clearToken() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* 무시 */ }
  }

  function setToken(t) {
    try { localStorage.setItem(SESSION_KEY, t); } catch (e) { /* 저장 못 하면 이 탭에서만 유지 */ memoryToken = t; }
  }
  let memoryToken = null;

  // 만료된 토큰은 없는 것으로 친다
  function getToken() {
    const t = readToken() || memoryToken;
    if (!t) return null;
    const p = tokenPayload(t);
    if (!p || p.exp <= Date.now()) { clearToken(); memoryToken = null; return null; }
    return t;
  }

  function info() {
    const p = tokenPayload(getToken());
    return p ? { username: p.u, role: p.r, expires_at: p.exp } : null;
  }

  function showContent() {
    // 관리자가 사이트를 둘러본 방문이 리포트 숫자에 섞이지 않도록 이 브라우저는 집계에서 제외한다 (js/track.js).
    try { localStorage.setItem('fkcar_admin', '1'); } catch (e) { /* 무시 */ }
    gate.classList.add('hidden');
    content.classList.remove('hidden');
  }

  function showGate() {
    content.classList.add('hidden');
    gate.classList.remove('hidden');
    showLoginForm();
    setTimeout(() => userInput && userInput.focus(), 50);
  }

  function showLoginForm() {
    step2.classList.add('hidden');
    step2.innerHTML = '';
    form.classList.remove('hidden');
    intro.classList.remove('hidden');
    passInput.value = '';
  }

  function showStep(html) {
    form.classList.add('hidden');
    intro.classList.add('hidden');
    step2.innerHTML = html;
    step2.classList.remove('hidden');
    const first = step2.querySelector('input');
    if (first) setTimeout(() => first.focus(), 50);
    const back = step2.querySelector('[data-back]');
    if (back) back.addEventListener('click', () => { lastPassword = ''; showLoginForm(); });
  }

  function shake() {
    if (!card) return;
    card.classList.add('shake');
    setTimeout(() => card.classList.remove('shake'), 400);
  }

  async function post(path, body, token) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }

  const inputCls = 'w-full px-4 py-3.5 rounded-xl bg-white/5 border border-white/15 text-white text-sm placeholder-white/30 focus:outline-none focus:border-[var(--fk-gold)] focus:ring-2 focus:ring-[var(--fk-gold)]/20';
  const errHtml = '<p data-err class="hidden text-xs text-red-400 mb-2"></p>';
  const backLink = '<button type="button" data-back class="block w-full text-center text-white/40 text-xs mt-4 hover:text-white/70"><i class="fa-solid fa-arrow-left mr-1"></i>처음으로</button>';

  function showErr(msg) {
    const el = step2.querySelector('[data-err]');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    shake();
  }

  /* ---- 2단계: 코드 입력 / 처음이면 인증 앱 등록 ---- */
  function renderCodeStep(data) {
    const enroll = data.step === 'enroll';
    let qr = '';
    if (enroll) {
      try {
        const q = window.qrcode(0, 'M');
        q.addData(data.otpauth);
        q.make();
        qr = `<div class="bg-white rounded-xl p-2 mx-auto w-fit mb-3">${q.createSvgTag({ cellSize: 4, margin: 1, scalable: true }).replace('<svg', '<svg style="width:170px;height:170px"')}</div>`;
      } catch (e) { qr = ''; }
    }
    showStep(`
      <h3 class="text-white font-bold text-base mb-1">${enroll ? '인증 앱 등록 (처음 한 번)' : '2차 인증'}</h3>
      ${enroll ? `<ol class="text-white/60 text-xs mb-3 list-decimal pl-4 space-y-0.5">
        <li>휴대폰에서 <b class="text-white/80">Google Authenticator</b>(또는 Microsoft Authenticator, Authy)를 엽니다.</li>
        <li>＋ 버튼 → <b class="text-white/80">QR 코드 스캔</b>으로 아래 QR을 찍으세요.</li>
        <li>QR이 안 되면 <b class="text-white/80">설정 키 입력</b>으로 아래 키를 넣으세요.</li>
        <li>앱에 나온 6자리 숫자를 입력합니다.</li></ol>
        ${qr}
        <p class="text-center text-[11px] text-white/40 mb-3 break-all select-all font-mono">${esc(data.secret.replace(/(.{4})/g, '$1 ').trim())}</p>`
        : '<p class="text-white/50 text-xs mb-4">인증 앱에 표시된 6자리 숫자를 입력해 주세요. 휴대폰이 없으면 백업 코드를 입력할 수 있어요.</p>'}
      <form data-code-form class="space-y-3">
        <input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="12" required placeholder="${enroll ? '6자리 숫자' : '6자리 숫자 또는 백업 코드'}"
          class="${inputCls} text-center tracking-[0.3em] text-lg font-bold">
        ${errHtml}
        <button type="submit" class="w-full btn-primary !justify-center flex items-center"><i class="fa-solid fa-shield-halved mr-2"></i>${enroll ? '등록하고 입장' : '확인'}</button>
      </form>${backLink}`);
    const f = step2.querySelector('[data-code-form]');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = f.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        const r = await post('admin/login/verify', { challenge: data.challenge, code: f.code.value });
        if (!r.ok) {
          if (r.data.restart) { showLoginForm(); errorEl.textContent = r.data.error; errorEl.classList.remove('hidden'); return; }
          showErr(r.data.error || '인증에 실패했습니다.');
          f.code.value = '';
          f.code.focus();
          return;
        }
        setToken(r.data.token);
        if (r.data.backup_codes) renderBackupStep(r.data);
        else afterLogin(r.data);
      } catch (err) {
        showErr('서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');
      } finally {
        btn.disabled = false;
      }
    });
  }

  /* ---- 백업 코드 (등록 직후 한 번만 보여준다) ---- */
  function renderBackupStep(data) {
    showStep(`
      <h3 class="text-white font-bold text-base mb-1"><i class="fa-solid fa-triangle-exclamation text-[var(--fk-gold)] mr-1.5"></i>백업 코드를 저장해 두세요</h3>
      <p class="text-white/50 text-xs mb-3">휴대폰을 잃어버리거나 앱을 쓸 수 없을 때, 코드 한 개로 한 번 로그인할 수 있어요. <b class="text-white/80">이 화면은 다시 볼 수 없어요.</b> 캡처하거나 안전한 곳에 적어 두세요.</p>
      <div class="grid grid-cols-2 gap-2 mb-3 font-mono text-sm text-white select-all">${data.backup_codes.map((c) => `<div class="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-center">${esc(c)}</div>`).join('')}</div>
      <button type="button" data-copy class="w-full btn-secondary !bg-white/10 !text-white !border-white/20 !justify-center flex items-center mb-2"><i class="fa-regular fa-copy mr-2"></i>코드 복사</button>
      <label class="flex items-center gap-2 text-white/70 text-xs mb-3"><input type="checkbox" data-saved> 백업 코드를 안전하게 저장했어요</label>
      <button type="button" data-go disabled class="w-full btn-primary !justify-center flex items-center disabled:opacity-40"><i class="fa-solid fa-unlock mr-2"></i>입장하기</button>`);
    const go = step2.querySelector('[data-go]');
    step2.querySelector('[data-saved]').addEventListener('change', (e) => { go.disabled = !e.target.checked; });
    step2.querySelector('[data-copy]').addEventListener('click', () => {
      try { navigator.clipboard.writeText(data.backup_codes.join('\n')); step2.querySelector('[data-copy]').textContent = '복사했어요'; } catch (e) { /* 무시 */ }
    });
    go.addEventListener('click', () => afterLogin(data));
  }

  /* ---- 임시 비밀번호로 들어온 직원은 비밀번호부터 바꾼다 ---- */
  function renderPasswordStep() {
    const needOld = !lastPassword; // 새로고침 등으로 방금 입력한 비밀번호가 없으면 현재(임시) 비밀번호를 다시 받는다
    showStep(`
      <h3 class="text-white font-bold text-base mb-1">새 비밀번호 설정</h3>
      <p class="text-white/50 text-xs mb-4">임시 비밀번호로 로그인했어요. 본인만 아는 비밀번호로 바꿔 주세요. (10자 이상)</p>
      <form data-pw-form class="space-y-3">
        ${needOld ? `<input name="op" type="password" autocomplete="current-password" required placeholder="현재(임시) 비밀번호" class="${inputCls}">` : ''}
        <input name="np" type="password" autocomplete="new-password" minlength="10" required placeholder="새 비밀번호 (10자 이상)" class="${inputCls}">
        <input name="np2" type="password" autocomplete="new-password" minlength="10" required placeholder="새 비밀번호 확인" class="${inputCls}">
        ${errHtml}
        <button type="submit" class="w-full btn-primary !justify-center flex items-center"><i class="fa-solid fa-check mr-2"></i>변경하고 입장</button>
      </form>`);
    const f = step2.querySelector('[data-pw-form]');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (f.np.value !== f.np2.value) return showErr('새 비밀번호가 서로 달라요.');
      const r = await post('admin/password', { old_password: f.op ? f.op.value : lastPassword, new_password: f.np.value }, getToken());
      if (!r.ok) return showErr(r.data.error || '변경하지 못했어요.');
      setToken(r.data.token);
      finish();
    });
  }

  function afterLogin(data) {
    if (data.must_change_pw) renderPasswordStep();
    else finish();
  }

  function finish() {
    lastPassword = '';
    passInput.value = '';
    userInput.value = '';
    errorEl.classList.add('hidden');
    showLoginForm();
    showContent();
    document.dispatchEvent(new CustomEvent('adminlogin'));
  }

  /* ---- 1단계: 아이디 + 비밀번호 ---- */
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      submitBtn.disabled = true;
      try {
        const r = await post('admin/login', { username: userInput.value, password: passInput.value });
        if (!r.ok) {
          errorEl.innerHTML = `<i class="fa-solid fa-circle-exclamation mr-1"></i>${esc(r.data.error || '로그인에 실패했습니다.')}`;
          errorEl.classList.remove('hidden');
          passInput.value = '';
          passInput.focus();
          shake();
          return;
        }
        errorEl.classList.add('hidden');
        lastPassword = passInput.value;
        renderCodeStep(r.data);
      } catch (err) {
        errorEl.textContent = '서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.';
        errorEl.classList.remove('hidden');
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      clearToken();
      memoryToken = null;
      showGate();
    });
  }

  /* ---- 이미 로그인된 세션이 있으면 바로 들어가되, 서버에서 한 번 확인한다 ---- */
  if (getToken()) {
    showContent();
    fetch('admin/session', { headers: { Authorization: 'Bearer ' + getToken() } })
      .then(async (res) => {
        if (!res.ok) { clearToken(); showGate(); return; }
        const s = await res.json();
        if (s.must_change_pw) { gate.classList.remove('hidden'); renderPasswordStep(); }
      })
      .catch(() => { /* 네트워크 문제면 그대로 둔다 (요청마다 서버가 다시 검사한다) */ });
  } else {
    showGate();
  }

  window.KCarAuth = { getToken, clearToken, setToken, showGate, info };
})();
