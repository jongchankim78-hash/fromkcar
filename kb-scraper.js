/**
 * FROM K CAR — KB차차차 매물 상세페이지 직접 수집기 (서버용)
 *
 * 예전에는 브라우저가 r.jina.ai 리더를 거쳐 마크다운으로 받아 파싱했는데, KB차차차가 해당 리더의
 * 접근을 막아 모든 매물이 실패하게 됐다. 그래서 서버가 KB 페이지를 직접 받아 HTML에서 같은 항목을
 * 뽑아 js/parser.js의 parseListing()과 동일한 형태의 객체로 돌려준다.
 *
 * 주의: "로그인 없이 공개적으로 열람 가능한" 매물 상세페이지만 대상으로 한다.
 */
const http = require('http');
const https = require('https');
const zlib = require('zlib');

const ALLOWED_HOSTS = /^(www|m)\.kbchachacha\.com$/i;

const BRAND_LIST = [
  // 제네시스는 "현대 제네시스 ..." 처럼 옛 표기에 '현대'를 함께 포함하는 경우가 있어 먼저 검사한다.
  '제네시스', '벤츠', 'BMW', '아우디', '폭스바겐', '포르쉐', '볼보', '랜드로버', '재규어',
  '미니', '푸조', '렉서스', '토요타', '혼다', '닛산', '테슬라', '캐딜락',
  '한국GM', '쉐보레', '현대', '기아', '쌍용', 'KG모빌리티', '르노', '르노코리아', '시트로엥'
];

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function toNumber(str) {
  if (!str) return null;
  const n = String(str).replace(/[^0-9]/g, '');
  return n ? parseInt(n, 10) : null;
}

function priceTextToWon(str) {
  const m = String(str || '').match(/([\d,]+)\s*만원/);
  return m ? toNumber(m[1]) * 10000 : toNumber(str);
}

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&middot;/g, '·')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&');
}

/** HTML을 "한 줄에 하나의 텍스트 조각"으로 풀어서, 화면에 보이는 순서대로의 줄 배열로 만든다. */
function toLines(html) {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const text = cleaned
    .replace(/<\/?(?:br|p|div|li|ul|ol|tr|td|th|table|tbody|thead|h[1-6]|dt|dd|dl|span|strong|b|em|a|button|section|article|header|footer|label)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(text)
    .split('\n')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function findIndex(lines, test, from = 0, to = lines.length) {
  for (let i = from; i < to; i++) {
    if (typeof test === 'string' ? lines[i] === test : test.test(lines[i])) return i;
  }
  return -1;
}

function extractImages(html, carSeq) {
  const urls = [];
  const ld = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/i);
  if (ld) {
    try {
      const obj = JSON.parse(ld[1]);
      const arr = Array.isArray(obj.image) ? obj.image : (obj.image ? [obj.image] : []);
      arr.forEach((u) => urls.push(u));
    } catch (e) { /* 아래 정규식 폴백 사용 */ }
  }
  if (urls.length === 0) {
    const re = /https:\/\/img\.kbchachacha\.com\/IMG\/carimg\/[a-zA-Z]\/img\d+\/img\d+\/\d+_\d+\.(?:jpg|jpeg|png|webp)/g;
    let m;
    while ((m = re.exec(html)) !== null) urls.push(m[0]);
  }
  const seen = new Set();
  const out = [];
  urls.forEach((raw) => {
    const url = String(raw).split('?')[0];
    const m = url.match(/\/(\d+)_\d+\.(?:jpg|jpeg|png|webp)$/i);
    if (!m || (carSeq && m[1] !== carSeq) || seen.has(url)) return;
    seen.add(url);
    out.push(url);
  });
  return out;
}

function extractOptions(html) {
  const ul = html.match(/<ul[^>]*car-option-list[^>]*>([\s\S]*?)<\/ul>/i);
  if (!ul) return [];
  const options = [];
  const re = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = re.exec(ul[1])) !== null) {
    const text = decodeEntities(m[1].replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .replace(/\(\s+/g, '(')
      .replace(/\s+\)/g, ')')
      .replace(/\s+,/g, ',')
      .replace(/,(?=\S)/g, ', ')
      .trim();
    if (text && text !== '전체보기') options.push(text);
  }
  return options;
}

