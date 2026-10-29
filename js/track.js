/**
 * FROM K CAR — 방문/매물 조회/문의 클릭 집계 (관리자 "사이트 리포트"용).
 * 개인정보 없이 브라우저가 만든 익명 난수 ID만 보낸다. 관리자가 로그인한 적 있는 브라우저는 집계에서 제외한다.
 */
(function (global) {
  const VID_KEY = 'fkcar_vid';
  const ADMIN_KEY = 'fkcar_admin';
  const VISIT_KEY = 'fkcar_visit_sent';

  function lsGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function lsSet(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* 무시 */ } }
  function ssGet(key) { try { return sessionStorage.getItem(key); } catch (e) { return null; } }
  function ssSet(key, value) { try { sessionStorage.setItem(key, value); } catch (e) { /* 무시 */ } }

  if (lsGet(ADMIN_KEY)) {
    global.KCarTrack = { view() {} };
    return;
  }

  function makeId() {
    const bytes = new Uint8Array(8);
    (global.crypto || global.msCrypto).getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  let vid = lsGet(VID_KEY);
  if (!vid) {
    vid = makeId();
    lsSet(VID_KEY, vid);
  }

  function lang() {
    return global.KCarI18n ? KCarI18n.getLang() : 'ko';
  }

  function send(evt) {
    const body = JSON.stringify({ ...evt, vid, lang: lang() });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon('/track', new Blob([body], { type: 'application/json' }))) return;
      fetch('/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    } catch (e) { /* 집계 실패는 사이트 동작에 영향을 주지 않는다 */ }
  }

  function currentCarId() {
    // 담당자 버전(/HOONS) 경로는 떼고 본다
    const prof = window.KCarProfiles ? KCarProfiles.fromPath(location.pathname) : { base: '' };
    const path = prof.base ? (location.pathname.slice(prof.base.length) || '/') : location.pathname;
    const m = path.match(/^(?:\/(?:ru|mn|en))?\/car\/([^/]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  // 방문은 탭(세션)당 한 번만 센다.
  if (!ssGet(VISIT_KEY)) {
    ssSet(VISIT_KEY, '1');
    let ref = '';
    // 블로그 글 등에 넣은 링크의 ?src=naver_blog 같은 꼬리표가 있으면 그것을 유입 경로로 쓴다.
    const src = new URLSearchParams(location.search).get('src');
    if (src && /^[a-z0-9_-]{1,30}$/i.test(src)) {
      ref = 'src:' + src.toLowerCase();
    } else {
      try {
        const host = new URL(document.referrer).host;
        if (host && host !== location.host) ref = host;
      } catch (e) { /* referrer 없음 */ }
    }
    send({ t: 'visit', ref });
  }

  let lastView = { id: '', at: 0 };
  function view(carId) {
    if (!carId) return;
    const now = Date.now();
    if (lastView.id === carId && now - lastView.at < 5000) return;
    lastView = { id: carId, at: now };
    send({ t: 'view', car: carId });
  }

  function channelOf(href) {
    if (/^tel:/i.test(href)) return 'phone';
    if (/^mailto:/i.test(href)) return 'email';
    if (/wa\.me\/8210/i.test(href)) return 'whatsapp';
    if (/t\.me\/from_k_car/i.test(href)) return 'telegram_channel';
    if (/t\.me\/fromkcar(?:[/?#]|$)/i.test(href)) return 'telegram';
    if (/instagram\.com\/fromkcar/i.test(href)) return 'instagram';
    if (/pf\.kakao\.com/i.test(href)) return 'kakao';
    return '';
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    const ch = channelOf(a.getAttribute('href') || '');
    if (ch) send({ t: 'contact', ch, car: currentCarId() });
  }, true);

  global.KCarTrack = { view };
})(window);
