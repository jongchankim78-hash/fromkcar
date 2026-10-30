/**
 * FROM K CAR — 언어별 화폐 표시.
 * 러시아어는 루블(₽), 몽골어는 투그릭(₮), 영어는 달러($)로 가격을 환산해 보여준다.
 * 서버(제목·설명 등 SEO)와 브라우저(매물 카드·상세)가 같은 계산을 쓰도록 한 파일로 둔다.
 *   fx = { rate: 1달러당 원화, rates: { RUB: 1달러당 루블, MNT: 1달러당 투그릭 } }  (서버 /api/fx 응답과 같은 모양)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KCarCurrency = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // step: 환산 금액을 이 단위로 반올림한다 (환율은 매일 달라지니 낱개 단위까지 보여줘도 의미가 없다)
  const BY_LANG = {
    ru: { code: 'RUB', symbol: '₽', step: 1000 },
    mn: { code: 'MNT', symbol: '₮', step: 10000 },
    en: { code: 'USD', symbol: '$', step: 10 }
  };

  function group(n, sep) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  }

  /** 해당 언어의 화폐 정보 ({code, symbol, step}). 한국어처럼 환산하지 않는 언어는 null */
  function forLang(lang) {
    return BY_LANG[lang] || null;
  }

  /** 원화 금액 → 해당 언어 화폐 금액. 환율이나 금액을 모르면 null */
  function convert(won, lang, fx) {
    const c = BY_LANG[lang];
    if (!c || !(Number(won) > 0) || !fx || !(Number(fx.rate) > 0)) return null;
    const perUsd = c.code === 'USD' ? 1 : Number(fx.rates && fx.rates[c.code]);
    if (!(perUsd > 0)) return null;
    return Math.round(Number(won) / Number(fx.rate) * perUsd / c.step) * c.step;
  }

  /** 금액을 언어에 맞는 표기로: 2 340 000 ₽ / ₮90,500,000 / $26,170 */
  function format(lang, amount) {
    if (lang === 'ru') return `${group(amount, ' ')} ₽`;
    if (lang === 'mn') return `₮${group(amount, ',')}`;
    return `$${group(amount, ',')}`;
  }

  function krw(won) {
    return `₩${group(won, ',')}`;
  }

  /** 환산 가격 표기("≈ 2 340 000 ₽"). 환산할 수 없으면 null */
  function approx(won, lang, fx) {
    const v = convert(won, lang, fx);
    return v === null ? null : `≈ ${format(lang, v)}`;
  }

  return { forLang, convert, format, krw, approx };
});