function extractBasicInfo(lines) {
  const labelMap = {
    '연식': 'yearInfo', '주행거리': 'mileageText', '연료': 'fuelType', '변속기': 'transmission',
    '연비': 'fuelEfficiency', '차종': 'bodyType', '배기량': 'displacement', '차량색상': 'color',
    '시트색상': 'seatColor', '압류': 'seizure', '저당': 'mortgage', '세금미납': 'taxUnpaid', '제시번호': 'presentNumber'
  };
  const result = {};
  const head = findIndex(lines, '차량 기본정보');
  const start = head !== -1 ? head : findIndex(lines, '기본정보');
  if (start === -1) return result;
  const end = Math.min(lines.length - 1, start + 45);
  for (let i = start; i < end; i++) {
    if (lines[i] === '차량정보' && result.carNumber2 === undefined && lines[i + 1] && lines[i + 1] !== '연식') {
      result.carNumber2 = lines[i + 1];
    }
    const key = labelMap[lines[i]];
    if (key && result[key] === undefined) result[key] = lines[i + 1];
  }
  if (result.mileageText) result.mileage = toNumber(result.mileageText);
  return result;
}

function extractAccidentInfo(lines) {
  const sec = findIndex(lines, '보험사고정보');
  const accidentFree = sec !== -1 && lines[sec + 1] === '사고없음';
  const parts = [];
  ['전손이력', '침수이력', '용도이력', '소유자변경'].forEach((label) => {
    const i = findIndex(lines, label, sec === -1 ? 0 : sec);
    if (i !== -1 && lines[i + 1]) parts.push(`${label} ${lines[i + 1]}`);
  });
  let summary = accidentFree ? '무사고' : '사고이력있음';
  const ins = findIndex(lines, '보험이력');
  if (ins !== -1) {
    const m = (lines[ins + 1] || '').match(/^(\d+)건$/);
    if (m) summary += ` · 보험이력 ${m[1]}건`;
  }
  if (parts.length) summary += ` · ${parts.join(' · ')}`;
  return summary;
}

function extractDiagnosis(lines) {
  // 프레임/외부패널 전체 판정. 페이지에 따라 두 가지 모양으로 나온다.
  //   (a) "프레임 정상" / "외부패널 정상"  (한 줄씩)
  //   (b) "프레임" / "정상" / "외부패널" / "정상"  (네 줄)
  let frameStatus = null;
  let exteriorStatus = null;
  for (let i = 0; i < lines.length - 1; i++) {
    const f = lines[i].match(/^프레임\s+(\S.*)$/);
    const e = lines[i + 1].match(/^외부패널\s+(\S.*)$/);
    if (f && e) { frameStatus = f[1]; exteriorStatus = e[1]; break; }
    if (lines[i] === '프레임' && lines[i + 2] === '외부패널' && lines[i + 1] && lines[i + 3]) {
      frameStatus = lines[i + 1];
      exteriorStatus = lines[i + 3];
      break;
    }
  }

  const parts = [];
  if (frameStatus) {
    parts.push(`프레임 ${frameStatus}`);
    parts.push(`외부패널 ${exteriorStatus}`);
  }

  const tot = findIndex(lines, /^총\s+.+\s*동안$/);
  if (tot !== -1) {
    const period = lines[tot].replace(/^총\s+/, '').replace(/\s*동안$/, '');
    const km = lines[tot + 1];
    const avg = (lines[tot + 2] || '').match(/\(연평균\s*([\d,]+Km)\s*주행\)/i);
    if (/^[\d,]+Km$/i.test(km || '') && avg) parts.push(`총 ${period} 동안 ${km} 주행 (연평균 ${avg[1]})`);
  }

  const lv = findIndex(lines, /주행거리는/);
  if (lv !== -1) {
    const b = findIndex(lines, '[', lv, lv + 4);
    if (b !== -1 && lines[b + 1]) parts.push(`주행거리 수준: ${lines[b + 1]}`);
  }

  const ratio = lines.join('\n').match(/신차 출고 가격 대비\s*(\d+%)/);
  if (ratio) parts.push(`신차가 대비 ${ratio[1]} 수준`);

  return { summary: parts.join(' · '), frameStatus, exteriorStatus };
}

