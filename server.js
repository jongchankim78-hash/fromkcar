/**
 * FROM K CAR — 로컬 백엔드 서버
 * 정적 파일(index.html/admin.html/css/js/images)을 서빙하고,
 * js/api.js가 호출하는 tables/car_listings REST API를 JSON 파일 저장소로 구현한다.
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { URL } = require('url');
const { scrapeKbListing, parsePastedKbHtml } = require('./kb-scraper');
const { createStats } = require('./stats');
const KCarKo = require('./js/korean-name.js');

const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const stats = createStats(DATA_DIR);
const DATA_FILE = path.join(DATA_DIR, 'car_listings.json');
// 관리자가 직접 업로드한 매물 사진 저장 위치. 영구 디스크(DATA_DIR) 안에 둬야
// 배포할 때마다 새로 받아오는 리포지토리 코드(images/ 등)와 달리 데이터가 살아남는다.
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const PORT = process.env.PORT || 8080;

// 매물 등록/수정/삭제(POST/PATCH/DELETE)를 지키는 서버 측 인증.
// admin.html 자체는 정적 파일이라 누구나 열람 가능하지만, 실제 데이터 변경은 여기서 막힌다.
// admin.html의 로그인 화면(아이디+비번)이 이 값과 대조해 세션을 발급한다 (/admin/verify).
// 배포 시 반드시 ADMIN_USER / ADMIN_PASSWORD 환경변수를 설정해서 기본값을 덮어쓸 것.
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '4887asdf';

// 새 매물이 등록될 때 텔레그램 채널(@fromkcar)에 자동으로 소개글을 올리는 데 쓰는 봇 정보.
// 둘 다 설정 안 하면 조용히 건너뛴다 (로컬 개발 환경에서 굳이 필요 없음).
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHANNEL = process.env.TELEGRAM_CHANNEL || '@from_k_car';
const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://www.fromkcar.kr';

function isAuthorized(req) {
  const header = req.headers['authorization'] || '';
  if (!header.startsWith('Basic ')) return false;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf-8');
  const sepIdx = decoded.indexOf(':');
  if (sepIdx === -1) return false;
  const user = decoded.slice(0, sepIdx);
  const pass = decoded.slice(sepIdx + 1);
  return user === ADMIN_USER && pass === ADMIN_PASSWORD;
}

function requireAuth(req, res) {
  if (isAuthorized(req)) return true;
  // WWW-Authenticate를 보내지 않아야 브라우저 네이티브 Basic Auth 팝업이 뜨지 않는다.
  // 인증은 admin.html의 자체 로그인 화면(아이디+비번) 하나로만 이뤄지도록 한다.
  res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Authentication required');
  return false;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp'
};

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf-8');
}

const TOPICS_FILE = path.join(DATA_DIR, 'blog_topics.json');

function readTopicDone() {
  try {
    return JSON.parse(fs.readFileSync(TOPICS_FILE, 'utf-8')).done || {};
  } catch (e) {
    return {};
  }
}

function writeTopicDone(done) {
  ensureDataFile();
  fs.writeFileSync(TOPICS_FILE, JSON.stringify({ done }), 'utf-8');
}

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function readListings() {
  ensureDataFile();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8') || '[]');
  } catch (e) {
    return [];
  }
}

function writeListings(list) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf-8');
}

// 매물마다 고객 문의용으로 참조할 수 있는 고정 일련번호(listing_no)를 부여한다.
// 삭제되어도 번호가 재사용되지 않도록, 등록된 적 있는 모든 매물(soft-delete 포함) 중 최댓값 기준으로 다음 번호를 매긴다.
function nextListingNo(list) {
  const max = list.reduce((m, c) => Math.max(m, c.listing_no || 0), 0);
  return max + 1;
}

function migrateListingNumbers() {
  const list = readListings();
  const missing = list.filter((c) => !c.listing_no).sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
  if (missing.length === 0) return;
  let next = nextListingNo(list);
  missing.forEach((c) => { c.listing_no = next++; });
  writeListings(list);
}

// 매물 노출 순서(display_order, 오름차순 = 먼저 노출). 관리자가 목록에서 위/아래로
// 옮기면 인접한 매물과 이 값을 맞바꾼다. 새 매물은 가장 작은 값보다 하나 작게 받아
// 기본적으로 맨 앞에 노출된다 (기존 "최근 등록순"과 동일한 체감).
function nextDisplayOrder(list) {
  const min = list.reduce((m, c) => Math.min(m, c.display_order ?? Infinity), Infinity);
  return (min === Infinity ? 0 : min) - 1;
}

function migrateDisplayOrder() {
  const list = readListings();
  const hasAny = list.some((c) => c.display_order !== undefined && c.display_order !== null);
  if (hasAny) {
    // 일부만 순서가 있는 상태(부분 마이그레이션 이후 새로 생긴 매물 등) - 빠진 것만 맨 뒤로 보낸다.
    const missing = list.filter((c) => c.display_order === undefined || c.display_order === null)
      .sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
    if (missing.length === 0) return;
    let max = list.reduce((m, c) => Math.max(m, c.display_order ?? -Infinity), -Infinity);
    missing.forEach((c) => { c.display_order = ++max; });
  } else {
    if (list.length === 0) return;
    // 처음 도입 - 기존 "최근 등록순"(created_at desc)과 동일한 순서로 초기화한다.
    const sorted = [...list].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    sorted.forEach((c, i) => { c.display_order = i; });
  }
  writeListings(list);
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload)
  });
  res.end(payload);
}

function readRequestBody(req, maxSize = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxSize) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sortListings(list, sort) {
  const sorted = [...list];
  switch (sort) {
    case 'price_asc':
      sorted.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
      break;
    case 'price_desc':
      sorted.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity));
      break;
    case 'mileage_asc':
      sorted.sort((a, b) => (a.mileage ?? Infinity) - (b.mileage ?? Infinity));
      break;
    case 'year_desc':
      sorted.sort((a, b) => String(b.year_info || '').localeCompare(String(a.year_info || '')));
      break;
    case 'registered_asc':
      sorted.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
      break;
    case 'registered_desc':
    default:
      // 관리자가 목록에서 직접 조정할 수 있는 노출 순서(오름차순 = 먼저 노출).
      sorted.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
      break;
  }
  return sorted;
}

function telegramApiCall(method, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TELEGRAM_BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// 새 매물이 등록되면 텔레그램 채널에 소개글(+대표사진)을 자동으로 올린다.
// 등록 응답을 늦추지 않도록 호출부에서 await 없이 fire-and-forget으로 부른다.
// 구글 번역 비공식 엔드포인트(프론트엔드 on-demand 번역과 동일한 방식)로 소개글만 번역한다.
// 연식/지역처럼 압축된 한글 표기는 번역이 엉뚱하게 나오는 경우가 많아 대상에서 제외한다(js/main.js와 동일 원칙).
function translateText(text, targetLang) {
  return new Promise((resolve, reject) => {
    if (!text) return resolve('');
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ko&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    https.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          resolve((data[0] || []).map((seg) => seg[0]).join(''));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// --- 환율 (매물 가격 옆에 달러 환산가를 보여주기 위한 원/달러 기준환율) ---------------------------------
// 무료 공개 환율 API에서 3시간마다 한 번만 받아 서버에 보관한다 (방문자마다 외부 API를 부르지 않도록).
// 1순위 Frankfurter(유럽중앙은행 기준환율, 영업일 하루 한 번 갱신), 실패하면 open.er-api.com. 둘 다 실패하면 마지막 값을 계속 쓴다.
const FX_TTL_MS = 3 * 60 * 60 * 1000;
let fxCache = { rate: null, date: null, source: '', fetchedAt: 0 };
let fxInFlight = null;

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 8000, headers: { 'user-agent': 'fromkcar-fx/1.0' } }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

async function refreshFx() {
  const sources = [
    ['frankfurter', 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=KRW', (d) => ({ rate: d.rates && d.rates.KRW, date: d.date })],
    ['open.er-api', 'https://open.er-api.com/v6/latest/USD', (d) => ({
      rate: d.rates && d.rates.KRW,
      date: d.time_last_update_utc ? new Date(d.time_last_update_utc).toISOString().slice(0, 10) : null
    })]
  ];
  for (const [name, url, pick] of sources) {
    try {
      const { rate, date } = pick(await httpsGetJson(url));
      // 비정상 값(0, 문자열, 터무니없는 숫자)은 버린다
      if (Number(rate) > 500 && Number(rate) < 5000) {
        fxCache = { rate: Number(rate), date: date || null, source: name, fetchedAt: Date.now() };
        return fxCache;
      }
    } catch (e) {
      console.error(`[fx] ${name} failed:`, e.message);
    }
  }
  return fxCache;
}

async function getFx() {
  if (fxCache.rate && Date.now() - fxCache.fetchedAt < FX_TTL_MS) return fxCache;
  if (!fxInFlight) fxInFlight = refreshFx().finally(() => { fxInFlight = null; });
  return fxInFlight;
}

// --- 관리자 "내 주제로 정보성 글 만들기" (Claude API) -----------------------------------------
// ANTHROPIC_API_KEY 환경변수가 있을 때만 동작한다. 키는 서버에만 있고 브라우저로 나가지 않는다.
// 이 서버는 의존 패키지 없이 Node 내장 모듈만 쓰고 Render 빌드 명령도 비어 있어서(텔레그램/번역 호출과 같은 방식으로)
// SDK 대신 내장 https로 Messages API를 직접 호출한다.
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';
let articleInFlight = false;

const ARTICLE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'intro', 'sections', 'faq', 'closing', 'tags'],
  properties: {
    title: { type: 'string' },
    intro: { type: 'array', items: { type: 'string' } },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['heading', 'paragraphs', 'points'],
        properties: {
          heading: { type: 'string' },
          paragraphs: { type: 'array', items: { type: 'string' } },
          points: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['label', 'text'],
              properties: { label: { type: 'string' }, text: { type: 'string' } }
            }
          }
        }
      }
    },
    faq: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['q', 'a'],
        properties: { q: { type: 'string' }, a: { type: 'string' } }
      }
    },
    closing: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } }
  }
};

const ARTICLE_SYSTEM_PROMPT = `당신은 경기도 수원의 중고차 판매·수출 업체 "프롬케이카(FROM K CAR)"의 네이버 블로그 글을 쓰는 한국어 카피라이터입니다.
업체 정보: 수원 SKV1모터스에 있는 중고차 판매·수출 업체이며 담당자는 김종찬 팀장입니다. 국내 판매와 함께 러시아·몽골·우즈베키스탄 등으로 중고차 수출도 합니다.

글쓰기 규칙
- 독자는 네이버·구글에서 한국어로 중고차 관련 정보를 검색하는 일반 고객입니다. 존댓말, 쉽고 친근한 설명체로 씁니다.
- 본문은 공백 제외 1,600~2,200자 분량입니다.
- 제목은 40자 이내, 검색어가 되는 핵심 키워드를 맨 앞에 둡니다.
- 첫 문단(intro의 첫 항목)의 150자 안에 핵심 키워드를 자연스럽게 넣고, "수원"도 한 번 언급합니다.
- 소제목(sections)은 4~6개이며 검색어 변형이 자연스럽게 들어가게 짓습니다. 각 섹션은 짧은 문단 1~3개와, 필요하면 항목(points: 굵게 보일 짧은 라벨 + 설명)으로 구성합니다. 항목이 필요 없는 섹션은 points를 빈 배열로 둡니다.
- 자주 묻는 질문(faq)은 3~4개, 실제 고객이 물을 법한 질문과 간결한 답변입니다.
- 핵심 키워드는 본문에서 3~7번만 자연스럽게 반복합니다. 억지로 반복하지 않습니다.
- tags는 네이버 블로그 태그로 쓸 검색어 8~10개이며 '#' 없이 띄어쓰기 없는 한글 위주 단어로 씁니다.

정직성 규칙 (매우 중요)
- 확인할 수 없는 통계, 수치, 가격, 시세, 법 조항 번호, 날짜, 제도 세부 내용을 지어내지 않습니다. 확실하지 않으면 "일반적으로", "경우에 따라 다를 수 있으니 확인이 필요합니다"처럼 표현합니다.
- 실제로 있지 않은 고객 후기나 "제가 직접 겪은 사례"를 지어내지 않습니다.
- "최고", "100%", "무조건", "보장" 같은 과장·단정 표현을 쓰지 않습니다. 의료·법률 조언처럼 보이는 단정도 피합니다.
- 업체가 하지 않는다고 확인되지 않은 서비스(보증, 배송, 할부 등)를 한다고 쓰지 않습니다.
- 연락처, 주소, 전화번호, URL, 매물 정보는 쓰지 않습니다. (프로그램이 글 끝에 따로 붙입니다.)
- 마크다운 문법(#, **, - 목록)을 쓰지 않습니다. 순수한 문장만 씁니다.`;

function callClaudeArticle(topic, notes) {
  return new Promise((resolve, reject) => {
    const userText = `다음 주제로 네이버 블로그 정보성 글을 작성해 주세요.\n\n주제: ${topic}\n${notes ? `\n사장님이 추가로 요청한 내용(꼭 반영):\n${notes}\n` : ''}\n지정된 JSON 형식으로만 답하세요.`;
    const payload = JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 12000,
      system: ARTICLE_SYSTEM_PROMPT,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: ARTICLE_SCHEMA } },
      messages: [{ role: 'user', content: userText }]
    });
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2026-10-21',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload)
      },
      timeout: 120000
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        let data;
        try { data = JSON.parse(body); } catch (e) { return reject(new Error(`Claude 응답을 읽지 못했습니다 (HTTP ${res.statusCode})`)); }
        if (res.statusCode !== 200) {
          const err = new Error((data.error && data.error.message) || `Claude API 오류 (HTTP ${res.statusCode})`);
          err.status = res.statusCode;
          return reject(err);
        }
        if (data.stop_reason === 'refusal') return reject(new Error('Claude가 이 주제로는 글을 쓰지 않았어요. 주제를 바꿔 보세요.'));
        if (data.stop_reason === 'max_tokens') return reject(new Error('글이 너무 길어져 중간에 끊겼어요. 주제를 좁혀서 다시 시도해 주세요.'));
        const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
        try {
          resolve(JSON.parse(text));
        } catch (e) {
          reject(new Error('Claude가 보낸 글의 형식이 올바르지 않았어요. 다시 시도해 주세요.'));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Claude 응답이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요.')));
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function notifyTelegramNewListing(car) {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    const mileageText = car.mileage ? `${Number(car.mileage).toLocaleString('ko-KR')}km` : '';
    const titleLine = `${car.title || ''}${car.listing_no ? ` (No.${car.listing_no})` : ''}`;
    const specLine = [car.price_display && `💰 ${car.price_display}`, car.year_info && `📅 ${car.year_info}`, mileageText && `🛣 ${mileageText}`, car.region && `📍 ${car.region}`]
      .filter(Boolean).join(' · ');

    const headerLines = [titleLine];
    if (specLine) headerLines.push(specLine);
    const header = headerLines.join('\n');

    const descLines = [];
    if (car.description_ko) {
      let descRu = car.description_ru || '';
      let descMn = car.description_mn || '';
      let descEn = '';
      try {
        const [ru, mn, en] = await Promise.all([
          descRu ? Promise.resolve(descRu) : translateText(car.description_ko, 'ru'),
          descMn ? Promise.resolve(descMn) : translateText(car.description_ko, 'mn'),
          translateText(car.description_ko, 'en')
        ]);
        descRu = ru;
        descMn = mn;
        descEn = en;
      } catch (e) {
        console.error('Telegram description translate failed:', e.message);
      }
      descLines.push('', `🇰🇷 ${car.description_ko}`);
      if (descRu) descLines.push('', `🇷🇺 ${descRu}`);
      if (descMn) descLines.push('', `🇲🇳 ${descMn}`);
      if (descEn) descLines.push('', `🇬🇧 ${descEn}`);
    }
    const descBlock = descLines.join('\n');

    // 항상 붙는 하단 판매자 연락처. 길이 제한에 걸려도 이 부분은 절대 잘리지 않도록
    // 소개글 쪽만 줄여서 맞춘다.
    const footer = [
      '',
      `${SITE_ORIGIN}/car/${car.id}`,
      '',
      '📞 차량 구입문의: 김종찬 팀장 010-7449-8282',
      '✈️ Telegram: @fromkcar'
    ].join('\n');

    const image = absoluteImageUrl(car.main_image || (Array.isArray(car.images) ? car.images[0] : null));
    const maxLen = image ? 1024 : 4096;

    let caption = header + descBlock + footer;
    if (caption.length > maxLen) {
      const budget = maxLen - header.length - footer.length - 1; // '…' 자리
      const trimmedDesc = budget > 0 ? descBlock.slice(0, budget) + '…' : '';
      caption = header + trimmedDesc + footer;
    }

    let result;
    if (image) {
      result = await telegramApiCall('sendPhoto', { chat_id: TELEGRAM_CHANNEL, photo: image, caption });
    } else {
      result = await telegramApiCall('sendMessage', { chat_id: TELEGRAM_CHANNEL, text: caption });
    }
    if (result.status >= 400) {
      console.error('Telegram notify failed:', result.status, result.body);
    }
  } catch (e) {
    console.error('Telegram notify failed:', e.message);
  }
}

async function handleTablesApi(req, res, urlObj, idFromPath) {
  const method = req.method;

  if (method === 'GET' && !idFromPath) {
    const params = urlObj.searchParams;
    const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
    const limit = Math.max(1, parseInt(params.get('limit') || '100', 10) || 100);
    const search = (params.get('search') || '').trim().toLowerCase();
    const sort = params.get('sort') || '';

    let list = readListings().filter((c) => !c.deleted);
    if (search) {
      list = list.filter((c) => {
        const hay = [c.title, c.title_ko, KCarKo.koName(c), c.region, c.car_number, c.brand].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(search);
      });
    }
    list = sortListings(list, sort);

    const total = list.length;
    const start = (page - 1) * limit;
    const pageItems = list.slice(start, start + limit);

    return sendJson(res, 200, { data: pageItems, total, page, limit });
  }

  if (method === 'GET' && idFromPath) {
    const item = readListings().find((c) => c.id === idFromPath && !c.deleted);
    if (!item) return sendJson(res, 404, { error: 'Not found' });
    return sendJson(res, 200, item);
  }

  if (method === 'POST' && !idFromPath) {
    if (!requireAuth(req, res)) return;
    let body;
    try {
      body = await readRequestBody(req);
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
    const list = readListings();
    const now = Date.now();
    const item = {
      id: crypto.randomUUID(),
      ...body,
      listing_no: nextListingNo(list),
      display_order: nextDisplayOrder(list),
      created_at: now,
      updated_at: now,
      deleted: false
    };
    list.push(item);
    writeListings(list);
    notifyTelegramNewListing(item).catch(() => {});
    enqueueLocalize(item.id);
    return sendJson(res, 201, item);
  }

  if (method === 'PATCH' && idFromPath) {
    if (!requireAuth(req, res)) return;
    let body;
    try {
      body = await readRequestBody(req);
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
    const list = readListings();
    const idx = list.findIndex((c) => c.id === idFromPath);
    if (idx === -1) return sendJson(res, 404, { error: 'Not found' });
    list[idx] = { ...list[idx], ...body, id: idFromPath, updated_at: Date.now() };
    writeListings(list);
    // "원본에서 다시 불러오기" 후 저장하면 사진이 외부 주소로 되돌아오므로, 사진이 바뀐 수정은 다시 내재화한다.
    if (body.images !== undefined || body.main_image !== undefined) enqueueLocalize(idFromPath);
    return sendJson(res, 200, list[idx]);
  }

  if (method === 'DELETE' && idFromPath) {
    if (!requireAuth(req, res)) return;
    const list = readListings();
    const idx = list.findIndex((c) => c.id === idFromPath);
    if (idx === -1) return sendJson(res, 404, { error: 'Not found' });
    list.splice(idx, 1);
    writeListings(list);
    res.writeHead(204);
    return res.end();
  }

  return sendJson(res, 405, { error: 'Method not allowed' });
}

function escapeAttr(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function replaceMeta(html, pattern, replacement) {
  return pattern.test(html) ? html.replace(pattern, () => replacement) : html;
}

// 언어별 주소: 한국어는 기존 그대로("/", "/car/:id"), 나머지는 "/ru", "/mn", "/en" 접두사를 붙인다.
// 번역은 브라우저에서만 일어나서 검색엔진에는 한국어 페이지 하나로만 보이므로,
// 언어마다 따로 주소와 제목/설명(<head>)을 서버가 만들어 내려준다.
const SITE_LANGS = ['ko', 'ru', 'mn', 'en'];
const LANG_HEAD = {
  ko: {
    locale: 'ko_KR',
    homeTitle: 'FROM K CAR — Korean Used Cars Export (BMW · Benz · Volvo) | 한국 중고차 수출',
    homeDescription: '한국 중고차 수출 전문 FROM K CAR. BMW, Mercedes-Benz, Volvo 등 검증된 무사고·무도색 매물을 러시아·몽골·우즈베키스탄으로 수출합니다. Korean used cars for export to Russia, Mongolia & Uzbekistan.',
    carSuffix: 'FROM K CAR',
    carTagline: '한국 중고차 수출 FROM K CAR'
  },
  ru: {
    locale: 'ru_RU',
    homeTitle: 'FROM K CAR — Автомобили из Кореи на экспорт | BMW, Mercedes-Benz, Volvo',
    homeDescription: 'Экспорт подержанных автомобилей из Южной Кореи в Россию, Монголию и Узбекистан. BMW, Mercedes-Benz, Volvo — проверенные автомобили без ДТП и окраса, помощь с оформлением и доставкой.',
    carSuffix: 'Авто из Кореи | FROM K CAR',
    carTagline: 'Экспорт автомобилей из Кореи FROM K CAR'
  },
  mn: {
    locale: 'mn_MN',
    homeTitle: 'FROM K CAR — Солонгосоос машин экспортлох | BMW, Mercedes-Benz, Volvo',
    homeDescription: 'Өмнөд Солонгосоос Орос, Монгол, Узбекистан руу хэрэглэгдсэн машин экспортлоно. BMW, Mercedes-Benz, Volvo — ослын түүхгүй, будаггүй, шалгагдсан машинууд.',
    carSuffix: 'Солонгос машин | FROM K CAR',
    carTagline: 'Солонгосоос машин экспортлох FROM K CAR'
  },
  en: {
    locale: 'en_US',
    homeTitle: 'FROM K CAR — Korean Used Cars Export | BMW, Mercedes-Benz, Volvo',
    homeDescription: 'Export of used cars from South Korea to Russia, Mongolia and Uzbekistan. Inspected BMW, Mercedes-Benz and Volvo with no accident and no paint history.',
    carSuffix: 'Korean used car export | FROM K CAR',
    carTagline: 'Korean used car export FROM K CAR'
  }
};

function langPath(lang, pagePath) {
  if (lang === 'ko') return pagePath;
  return pagePath === '/' ? `/${lang}` : `/${lang}${pagePath}`;
}

// index.html의 <head>를 해당 언어/페이지에 맞게 바꾼다 (제목, 설명, 대표 이미지, canonical, hreflang, og:locale).
function renderLocalizedPage(indexHtml, lang, pagePath, { title, description, image }) {
  const canonicalUrl = SITE_ORIGIN + langPath(lang, pagePath);
  const alternates = SITE_LANGS
    .map((l) => `<link rel="alternate" hreflang="${l}" href="${SITE_ORIGIN}${langPath(l, pagePath)}">`)
    .concat(`<link rel="alternate" hreflang="x-default" href="${SITE_ORIGIN}${langPath('ko', pagePath)}">`)
    .join('\n');
  const localeAlternates = SITE_LANGS.filter((l) => l !== lang)
    .map((l) => `<meta property="og:locale:alternate" content="${LANG_HEAD[l].locale}">`).join('\n');

  let html = indexHtml;
  html = html.replace(/<link rel="alternate" hreflang=".*?">\s*/g, '');
  html = html.replace(/<meta property="og:locale:alternate" content=".*?">\s*/g, '');
  html = replaceMeta(html, /<html lang=".*?">/, `<html lang="${lang}">`);
  html = replaceMeta(html, /<title>.*?<\/title>/s, `<title>${escapeAttr(title)}</title>`);
  html = replaceMeta(html, /<meta name="description" content=".*?">/s, `<meta name="description" content="${escapeAttr(description)}">`);
  html = replaceMeta(html, /<link rel="canonical" href=".*?">/s, `<link rel="canonical" href="${canonicalUrl}">\n${alternates}`);
  html = replaceMeta(html, /<meta property="og:title" content=".*?">/s, `<meta property="og:title" content="${escapeAttr(title)}">`);
  html = replaceMeta(html, /<meta property="og:description" content=".*?">/s, `<meta property="og:description" content="${escapeAttr(description)}">`);
  html = replaceMeta(html, /<meta property="og:image" content=".*?">/s, `<meta property="og:image" content="${escapeAttr(image)}">`);
  html = replaceMeta(html, /<meta property="og:url" content=".*?">/s, `<meta property="og:url" content="${canonicalUrl}">`);
  html = replaceMeta(html, /<meta property="og:locale" content=".*?">/s, `<meta property="og:locale" content="${LANG_HEAD[lang].locale}">\n${localeAlternates}`);
  html = replaceMeta(html, /<meta name="twitter:title" content=".*?">/s, `<meta name="twitter:title" content="${escapeAttr(title)}">`);
  html = replaceMeta(html, /<meta name="twitter:description" content=".*?">/s, `<meta name="twitter:description" content="${escapeAttr(description)}">`);
  html = replaceMeta(html, /<meta name="twitter:image" content=".*?">/s, `<meta name="twitter:image" content="${escapeAttr(image)}">`);
  return html;
}

