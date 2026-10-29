/**
 * FROM K CAR — 원/달러 환산가 (참고용).
 * 서버(/api/fx)가 하루 단위 공개 기준환율을 받아 두고, 여기서는 매물 가격 옆에 "≈ $31,000"을 붙인다.
 * 환율을 못 받아오면 아무것도 표시하지 않는다 (틀린 숫자를 보여주지 않기 위해).
 */
(function (global) {
  let state = { rate: null, date: null };

  // 화면을 먼저 그린 뒤 환율이 도착하면 'fxready' 이벤트로 다시 그린다 (main.js가 듣는다).
  const promise = fetch('/api/fx')
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (d && Number(d.rate) > 0) {
        state = { rate: Number(d.rate), date: d.date || null };
        document.dispatchEvent(new CustomEvent('fxready'));
      }
    })
    .catch(() => {});

  // 가격(원): 숫자 price가 있으면 그것을, 없으면 "4,490만원" 같은 표기에서 읽는다
  function wonOf(car) {
    if (Number(car.price) > 0) return Number(car.price);
    const m = String(car.price_display || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*만원/);
    return m ? Math.round(Number(m[1]) * 10000) : 0;
  }

  /** 달러 환산가(10달러 단위로 반올림). 환율이나 가격을 모르면 null */
  function usd(car) {
    const won = wonOf(car);
    if (!state.rate || !won) return null;
    return Math.round(won / state.rate / 10) * 10;
  }

  function note() {
    const t = global.KCarI18n ? KCarI18n.t('fx_note') : '';
    return t.replace('{rate}', Math.round(state.rate).toLocaleString('en-US')).replace('{date}', state.date || '');
  }

  /** 가격 옆에 붙일 작은 달러 표기 HTML. cls에 글자 크기 클래스를 넘긴다. */
  function html(car, cls) {
    const v = usd(car);
    if (v === null) return '';
    const tip = note().replace(/"/g, '&quot;');
    return ` <span class="${cls || 'text-xs'} font-semibold text-[var(--fk-gray-600)] whitespace-nowrap" title="${tip}">≈ $${v.toLocaleString('en-US')}</span>`;
  }

  global.KCarFx = { promise, usd, html, info: () => state };
})(window);