function extractPanelDiagnosis(lines, overall) {
  const weld = findIndex(lines, /^판금\/용접\s*\d+\s*회$/);
  const exch = findIndex(lines, /^교환\s*\d+\s*회$/);
  const head = findIndex(lines, /차량의 진단 결과/);
  let headline = null;
  if (head !== -1) {
    // "369러1678 차량의 진단 결과 무사고 차량" (한 줄) 또는 "... 차량의 진단 결과" / "무사고 차량" (두 줄)
    let num = null;
    let result = null;
    const one = lines[head].match(/^(.+?)\s*차량의 진단 결과\s*(.+)$/);
    const two = lines[head].match(/^(.+?)\s*차량의 진단 결과$/);
    if (one) {
      num = one[1];
      result = one[2];
    } else if (two && lines[head + 1] && lines[head + 1] !== '입니다') {
      num = two[1];
      result = lines[head + 1];
    }
    if (num && result) headline = `${num.trim()} 차량의 진단 결과 ${result.replace(/입니다\.?$/, '').trim()}입니다`;
  }

  let exteriorPanels = [];
  let frameGroups = [];
  const from = head !== -1 ? head : 0;
  const ext = findIndex(lines, '외부패널', from);
  const frm = ext !== -1 ? findIndex(lines, '프레임', ext + 1) : -1;
  if (ext !== -1 && frm !== -1) {
    const toPairs = (seg) => {
      const items = [];
      for (let i = 0; i + 1 < seg.length; i += 2) items.push({ label: seg[i], status: seg[i + 1] });
      return items;
    };
    exteriorPanels = toPairs(lines.slice(ext + 1, frm));
    // 프레임 목록의 끝: 다음 섹션 제목이 나오기 전까지 (안전하게 최대 24줄)
    let end = findIndex(lines, /주요 서비스|신규매물/, frm + 1, frm + 26);
    if (end === -1) end = Math.min(lines.length, frm + 25);
    frameGroups = toPairs(lines.slice(frm + 1, end));
  }

  if (weld === -1 && exch === -1 && !overall.frameStatus && exteriorPanels.length === 0 && frameGroups.length === 0) return null;

  return {
    weld_count: weld !== -1 ? toNumber(lines[weld].match(/(\d+)\s*회/)[1]) : null,
    exchange_count: exch !== -1 ? toNumber(lines[exch].match(/(\d+)\s*회/)[1]) : null,
    frame_status: overall.frameStatus,
    exterior_status: overall.exteriorStatus,
    headline,
    exterior_panels: exteriorPanels,
    frame_groups: frameGroups
  };
}

function extractBrand(title) {
  if (!title) return null;
  return BRAND_LIST.find((b) => title.includes(b)) || title.split(' ')[0];
}

/** KB차차차 상세페이지 HTML -> js/parser.js parseListing()과 같은 모양의 객체 */
function parseKbHtml(html, originalUrl) {
  const lines = toLines(html);
  const urlSeq = (originalUrl.match(/carSeq=(\d+)/) || [])[1] || null;

  // 제목/차량번호/가격: "(369러1678)제네시스 GV80" / "2.5 터보 가솔린 AWD" / "판매가격" / "7,290만원"
  const p = findIndex(lines, '판매가격');
  let carNumber = null;
  let title = null;
  if (p !== -1) {
    for (let i = Math.max(0, p - 4); i < p; i++) {
      const m = lines[i].match(/^\(([^)]+)\)\s*(.*)$/);
      if (m) {
        carNumber = m[1].trim();
        title = [m[2], ...lines.slice(i + 1, p)].join(' ').replace(/\s+/g, ' ').trim();
        break;
      }
    }
  }
  let priceDisplay = null;
  let price = null;
  if (p !== -1 && /만원/.test(lines[p + 1] || '')) {
    const m = lines[p + 1].match(/([\d,]+\s*만원)/);
    if (m) {
      priceDisplay = m[1].replace(/\s/g, '');
      price = priceTextToWon(m[1]);
    }
  }

  // 요약 한 줄: 연식 / 주행거리 / 연료 / 지역
  const y = findIndex(lines, /^\d{2}년\s*\d{1,2}월\(.+\)$/, Math.max(p, 0), (p === -1 ? 0 : p) + 14);
  const summary = y !== -1 && /^[\d,]+km$/i.test(lines[y + 1] || '')
    ? { yearInfo: lines[y], mileage: toNumber(lines[y + 1]), fuelType: lines[y + 2], region: lines[y + 3] }
    : {};

  const basic = extractBasicInfo(lines);
  const overall = extractDiagnosis(lines);
  const images = extractImages(html, urlSeq);

  return {
    source_url: originalUrl,
    car_seq: urlSeq,
    title,
    car_number: carNumber || basic.carNumber2 || null,
    brand: extractBrand(title),
    price,
    price_display: priceDisplay,
    year_info: summary.yearInfo || basic.yearInfo || null,
    mileage: summary.mileage || basic.mileage || null,
    fuel_type: summary.fuelType || basic.fuelType || null,
    transmission: basic.transmission || null,
    displacement: basic.displacement || null,
    color: basic.color || null,
    seat_color: basic.seatColor || null,
    region: summary.region || null,
    accident_info: extractAccidentInfo(lines),
    options: extractOptions(html),
    main_image: images[0] || null,
    images,
    diagnosis_summary: overall.summary,
    panel_diagnosis: extractPanelDiagnosis(lines, overall),
    status: '판매중'
  };
}