// /ru, /mn, /en — 언어별 홈페이지
function handleLangHomePage(req, res, lang) {
  let indexHtml;
  try {
    indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf-8');
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Server error');
  }
  const head = LANG_HEAD[lang];
  const html = renderLocalizedPage(indexHtml, lang, '/', {
    title: head.homeTitle,
    description: head.homeDescription,
    image: `${SITE_ORIGIN}/images/og-image.png`
  });
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

// /car/:id (및 /ru|/mn|/en/car/:id) — 매물별 실제 og:title/description/image가 박힌 상세페이지를 서버에서 렌더링한다.
// (SPA 모달만으로는 크롤러/링크 미리보기가 특정 매물을 인식할 수 없어서 추가한 라우트)
function handleCarDetailPage(req, res, carId, lang = 'ko') {
  let indexHtml;
  try {
    indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf-8');
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Server error');
  }

  const car = readListings().find((c) => c.id === carId && !c.deleted);
  if (!car) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(indexHtml);
  }

  // 한국어가 아닌 페이지는 "8,590만원" 대신 원화 금액(₩85,900,000)으로 보여준다.
  const krw = car.price ? `₩${Number(car.price).toLocaleString('en-US')}` : '';
  const priceText = lang === 'ko'
    ? (car.price_display || (car.price ? `${Math.round(car.price / 10000).toLocaleString('ko-KR')}만원` : ''))
    : (krw || car.price_display || '');
  const head = LANG_HEAD[lang];
  // 한국어 페이지는 네이버·구글 한국어 검색에 맞춰 "한글 모델명 + 중고차"를 앞세운 제목/설명을 쓴다.
  const title = lang === 'ko'
    ? KCarKo.seoTitle(car)
    : `${car.title || 'FROM K CAR'} ${priceText}`.trim() + ` — ${head.carSuffix}`;
  const description = lang === 'ko'
    ? KCarKo.seoDescription(car)
    : `${car.title || ''} ${car.year_info || ''} ${priceText} · ${head.carTagline}`.replace(/\s+/g, ' ').trim();
  const image = absoluteImageUrl(car.main_image || (Array.isArray(car.images) ? car.images[0] : '')) || 'https://www.fromkcar.kr/images/og-image.png';

  const html = renderLocalizedPage(indexHtml, lang, `/car/${car.id}`, { title, description, image });

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

// --- 매물 이미지 일괄 ZIP 다운로드 -----------------------------------------
// 이미지가 외부 CDN(KB차차차)에 있으므로 서버가 각 URL을 내려받아 그 자리에서
// ZIP(비압축 지원 없이 zlib deflate만 사용하는 최소 구현)으로 묶어 스트리밍한다.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function dosDateTime(date) {
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() >> 1) & 0x1f);
  const dosDate = (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0xf) << 5) | (date.getDate() & 0x1f);
  return { time, dosDate };
}

