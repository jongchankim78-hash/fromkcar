/**
 * FROM K CAR — 로컬 백엔드 서버
 * 정적 파일(index.html/admin.html/css/js/images)을 서빙하고,
 * js/api.js가 호출하는 tables/car_listings REST API를 JSON 파일 저장소로 구현한다.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DATA_FILE = path.join(DATA_DIR, 'car_listings.json');
const PORT = process.env.PORT || 8080;

// 관리자 전용 구간(admin.html 열람, 매물 등록/수정/삭제)을 지키는 서버 측 인증.
// 배포 시 반드시 ADMIN_USER / ADMIN_PASSWORD 환경변수를 설정해서 기본값을 덮어쓸 것.
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '4887asdf';

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
  res.writeHead(401, {
    'WWW-Authenticate': 'Basic realm="FROM K CAR Admin"',
    'Content-Type': 'text/plain; charset=utf-8'
  });
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
      created_at: now,
      updated_at: now,
      deleted: false
    };
    list.push(item);
    writeListings(list);
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

function serveStatic(req, res, urlObj) {
  let reqPath = decodeURIComponent(urlObj.pathname);
  if (reqPath === '/') reqPath = '/index.html';

  if (reqPath === '/admin.html') {
    if (!requireAuth(req, res)) return;
  }

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
server.listen(PORT, () => {
  console.log(`FROM K CAR server running at http://localhost:${PORT}`);
});
