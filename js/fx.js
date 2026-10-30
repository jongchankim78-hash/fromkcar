/**
 * FROM K CAR — 환산가 (참고용).
 * 서버(/api/fx)가 공개 기준환율을 받아 두고, 여기서는
 *   - 한국어 화면: 매물 가격 옆에 "≈ $31,000"을 붙이고
 *   - 러시아어·몽골어·영어 화면: 가격 자체를 그 나라 화폐(₽·₮·$)로 환산해 "≈ 2 340 000 ₽"로 보여준다 (원화는 작게 덧붙임).
 * 환율을 못 받아오면 달러 표기는 숨기고, 환산 화면은 원화(₩)로 대신 보여준다 (틀린 숫자를 보여주지 않기 위해).
 */
(function (global) {
  let state = { rate: null, rates: {}, date: null };

  // 화면을 먼저 그린 뒤 환율이 도착하면 'fxready' 이벤트로 다시 그린다 (main.js가 듣는다).
  const promise = fetch('/api/fx')
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (d && Number(d.rate) > 0) {
        state = { rate: Number(d.rate), rates: d.rates || {}, date: d.date || null };
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
    const lang = global.KCarI18n ? KCarI18n.getLang() : 'ko';
    const c = KCarCurrency.forLang(lang);
    // 러시아어·몽골어는 루블·투그릭 환율까지, 그 밖(한국어·영어)은 원/달러 환율만 안내한다
    const local = c && c.code !== 'USD' && state.rates[c.code] ? Math.round(state.rates[c.code]).toLocaleString('en-US') : '';
    const t = global.KCarI18n ? KCarI18n.t(local ? 'fx_note_local' : 'fx_note') : '';
    return t.replace('{rate}', Math.round(state.rate).toLocaleString('en-US')).replace('{date}', state.date || '')
      .replace('{local}', local).replace('{code}', c ? c.code : '');
  }

  /** 가격 옆에 붙일 작은 달러 표기 HTML. cls에 글자 크기 클래스를 넘긴다. */
  function html(car, cls) {
    const v = usd(car);
    if (v === null) return '';
    const tip = note().replace(/"/g, '&quot;');
    return ` <span class="${cls || 'text-xs'} font-semibold text-[var(--fk-gray-600)] whitespace-nowrap" title="${tip}">≈ $${v.toLocaleString('en-US')}</span>`;
  }

  /** 현재 언어의 가격 글자: 환산가("≈ 2 340 000 ₽"), 환율이 없으면 원화("₩35,000,000"), 가격을 모르면 '' */
  function localText(car) {
    const won = wonOf(car);
    if (!won) return '';
    return KCarCurrency.approx(won, KCarI18n.getLang(), state) || KCarCurrency.krw(won);
  }

  /** 한국어가 아닌 화면의 가격 HTML: 환산가(크게) + 원화 원가(작게). cls에 글자 크기 클래스를 넘긴다. */
  function localHtml(car, cls) {
    const won = wonOf(car);
    if (!won) return '';
    const main = KCarCurrency.approx(won, KCarI18n.getLang(), state);
    if (!main) return KCarCurrency.krw(won);
    const tip = note().replace(/"/g, '&quot;');
    return `<span title="${tip}">${main}</span> <span class="${cls || 'text-xs'} font-semibold text-[var(--fk-gray-600)] whitespace-nowrap">(${KCarCurrency.krw(won)})</span>`;
  }

  global.KCarFx = { promise, usd, html, localText, localHtml, info: () => state };
})(window);