function buildZip(entries) {
  const { time, dosDate } = dosDateTime(new Date());
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf-8');
    const crc = crc32(entry.data);
    const compressed = zlib.deflateRawSync(entry.data);
    const useStore = compressed.length >= entry.data.length;
    const method = useStore ? 0 : 8;
    const dataToWrite = useStore ? entry.data : compressed;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(dataToWrite.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localChunks.push(localHeader, nameBuf, dataToWrite);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(dataToWrite.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralChunks.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + dataToWrite.length;
  }

  const centralOffset = offset;
  const centralSize = centralChunks.reduce((sum, b) => sum + b.length, 0);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, ...centralChunks, end]);
}

function fetchBuffer(url, redirectsLeft = 3) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      return reject(new Error('Invalid image URL'));
    }
    const client = parsed.protocol === 'http:' ? http : https;
    const req = client.get(parsed, { timeout: 15000 }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirectsLeft > 0) {
        res.resume();
        return resolve(fetchBuffer(new URL(res.headers.location, parsed).toString(), redirectsLeft - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Image fetch failed: ${res.statusCode}`));
      }
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > 20 * 1024 * 1024) {
          req.destroy();
          reject(new Error('Image too large'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Image fetch timed out')));
    req.on('error', reject);
  });
}

// --- 외부 사진(KB차차차 CDN 등) 내재화 ------------------------------------
// 외부 주소 사진을 영구 디스크(data/uploads)로 내려받아 /uploads/... 주소로 바꿔 저장한다.
// 파일명을 원본 URL의 해시로 정해서, 같은 사진은 다시 받지 않고(재시도/재수집에도 안전) 그대로 재사용한다.
const ALLOWED_IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

function isExternalImage(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

// 텔레그램/OG 미리보기/카카오 공유처럼 사이트 밖에서 읽는 곳에는 절대 주소가 필요하다.
function absoluteImageUrl(url) {
  return typeof url === 'string' && url.startsWith('/') ? `${SITE_ORIGIN}${url}` : url;
}

function readImageBuffer(url) {
  if (typeof url === 'string' && url.startsWith('/uploads/')) {
    return fs.promises.readFile(path.join(UPLOADS_DIR, path.basename(url)));
  }
  return fetchBuffer(url);
}

async function localizeImage(url) {
  let ext = '.jpg';
  try {
    const e = path.extname(new URL(url).pathname).toLowerCase();
    if (ALLOWED_IMG_EXT.has(e)) ext = e;
  } catch (e) { /* keep default */ }
  const filename = crypto.createHash('sha1').update(url).digest('hex').slice(0, 24) + ext;
  const filePath = path.join(UPLOADS_DIR, filename);
  ensureUploadsDir();
  if (!fs.existsSync(filePath)) {
    const buf = await fetchBuffer(url);
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, filePath);
  }
  return `/uploads/${filename}`;
}

async function localizeCarImages(carId) {
  const car = readListings().find((c) => c.id === carId);
  if (!car) return;
  const urls = new Set([...(Array.isArray(car.images) ? car.images : []), car.main_image].filter(isExternalImage));
  if (urls.size === 0) return;

  const map = new Map();
  const pending = [...urls];
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (pending.length) {
      const u = pending.shift();
      try {
        map.set(u, await localizeImage(u));
      } catch (e) {
        // 실패한 사진은 원래 외부 주소를 그대로 두고, 다음 서버 시작 때 다시 시도한다.
        console.error(`[localize] ${carId} ${u}: ${e.message}`);
      }
    }
  }));
  if (map.size === 0) return;

  // 다운로드하는 동안 관리자가 수정했을 수 있으니, 저장 직전에 최신 데이터를 다시 읽어 사진 필드만 바꾼다.
  const list = readListings();
  const cur = list.find((c) => c.id === carId);
  if (!cur) return;
  const swap = (u) => map.get(u) || u;
  if (Array.isArray(cur.images)) cur.images = cur.images.map(swap);
  if (cur.main_image) cur.main_image = swap(cur.main_image);
  writeListings(list);
  console.log(`[localize] ${carId}: ${map.size}/${urls.size} photos stored locally`);
}

let localizeChain = Promise.resolve();
function enqueueLocalize(carId) {
  localizeChain = localizeChain
    .then(() => localizeCarImages(carId))
    .catch((e) => console.error('[localize]', e.message));
  return localizeChain;
}

function backfillLocalImages() {
  const ids = readListings()
    .filter((c) => !c.deleted && ((Array.isArray(c.images) && c.images.some(isExternalImage)) || isExternalImage(c.main_image)))
    .map((c) => c.id);
  if (ids.length === 0) return;
  console.log(`[localize] backfill start: ${ids.length} listings`);
  ids.forEach((id) => enqueueLocalize(id));
  localizeChain = localizeChain.then(() => console.log('[localize] backfill done'));
}

async function handleImagesZip(req, res, carId) {
  const car = readListings().find((c) => c.id === carId && !c.deleted);
  if (!car) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not Found');
  }

  const images = Array.isArray(car.images) && car.images.length
    ? car.images
    : (car.main_image ? [car.main_image] : []);
  if (!images.length) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('No images');
  }
  const limited = images.slice(0, 30);

  let entries;
  try {
    const buffers = await Promise.all(limited.map((url) => readImageBuffer(url)));
    entries = buffers.map((data, i) => {
      let ext = '.jpg';
      try {
        ext = (path.extname(new URL(limited[i], 'http://local').pathname) || '.jpg').toLowerCase();
      } catch (e) { /* keep default */ }
      return { name: `${String(i + 1).padStart(2, '0')}${ext}`, data };
    });
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Failed to fetch one or more images');
  }

  const zipBuffer = buildZip(entries);
  const asciiName = (car.title || 'images').replace(/[^\x00-\x7F]/g, '').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'images';
  const utf8Name = encodeURIComponent(`${car.title || car.id}_images.zip`);
  res.writeHead(200, {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${asciiName}.zip"; filename*=UTF-8''${utf8Name}`,
    'Content-Length': zipBuffer.length
  });
  res.end(zipBuffer);
}

