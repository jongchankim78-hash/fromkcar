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

const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DATA_FILE = path.join(DATA_DIR, 'car_listings.json');
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

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload)
  });
  res.end(payload);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 20 * 1024 * 1024) {
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
      sorted.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
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

async function notifyTelegramNewListing(car) {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    const mileageText = car.mileage ? `${Number(car.mileage).toLocaleString('ko-KR')}km` : '';
    const titleLine = `${car.title || ''}${car.listing_no ? ` (No.${car.listing_no})` : ''}`;
    const specLine = [car.price_display && `💰 ${car.price_display}`, car.year_info && `📅 ${car.year_info}`, mileageText && `🛣 ${mileageText}`, car.region && `📍 ${car.region}`]
      .filter(Boolean).join(' · ');

    const lines = [titleLine];
    if (specLine) lines.push(specLine);

    if (car.description_ko) {
      let descRu = car.description_ru || '';
      let descEn = '';
      try {
        const [ru, en] = await Promise.all([
          descRu ? Promise.resolve(descRu) : translateText(car.description_ko, 'ru'),
          translateText(car.description_ko, 'en')
        ]);
        descRu = ru;
        descEn = en;
      } catch (e) {
        console.error('Telegram description translate failed:', e.message);
      }
      lines.push('', `🇰🇷 ${car.description_ko}`);
      if (descRu) lines.push('', `🇷🇺 ${descRu}`);
      if (descEn) lines.push('', `🇬🇧 ${descEn}`);
    }
    lines.push('', `${SITE_ORIGIN}/car/${car.id}`);

    let caption = lines.join('\n');
    const image = car.main_image || (Array.isArray(car.images) ? car.images[0] : null);

    let result;
    if (image) {
      if (caption.length > 1024) caption = caption.slice(0, 1000) + '…';
      result = await telegramApiCall('sendPhoto', { chat_id: TELEGRAM_CHANNEL, photo: image, caption });
    } else {
      if (caption.length > 4096) caption = caption.slice(0, 4000) + '…';
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
        const hay = [c.title, c.region, c.car_number, c.brand].filter(Boolean).join(' ').toLowerCase();
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
      created_at: now,
      updated_at: now,
      deleted: false
    };
    list.push(item);
    writeListings(list);
    notifyTelegramNewListing(item).catch(() => {});
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
  return pattern.test(html) ? html.replace(pattern, replacement) : html;
}

// /car/:id — 매물별 실제 og:title/description/image가 박힌 상세페이지를 서버에서 렌더링한다.
// (SPA 모달만으로는 크롤러/링크 미리보기가 특정 매물을 인식할 수 없어서 추가한 라우트)
function handleCarDetailPage(req, res, carId) {
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

  const priceText = car.price_display || (car.price ? `${Math.round(car.price / 10000).toLocaleString('ko-KR')}만원` : '');
  const title = `${car.title || 'FROM K CAR'} ${priceText}`.trim() + ' — FROM K CAR';
  const description = `${car.title || ''} ${car.year_info || ''} ${priceText} · 한국 중고차 수출 FROM K CAR`.replace(/\s+/g, ' ').trim();
  const image = car.main_image || (Array.isArray(car.images) ? car.images[0] : '') || 'https://www.fromkcar.kr/images/og-image.png';
  const canonicalUrl = `https://www.fromkcar.kr/car/${car.id}`;

  let html = indexHtml;
  html = replaceMeta(html, /<title>.*?<\/title>/s, `<title>${escapeAttr(title)}</title>`);
  html = replaceMeta(html, /<meta name="description" content=".*?">/s, `<meta name="description" content="${escapeAttr(description)}">`);
  html = replaceMeta(html, /<link rel="canonical" href=".*?">/s, `<link rel="canonical" href="${canonicalUrl}">`);
  html = replaceMeta(html, /<meta property="og:title" content=".*?">/s, `<meta property="og:title" content="${escapeAttr(title)}">`);
  html = replaceMeta(html, /<meta property="og:description" content=".*?">/s, `<meta property="og:description" content="${escapeAttr(description)}">`);
  html = replaceMeta(html, /<meta property="og:image" content=".*?">/s, `<meta property="og:image" content="${escapeAttr(image)}">`);
  html = replaceMeta(html, /<meta property="og:url" content=".*?">/s, `<meta property="og:url" content="${canonicalUrl}">`);
  html = replaceMeta(html, /<meta name="twitter:title" content=".*?">/s, `<meta name="twitter:title" content="${escapeAttr(title)}">`);
  html = replaceMeta(html, /<meta name="twitter:description" content=".*?">/s, `<meta name="twitter:description" content="${escapeAttr(description)}">`);
  html = replaceMeta(html, /<meta name="twitter:image" content=".*?">/s, `<meta name="twitter:image" content="${escapeAttr(image)}">`);

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
    const buffers = await Promise.all(limited.map((url) => fetchBuffer(url)));
    entries = buffers.map((data, i) => {
      let ext = '.jpg';
      try {
        ext = (path.extname(new URL(limited[i]).pathname) || '.jpg').toLowerCase();
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
  const urls = [
    { loc: 'https://www.fromkcar.kr/', changefreq: 'daily', priority: '1.0' },
    ...cars.map((c) => ({
      loc: `https://www.fromkcar.kr/car/${c.id}`,
      changefreq: 'weekly',
      priority: '0.8',
      lastmod: new Date(c.updated_at || c.created_at || Date.now()).toISOString().slice(0, 10)
    }))
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>
    <loc>${u.loc}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>\n    ` : ''}<changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;
  res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
  res.end(xml);
}

function serveStatic(req, res, urlObj) {
  let reqPath = decodeURIComponent(urlObj.pathname);
  if (reqPath === '/') reqPath = '/index.html';

  const filePath = path.normalize(path.join(ROOT_DIR, reqPath));
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  if (filePath === path.join(ROOT_DIR, 'server.js') || filePath.startsWith(DATA_DIR)) {
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

  const imagesZipMatch = urlObj.pathname.match(/^\/car\/([^/]+)\/images\.zip$/);
  if (imagesZipMatch && req.method === 'GET') {
    try {
      return await handleImagesZip(req, res, decodeURIComponent(imagesZipMatch[1]));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Server error');
    }
  }

  const carDetailMatch = urlObj.pathname.match(/^\/car\/([^/]+)\/?$/);
  if (carDetailMatch && (req.method === 'GET' || req.method === 'HEAD')) {
    return handleCarDetailPage(req, res, decodeURIComponent(carDetailMatch[1]));
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

ensureDataFile();
migrateListingNumbers();
server.listen(PORT, () => {
  console.log(`FROM K CAR server running at http://localhost:${PORT}`);
});