function fetchKbPage(url, redirectsLeft = 3) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      return reject(new Error('올바른 URL이 아닙니다.'));
    }
    if (!ALLOWED_HOSTS.test(parsed.hostname)) {
      return reject(new Error('KB차차차(kbchachacha.com) 매물 URL만 지원합니다.'));
    }
    const client = parsed.protocol === 'http:' ? http : https;
    const req = client.get(parsed, {
      timeout: 20000,
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br'
      }
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirectsLeft > 0) {
        res.resume();
        return resolve(fetchKbPage(new URL(res.headers.location, parsed).toString(), redirectsLeft - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`KB차차차가 응답하지 않았습니다 (status ${res.statusCode})`));
      }
      const enc = (res.headers['content-encoding'] || '').toLowerCase();
      const stream = enc === 'gzip' ? res.pipe(zlib.createGunzip())
        : enc === 'br' ? res.pipe(zlib.createBrotliDecompress())
        : enc === 'deflate' ? res.pipe(zlib.createInflate())
        : res;
      const chunks = [];
      let size = 0;
      stream.on('data', (c) => {
        size += c.length;
        if (size > 8 * 1024 * 1024) {
          req.destroy();
          reject(new Error('페이지가 너무 큽니다.'));
          return;
        }
        chunks.push(c);
      });
      stream.on('end', () => resolve({ html: Buffer.concat(chunks).toString('utf-8'), finalUrl: parsed.toString() }));
      stream.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('KB차차차 응답 시간이 초과되었습니다.')));
    req.on('error', reject);
  });
}

async function fetchKbHtml(url) {
  return (await fetchKbPage(url)).html;
}

// 매물 대신 엉뚱한 페이지가 왔을 때 원인을 알 수 있도록 응답의 제목/앞부분 글자를 요약한다.
function describePage(html, finalUrl) {
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = t ? decodeEntities(t[1]).replace(/\s+/g, ' ').trim().slice(0, 60) : '(제목 없음)';
  const excerpt = toLines(html).join(' / ').slice(0, 200);
  let host = '';
  try { host = new URL(finalUrl).host; } catch (e) { /* ignore */ }
  return { title, excerpt, host, length: html.length };
}

// KB차차차는 짧은 시간에 요청이 몰리면 상세페이지 대신 "로봇여부 확인(reCAPTCHA)" 화면을 내려준다.
// 이 확인은 우회하지 않고, 사용자에게 잠시 후 다시 시도하라고 정확히 알려준다.
function isRobotCheckPage(html) {
  return html.length < 20000 && /로봇여부 확인/.test(html) && /verifychallenge/.test(html);
}

async function scrapeKbListing(url) {
  const { html, finalUrl } = await fetchKbPage(url);
  if (isRobotCheckPage(html)) {
    const err = new Error('KB차차차가 짧은 시간에 요청이 많다고 판단해 "로봇 확인" 화면을 보여주고 있습니다. 5~10분 정도 뒤에 다시 시도해주세요.');
    err.code = 'KB_RATE_LIMITED';
    throw err;
  }
  const data = parseKbHtml(html, url);
  if (!data.title && !data.price) {
    const d = describePage(html, finalUrl);
    console.error(`[kb-scraper] no listing data. title="${d.title}" len=${d.length} host=${d.host} excerpt="${d.excerpt}"`);
    throw new Error(`차량 정보를 추출하지 못했습니다. KB차차차가 매물 대신 "${d.title}" 페이지(${d.length.toLocaleString('en-US')}자, ${d.host})를 돌려줬습니다.`);
  }
  return data;
}

module.exports = { scrapeKbListing, fetchKbHtml, fetchKbPage, parseKbHtml, isRobotCheckPage, describePage };