function handleSitemap(req, res) {
  const cars = readListings().filter((c) => !c.deleted);
  // 페이지마다 4개 언어 주소를 모두 넣고, 서로를 hreflang으로 연결해 검색엔진이 언어별 페이지를 알아보게 한다.
  const pages = [
    { pagePath: '/', changefreq: 'daily', priority: '1.0' },
    ...cars.map((c) => ({
      pagePath: `/car/${c.id}`,
      changefreq: 'weekly',
      priority: '0.8',
      lastmod: new Date(c.updated_at || c.created_at || Date.now()).toISOString().slice(0, 10)
    }))
  ];
  const urls = [];
  pages.forEach((p) => {
    const links = SITE_LANGS
      .map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${SITE_ORIGIN}${langPath(l, p.pagePath)}"/>`)
      .concat(`    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE_ORIGIN}${langPath('ko', p.pagePath)}"/>`)
      .join('\n');
    SITE_LANGS.forEach((l) => urls.push({ ...p, loc: `${SITE_ORIGIN}${langPath(l, p.pagePath)}`, links }));
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.map((u) => `  <url>
    <loc>${u.loc}</loc>
${u.links}
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>\n    ` : ''}<changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;
  res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
  res.end(xml);
}

const UPLOAD_MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif'
};

// 관리자가 "직접 입력으로 추가"에서 올린 사진을 저장한다. 개수 제한은 없고,
// 요청 본문(base64) 크기만 넉넉히 30MB로 제한해 한 장씩 순차 업로드하는 클라이언트를 지원한다.
async function handleImageUpload(req, res) {
  if (!requireAuth(req, res)) return;
  let body;
  try {
    body = await readRequestBody(req, 30 * 1024 * 1024);
  } catch (e) {
    return sendJson(res, 400, { error: e.message || '업로드에 실패했습니다.' });
  }
  const dataUrl = body && body.dataUrl;
  const match = typeof dataUrl === 'string' && dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return sendJson(res, 400, { error: '이미지 데이터가 올바르지 않습니다.' });
  const ext = UPLOAD_MIME_EXT[match[1]] || '.jpg';
  const buffer = Buffer.from(match[2], 'base64');

  ensureUploadsDir();
  const filename = `${crypto.randomUUID()}${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
  return sendJson(res, 201, { url: `/uploads/${filename}` });
}

function serveUpload(req, res, filename) {
  ensureUploadsDir();
  const filePath = path.join(UPLOADS_DIR, path.basename(filename));
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not Found');
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
}

function serveStatic(req, res, urlObj) {
  let reqPath = decodeURIComponent(urlObj.pathname);
  if (reqPath === '/') reqPath = '/index.html';

  const filePath = path.normalize(path.join(ROOT_DIR, reqPath));
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  if (filePath === path.join(ROOT_DIR, 'server.js') || filePath === path.join(ROOT_DIR, 'kb-scraper.js') || filePath === path.join(ROOT_DIR, 'stats.js') || filePath.startsWith(DATA_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not Found');
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);

  if (urlObj.pathname === '/admin/verify' && req.method === 'POST') {
    let body;
    try {
      body = await readRequestBody(req);
    } catch (e) {
      return sendJson(res, 400, { ok: false });
    }
    const ok = !!body && body.username === ADMIN_USER && body.password === ADMIN_PASSWORD;
    return sendJson(res, ok ? 200 : 401, { ok });
  }

  // 원/달러 환율 (공개). 가져오지 못했으면 rate가 null이고, 화면은 달러 표기를 숨긴다.
  if (urlObj.pathname === '/api/fx' && req.method === 'GET') {
    const fx = await getFx();
    res.setHeader('Cache-Control', 'public, max-age=600');
    return sendJson(res, fx.rate ? 200 : 503, { rate: fx.rate, date: fx.date, source: fx.source });
  }

  // 방문/매물 조회/문의 클릭 집계. 브라우저의 sendBeacon이 보내며, 응답 내용은 필요 없다.
  if (urlObj.pathname === '/track' && req.method === 'POST') {
    try {
      const evt = await readRequestBody(req, 4096);
      const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
      stats.record(evt, { ua: req.headers['user-agent'] || '', ip: fwd || req.socket.remoteAddress || '' });
    } catch (e) {
      // 잘못된 요청은 무시
    }
    res.writeHead(204);
    return res.end();
  }

  // 정보성 블로그 글 주제별 "작성 완료" 기록 (어느 주제를 이미 썼는지 기억해서 새 주제를 계속 제안하는 데 쓴다)
  if (urlObj.pathname === '/admin/blog-topics') {
    if (!requireAuth(req, res)) return;
    if (req.method === 'GET') return sendJson(res, 200, { done: readTopicDone() });
    if (req.method === 'POST') {
      let body;
      try {
        body = await readRequestBody(req, 4096);
      } catch (e) {
        return sendJson(res, 400, { error: e.message });
      }
      const id = String((body && body.id) || '');
      if (!/^[\w:.\- 가-힣]{1,80}$/.test(id)) return sendJson(res, 400, { error: 'invalid topic id' });
      const done = readTopicDone();
      if (body.done) done[id] = Date.now();
      else delete done[id];
      writeTopicDone(done);
      return sendJson(res, 200, { done });
    }
  }

  // 관리자 "내 주제로 글 만들기": 입력한 주제로 Claude가 블로그 글(JSON)을 써서 돌려준다.
  // API 키가 없으면 503 + code NO_API_KEY → 화면에서 초안 뼈대로 대신한다.
  if (urlObj.pathname === '/admin/generate-article' && req.method === 'POST') {
    if (!requireAuth(req, res)) return;
    if (!ANTHROPIC_API_KEY) return sendJson(res, 503, { code: 'NO_API_KEY', error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' });
    let body;
    try {
      body = await readRequestBody(req, 8192);
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
    const topic = String((body && body.topic) || '').trim().slice(0, 100);
    const notes = String((body && body.notes) || '').trim().slice(0, 800);
    if (topic.length < 2) return sendJson(res, 400, { error: '주제를 2자 이상 입력해 주세요.' });
    if (articleInFlight) return sendJson(res, 429, { error: '이미 글을 만드는 중이에요. 잠시만 기다려 주세요.' });
    articleInFlight = true;
    try {
      const article = await callClaudeArticle(topic, notes);
      return sendJson(res, 200, { data: article, model: ANTHROPIC_MODEL });
    } catch (e) {
      console.error('[generate-article]', e.status || '', e.message);
      const friendly = e.status === 401 ? 'Claude API 키가 올바르지 않습니다. Render의 ANTHROPIC_API_KEY를 확인해 주세요.'
        : e.status === 429 ? 'Claude 사용 한도에 걸렸어요. 잠시 후 다시 시도해 주세요.'
        : e.message;
      return sendJson(res, 502, { error: friendly });
    } finally {
      articleInFlight = false;
    }
  }

  // 관리자 "사이트 리포트": 매물 현황 + 방문/조회/문의 집계
  if (urlObj.pathname === '/admin/report' && req.method === 'GET') {
    if (!requireAuth(req, res)) return;
    const rangeDays = Math.min(90, Math.max(1, parseInt(urlObj.searchParams.get('days') || '30', 10) || 30));
    const listings = readListings().filter((c) => !c.deleted);
    return sendJson(res, 200, {
      generated_at: Date.now(),
      listings: stats.listingReport(listings),
      traffic: stats.trafficReport(rangeDays, listings)
    });
  }

  // 관리자 화면의 "정보 가져오기"/"원본에서 다시 불러오기": KB차차차 페이지를 서버가 직접 받아 파싱해서 돌려준다.
  // (예전에 쓰던 r.jina.ai 리더는 KB차차차가 접근을 막아 더 이상 동작하지 않는다.)
  if (urlObj.pathname === '/admin/fetch-listing' && req.method === 'POST') {
    if (!requireAuth(req, res)) return;
    let body;
    try {
      body = await readRequestBody(req);
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
    try {
      const data = await scrapeKbListing(String((body && body.url) || '').trim());
      return sendJson(res, 200, { data });
    } catch (e) {
      console.error('[fetch-listing]', e.message);
      return sendJson(res, e.code === 'KB_RATE_LIMITED' ? 429 : 502, { error: e.message, code: e.code || null });
    }
  }

  // KB차차차가 서버 IP를 막고 있을 때의 대안: 관리자가 브라우저로 연 매물 페이지의 소스를 붙여넣으면
  // KB에 접속하지 않고 그 내용만 분석해서 같은 형태의 결과를 돌려준다.
  if (urlObj.pathname === '/admin/parse-html' && req.method === 'POST') {
    if (!requireAuth(req, res)) return;
    let body;
    try {
      body = await readRequestBody(req, 12 * 1024 * 1024);
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
    try {
      const data = parsePastedKbHtml(body && body.html, body && body.url);
      return sendJson(res, 200, { data });
    } catch (e) {
      return sendJson(res, 422, { error: e.message });
    }
  }

  if (urlObj.pathname === '/admin/upload' && req.method === 'POST') {
    try {
      return await handleImageUpload(req, res);
    } catch (e) {
      return sendJson(res, 500, { error: e.message || 'Server error' });
    }
  }

  const uploadMatch = urlObj.pathname.match(/^\/uploads\/([^/]+)$/);
  if (uploadMatch && req.method === 'GET') {
    return serveUpload(req, res, decodeURIComponent(uploadMatch[1]));
  }

  const imagesZipMatch = urlObj.pathname.match(/^\/car\/([^/]+)\/images\.zip$/);
  if (imagesZipMatch && req.method === 'GET') {
    try {
      return await handleImagesZip(req, res, decodeURIComponent(imagesZipMatch[1]));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Server error');
    }
  }

  const langHomeMatch = urlObj.pathname.match(/^\/(ru|mn|en)\/?$/);
  if (langHomeMatch && (req.method === 'GET' || req.method === 'HEAD')) {
    return handleLangHomePage(req, res, langHomeMatch[1]);
  }

  const carDetailMatch = urlObj.pathname.match(/^(?:\/(ru|mn|en))?\/car\/([^/]+)\/?$/);
  if (carDetailMatch && (req.method === 'GET' || req.method === 'HEAD')) {
    return handleCarDetailPage(req, res, decodeURIComponent(carDetailMatch[2]), carDetailMatch[1] || 'ko');
  }

  if (urlObj.pathname === '/sitemap.xml' && (req.method === 'GET' || req.method === 'HEAD')) {
    return handleSitemap(req, res);
  }

  if (urlObj.pathname === '/tables/car_listings' || urlObj.pathname.startsWith('/tables/car_listings/')) {
    const rest = urlObj.pathname.replace('/tables/car_listings', '').replace(/^\//, '');
    const idFromPath = rest || null;
    try {
      await handleTablesApi(req, res, urlObj, idFromPath);
    } catch (e) {
      sendJson(res, 500, { error: e.message || 'Internal Server Error' });
    }
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    return serveStatic(req, res, urlObj);
  }

  res.writeHead(404);
  res.end('Not Found');
});

// 배포(재시작) 직전에 아직 디스크에 쓰지 못한 집계를 저장한다.
['SIGTERM', 'SIGINT'].forEach((sig) => process.on(sig, () => {
  stats.flushNow();
  process.exit(0);
}));

ensureDataFile();
migrateListingNumbers();
migrateDisplayOrder();
server.listen(PORT, () => {
  console.log(`FROM K CAR server running at http://localhost:${PORT}`);
  // 서버가 뜬 뒤 백그라운드에서 기존 매물의 외부 사진을 천천히 내재화한다 (요청 처리를 막지 않는다).
  setTimeout(backfillLocalImages, 3000);
});
