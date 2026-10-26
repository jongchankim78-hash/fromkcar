/**
 * FROM K CAR — 사이트 방문/조회/문의 클릭 집계.
 * 개인정보를 저장하지 않는다: IP는 저장하지 않고(요청 빈도 제한에만 메모리로 사용),
 * 방문자는 브라우저가 만든 익명 난수 ID로만 구분한다. 하루 단위로 합산해 data/stats.json에 보관한다.
 */
const fs = require('fs');
const path = require('path');

const KEEP_DAYS = 180;
const LANGS = new Set(['ko', 'ru', 'mn', 'en']);
const CHANNELS = new Set(['whatsapp', 'telegram', 'telegram_channel', 'instagram', 'kakao', 'phone', 'email']);
const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|monitor|uptime/i;
const FLUSH_MS = 15000;
const RATE_LIMIT_PER_MIN = 120;

function createStats(dataDir) {
  const file = path.join(dataDir, 'stats.json');
  const days = {};
  let dirty = false;
  let flushTimer = null;
  const hits = new Map();
  let hitsWindow = 0;

  function emptyDay() {
    return { visits: 0, visitors: new Set(), langs: {}, refs: {}, devices: {}, views: {}, contacts: {}, contactCars: {} };
  }

  function load() {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
      Object.entries(raw.days || {}).forEach(([key, d]) => {
        days[key] = { ...emptyDay(), ...d, visitors: new Set(d.visitors || []) };
      });
    } catch (e) {
      // 파일이 없거나 깨졌으면 새로 시작한다.
    }
  }

  function save() {
    if (!dirty) return;
    dirty = false;
    const out = { days: {} };
    Object.entries(days).forEach(([key, d]) => {
      out.days[key] = { ...d, visitors: [...d.visitors] };
    });
    try {
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(out), 'utf-8');
      fs.renameSync(tmp, file);
    } catch (e) {
      dirty = true;
      console.error('[stats] save failed:', e.message);
    }
  }

  function markDirty() {
    dirty = true;
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      save();
    }, FLUSH_MS);
    if (flushTimer.unref) flushTimer.unref();
  }

  // 한국 시간(KST) 기준 날짜 키: YYYY-MM-DD
  function dayKey(ts) {
    return new Date(ts + 9 * 3600 * 1000).toISOString().slice(0, 10);
  }

  function prune() {
    const keys = Object.keys(days).sort();
    while (keys.length > KEEP_DAYS) delete days[keys.shift()];
  }

  function bump(map, key, n = 1) {
    map[key] = (map[key] || 0) + n;
  }

  function allowed(ip) {
    const window = Math.floor(Date.now() / 60000);
    if (window !== hitsWindow) {
      hits.clear();
      hitsWindow = window;
    }
    const n = (hits.get(ip) || 0) + 1;
    hits.set(ip, n);
    return n <= RATE_LIMIT_PER_MIN;
  }

  function clean(value, max) {
    return String(value == null ? '' : value).slice(0, max);
  }

  /** 브라우저가 보낸 이벤트 하나를 기록한다. 잘못된 입력은 조용히 버린다. */
  function record(evt, { ua = '', ip = '' } = {}) {
    if (!evt || typeof evt !== 'object') return false;
    if (BOT_UA.test(ua) || !allowed(ip)) return false;

    const vid = clean(evt.vid, 32);
    if (!/^[a-z0-9]{8,32}$/i.test(vid)) return false;

    const key = dayKey(Date.now());
    const day = days[key] || (days[key] = emptyDay());
    const car = /^[\w-]{1,64}$/.test(String(evt.car || '')) ? String(evt.car) : '';

    if (evt.t === 'visit') {
      const lang = LANGS.has(evt.lang) ? evt.lang : 'ko';
      const ref = clean(evt.ref, 60).toLowerCase().replace(/^www\./, '').replace(/[^a-z0-9.\-]/g, '') || 'direct';
      day.visits += 1;
      day.visitors.add(vid);
      bump(day.langs, lang);
      bump(day.refs, ref);
      bump(day.devices, /Mobi|Android|iPhone|iPad/i.test(ua) ? 'mobile' : 'desktop');
    } else if (evt.t === 'view' && car) {
      bump(day.views, car);
    } else if (evt.t === 'contact' && CHANNELS.has(evt.ch)) {
      bump(day.contacts, evt.ch);
      if (car) bump(day.contactCars, car);
    } else {
      return false;
    }

    prune();
    markDirty();
    return true;
  }

  function sumInto(target, source) {
    Object.entries(source || {}).forEach(([k, v]) => bump(target, k, v));
  }

  function toSortedList(map, limit) {
    const list = Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    return limit ? list.slice(0, limit) : list;
  }

  /** 최근 N일(오늘 포함) 집계. listings는 삭제되지 않은 매물 배열. */
  function trafficReport(rangeDays, listings) {
    const now = Date.now();
    const daily = [];
    const langs = {};
    const refs = {};
    const devices = {};
    const views = {};
    const contacts = {};
    const contactCars = {};
    const visitors = new Set();
    let visits = 0;
    let viewTotal = 0;
    let contactTotal = 0;

    for (let i = rangeDays - 1; i >= 0; i--) {
      const key = dayKey(now - i * 86400000);
      const d = days[key];
      const row = { date: key, visits: 0, visitors: 0, views: 0, contacts: 0 };
      if (d) {
        row.visits = d.visits;
        row.visitors = d.visitors.size;
        row.views = Object.values(d.views).reduce((a, b) => a + b, 0);
        row.contacts = Object.values(d.contacts).reduce((a, b) => a + b, 0);
        d.visitors.forEach((v) => visitors.add(v));
        sumInto(langs, d.langs);
        sumInto(refs, d.refs);
        sumInto(devices, d.devices);
        sumInto(views, d.views);
        sumInto(contacts, d.contacts);
        sumInto(contactCars, d.contactCars);
      }
      visits += row.visits;
      viewTotal += row.views;
      contactTotal += row.contacts;
      daily.push(row);
    }

    const byId = new Map(listings.map((c) => [c.id, c]));
    const carIds = new Set([...Object.keys(views), ...Object.keys(contactCars)]);
    const topCars = [...carIds].map((id) => {
      const car = byId.get(id);
      return {
        id,
        title: car ? car.title : null,
        listing_no: car ? car.listing_no || null : null,
        status: car ? car.status || '' : '',
        views: views[id] || 0,
        contacts: contactCars[id] || 0
      };
    }).sort((a, b) => (b.views + b.contacts * 5) - (a.views + a.contacts * 5)).slice(0, 10);

    const firstKey = Object.keys(days).sort()[0] || null;

    return {
      range_days: rangeDays,
      tracking_since: firstKey,
      totals: { visits, visitors: visitors.size, views: viewTotal, contacts: contactTotal },
      daily,
      langs: toSortedList(langs),
      refs: toSortedList(refs, 8),
      devices: toSortedList(devices),
      contacts: toSortedList(contacts),
      top_cars: topCars
    };
  }

  function listingReport(listings) {
    const onSale = listings.filter((c) => c.status !== '판매완료');
    const sold = listings.length - onSale.length;
    const prices = onSale.map((c) => Number(c.price)).filter((p) => p > 0);
    const brands = {};
    listings.forEach((c) => bump(brands, c.brand || '기타'));
    const noPhoto = listings.filter((c) => !(Array.isArray(c.images) && c.images.length) && !c.main_image).length;
    const recent = [...listings].sort((a, b) => (b.created_at || 0) - (a.created_at || 0)).slice(0, 5)
      .map((c) => ({ id: c.id, title: c.title, status: c.status || '판매중', created_at: c.created_at || 0 }));

    return {
      total: listings.length,
      on_sale: onSale.length,
      sold,
      no_accident: onSale.filter((c) => c.badge_no_accident).length,
      no_paint: onSale.filter((c) => c.badge_no_paint).length,
      avg_price_man: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length / 10000) : null,
      no_photo: noPhoto,
      brands: toSortedList(brands),
      recent
    };
  }

  load();
  const flushNow = () => {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = null;
    save();
  };

  return { record, trafficReport, listingReport, flushNow };
}

module.exports = { createStats };
