/**
 * FROM K CAR — 한글 차명 (검색용).
 * KB차차차 등에서 가져온 차명은 "KIA THE NEW SORENTO MQ4 2.2 AWD PRESTIGE"처럼 영문이라,
 * 한국 고객이 네이버·구글에서 치는 "쏘렌토 중고차", "GV80 중고" 같은 검색어와 겹치지 않는다.
 * 이 모듈은 영문 차명에서 한글 모델명을 찾아 주고(자동), 관리자가 직접 입력한 한글 차명이 있으면 그것을 우선한다.
 * 서버(Node)와 브라우저 양쪽에서 같은 코드를 쓴다 → 사이트 제목/설명, 블로그 글, 관리자 입력창이 모두 같은 이름을 쓴다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KCarKo = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const PHONE = '010-7449-8282';

  // 브랜드 표기(영문/한글, 소문자) → 한글 표기
  const BRANDS = {
    'bmw': 'BMW', 'mini': '미니',
    'mercedes benz': '벤츠', 'mercedes-benz': '벤츠', 'mercedes': '벤츠', 'benz': '벤츠', '벤츠': '벤츠', '메르세데스-벤츠': '벤츠',
    'volvo': '볼보', '볼보': '볼보',
    'kia': '기아', '기아': '기아', 'hyundai': '현대', '현대': '현대', 'genesis': '제네시스', '제네시스': '제네시스',
    'honda': '혼다', '혼다': '혼다', 'toyota': '토요타', '토요타': '토요타', 'lexus': '렉서스', '렉서스': '렉서스',
    'audi': '아우디', '아우디': '아우디', 'volkswagen': '폭스바겐', 'vw': '폭스바겐', '폭스바겐': '폭스바겐',
    'porsche': '포르쉐', '포르쉐': '포르쉐', 'land rover': '랜드로버', 'landrover': '랜드로버', 'range rover': '랜드로버', '랜드로버': '랜드로버',
    'tesla': '테슬라', '테슬라': '테슬라', 'ford': '포드', '포드': '포드', 'jeep': '지프', '지프': '지프',
    'chevrolet': '쉐보레', '쉐보레': '쉐보레', 'renault': '르노', 'renault korea': '르노', '르노': '르노',
    'kg mobility': 'KG모빌리티', 'kgm': 'KG모빌리티', 'ssangyong': 'KG모빌리티', '쌍용': 'KG모빌리티', 'kg모빌리티': 'KG모빌리티',
    'cadillac': '캐딜락', 'lincoln': '링컨', 'peugeot': '푸조', 'jaguar': '재규어', 'maserati': '마세라티', 'infiniti': '인피니티'
  };

  // 수입차 브랜드 (태그의 "수입중고차" 판단용)
  const IMPORT_BRANDS = new Set(['BMW', '미니', '벤츠', '볼보', '혼다', '토요타', '렉서스', '아우디', '폭스바겐', '포르쉐', '랜드로버', '테슬라', '포드', '지프', '캐딜락', '링컨', '푸조', '재규어', '마세라티', '인피니티']);

  // [찾을 패턴, 한글 모델명(문자열 또는 매치를 받는 함수)] — 위에서부터 먼저 맞는 것을 쓴다.
  const BY_BRAND = {
    '기아': [
      [/SORENTO/i, '쏘렌토'], [/SPORTAGE/i, '스포티지'], [/CARNIVAL/i, '카니발'], [/SELTOS/i, '셀토스'], [/STONIC/i, '스토닉'],
      [/NIRO/i, '니로'], [/MORNING/i, '모닝'], [/\bRAY\b/i, '레이'], [/STINGER/i, '스팅어'], [/MOHAVE/i, '모하비'],
      [/TELLURIDE/i, '텔루라이드'], [/\bSOUL\b/i, '쏘울'], [/\bK(3|5|7|8|9)\b/i, (m) => `K${m[1]}`], [/\bEV(3|4|5|6|9)\b/i, (m) => `EV${m[1]}`]
    ],
    '현대': [
      [/SONATA/i, '쏘나타'], [/GRANDEUR|AZERA/i, '그랜저'], [/PALISADE/i, '팰리세이드'], [/SANTA\s*FE/i, '싼타페'], [/TUCSON/i, '투싼'],
      [/AVANTE|ELANTRA/i, '아반떼'], [/KONA/i, '코나'], [/VENUE/i, '베뉴'], [/CASPER/i, '캐스퍼'], [/STARIA/i, '스타리아'],
      [/STAREX/i, '스타렉스'], [/IONIQ\s*(5|6|9)\b/i, (m) => `아이오닉 ${m[1]}`], [/IONIQ/i, '아이오닉'], [/NEXO/i, '넥쏘'], [/PORTER/i, '포터'],
      [/\bI30\b/i, 'i30'], [/VELOSTER/i, '벨로스터']
    ],
    '제네시스': [
      [/\bGV(60|70|80)\b/i, (m) => `GV${m[1]}`], [/\bG(70|80|90)\b/i, (m) => `G${m[1]}`]
    ],
    'BMW': [
      [/\bX([1-7])\b/i, (m) => `X${m[1]}`], [/\biX([1-3])?\b/, (m) => `iX${m[1] || ''}`], [/\bi([3-8])\b/, (m) => `i${m[1]}`],
      [/\b([1-8])\d{2}(?:i|d|e|Li|xd)\b/i, (m) => `${m[1]}시리즈`], [/\bM([2-8])\d{2}/i, (m) => `${m[1]}시리즈`], [/\bZ4\b/i, 'Z4']
    ],
    '벤츠': [
      [/\bG[\s-]?CLASS\b|\bG(?:350|400|500|63)\b/i, 'G클래스'],
      [/\bE[\s-]?CLASS\b|\bE\s?(?:200|220|250|300|350|400|450|53)\b/i, 'E클래스'],
      [/\bS[\s-]?CLASS\b|\bS\s?(?:350|400|450|500|560|580|63)\b/i, 'S클래스'],
      [/\bC[\s-]?CLASS\b|\bC\s?(?:180|200|220|250|300|63)\b/i, 'C클래스'],
      [/\bA[\s-]?CLASS\b|\bA\s?(?:180|200|220|250)\b/i, 'A클래스'],
      [/\bB[\s-]?CLASS\b|\bB\s?(?:180|200|250)\b/i, 'B클래스'],
      [/\bML\s?(\d{3})/i, (m) => `ML${m[1]}`], [/\bGL(?:A|B|C|E|S)\b/i, (m) => m[0].toUpperCase()], [/\bCL(?:A|S)\b/i, (m) => m[0].toUpperCase()],
      [/\bEQ(?:A|B|C|E|S)\b/i, (m) => m[0].toUpperCase()], [/AMG\s*GT/i, 'AMG GT'], [/MAYBACH/i, '마이바흐']
    ],
    '볼보': [
      [/\bXC(40|60|90)\b/i, (m) => `XC${m[1]}`], [/\bEX(30|90)\b/i, (m) => `EX${m[1]}`], [/\bC40\b/i, 'C40'],
      [/\bS(60|90)\b/i, (m) => `S${m[1]}`], [/\bV(40|60|90)\b/i, (m) => `V${m[1]}`]
    ],
    '혼다': [[/PILOT/i, '파일럿'], [/ODYSSEY/i, '오딧세이'], [/CR-?V/i, 'CR-V'], [/ACCORD/i, '어코드'], [/CIVIC/i, '시빅']],
    '토요타': [[/CAMRY/i, '캠리'], [/RAV4/i, '라브4'], [/PRIUS/i, '프리우스'], [/SIENNA/i, '시에나'], [/AVALON/i, '아발론'], [/ALPHARD/i, '알파드'], [/HIGHLANDER/i, '하이랜더'], [/LAND\s*CRUISER/i, '랜드크루저']],
    '렉서스': [[/\b(ES|RX|NX|LS|UX|GS|IS|LC)\s?(\d{2,3}h?)/i, (m) => `${m[1].toUpperCase()}${m[2]}`]],
    '아우디': [[/\bA([3-8])\b/i, (m) => `A${m[1]}`], [/\bQ([2-8])\b/i, (m) => `Q${m[1]}`], [/E-?TRON/i, 'e-tron']],
    '폭스바겐': [[/TIGUAN/i, '티구안'], [/GOLF/i, '골프'], [/PASSAT/i, '파사트'], [/ARTEON/i, '아테온'], [/TOUAREG/i, '투아렉']],
    '포르쉐': [[/CAYENNE/i, '카이엔'], [/MACAN/i, '마칸'], [/PANAMERA/i, '파나메라'], [/TAYCAN/i, '타이칸'], [/\b911\b/, '911']],
    '랜드로버': [[/RANGE\s*ROVER/i, '레인지로버'], [/DEFENDER/i, '디펜더'], [/DISCOVERY/i, '디스커버리'], [/EVOQUE/i, '이보크'], [/VELAR/i, '벨라']],
    '테슬라': [[/MODEL\s*([3SXY])\b/i, (m) => `모델${m[1].toUpperCase()}`]],
    '미니': [[/COUNTRYMAN/i, '컨트리맨'], [/COOPER/i, '쿠퍼']],
    '포드': [[/MUSTANG/i, '머스탱'], [/EXPLORER/i, '익스플로러']],
    '지프': [[/GRAND\s*CHEROKEE/i, '그랜드체로키'], [/WRANGLER/i, '랭글러']],
    '쉐보레': [[/TRAILBLAZER/i, '트레일블레이저'], [/MALIBU/i, '말리부'], [/TRAX/i, '트랙스'], [/EQUINOX/i, '이쿼녹스'], [/SPARK/i, '스파크'], [/BOLT/i, '볼트']],
    'KG모빌리티': [[/TORRES/i, '토레스'], [/REXTON/i, '렉스턴'], [/KORANDO/i, '코란도'], [/TIVOLI/i, '티볼리']],
    '르노': [[/\bQM6\b/i, 'QM6'], [/\bSM6\b/i, 'SM6'], [/\bXM3\b/i, 'XM3'], [/\bSM5\b/i, 'SM5']]
  };

  function hasHangul(s) { return /[가-힣]/.test(String(s || '')); }

  function brandOf(car) {
    const raw = String(car.brand || '').trim().toLowerCase();
    // 옛 표기("현대 제네시스 ...")로 등록된 매물은 브랜드가 '현대'여도 실제로는 제네시스다 (사이트 화면과 같은 규칙)
    if ((raw === '현대' || raw === 'hyundai') && /제네시스|genesis/i.test(String(car.title || ''))) return '제네시스';
    if (BRANDS[raw]) return BRANDS[raw];
    // 브랜드 칸이 비었거나 낯설면 차량명 앞부분에서 찾는다 ("Mercedes Benz ...", "KIA THE NEW ...")
    const title = String(car.title || '').toLowerCase();
    const keys = Object.keys(BRANDS).sort((a, b) => b.length - a.length);
    const hit = keys.find((k) => new RegExp('(^|[^a-z가-힣])' + k.replace(/[-\s]/g, '[-\\s]?') + '([^a-z가-힣]|$)', 'i').test(title));
    return hit ? BRANDS[hit] : String(car.brand || '').trim();
  }

  /** 자동으로 찾은 한글 모델명. 못 찾으면 model이 빈 문자열. */
  function guess(car) {
    const brand = brandOf(car);
    const title = String(car.title || '');
    const rules = BY_BRAND[brand] || [];
    let model = '';
    let matched = '';
    for (const [re, name] of rules) {
      const m = title.match(re);
      if (m) { model = typeof name === 'function' ? name(m) : name; matched = m[0]; break; }
    }
    if (!model && hasHangul(title)) {
      // 이미 한글 차명이면("현대 제네시스 G80") 브랜드 표기만 걷어내고 그대로 쓴다
      const stripped = title.replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim();
      return { brand, model: '', full: stripped, known: true };
    }
    return { brand, model, full: model ? `${brand} ${model}` : '', known: !!model, matched };
  }

  // 영어 이미지 검색(위키미디어 등)용 이름: { brand: 'Kia', model: 'Sorento' }. 차명에서 모델 부분을 못 찾으면 model은 빈 문자열.
  function enName(car) {
    const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).map((w) => (/\d/.test(w) || /^[A-Z]{1,3}$/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join(' ');
    const g = guess(car);
    return { brand: words(car.brand) || '', model: words(g.matched) };
  }

  /** 검색용 한글 차명: 관리자가 입력한 title_ko > 자동 추정 > 원래 차명 */
  function koName(car) {
    if (car.title_ko && String(car.title_ko).trim()) return String(car.title_ko).trim();
    const g = guess(car);
    return g.full || String(car.title || '').trim();
  }

  /** 모델명만 ("쏘렌토", "GV80"). 직접 입력한 한글 차명이면 브랜드 뒤 부분. */
  function koModel(car) {
    if (car.title_ko && String(car.title_ko).trim()) {
      const parts = String(car.title_ko).trim().split(/\s+/);
      return parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
    }
    const g = guess(car);
    return g.model || '';
  }

  function koBrand(car) {
    return brandOf(car);
  }

  function isImport(car) {
    return IMPORT_BRANDS.has(brandOf(car));
  }

  function modelYear(car) {
    const s = String(car.year_info || '');
    const m = s.match(/\((\d{2})년형\)/) || s.match(/(\d{2})년/);
    return m ? 2000 + Number(m[1]) : null;
  }

  function priceText(car) {
    if (car.status === '판매완료') return ''; // 판매완료 매물은 판매가를 보여주지 않는다
    if (car.price_display) return car.price_display;
    return car.price ? `${Math.round(car.price / 10000).toLocaleString('ko-KR')}만원` : '';
  }

  function noAccident(car) {
    if (car.badge_no_accident !== undefined && car.badge_no_accident !== null) return !!car.badge_no_accident;
    return !!(car.accident_info && String(car.accident_info).startsWith('무사고'));
  }

  // 사이트 매물 페이지의 검색용 제목/설명 (한국어 화면). 핵심 키워드(한글 모델 + 중고차)를 맨 앞에 둔다.
  function seoTitle(car) {
    const ko = koName(car);
    const y = modelYear(car);
    const mark = car.is_new_car ? '신차급' : (noAccident(car) ? '무사고' : '');
    return [`${ko} 중고차`, y ? `${y}년식` : '', mark, priceText(car)].filter(Boolean).join(' ') + ' | 수원 프롬케이카';
  }

  function seoDescription(car) {
    const ko = koName(car);
    const y = modelYear(car);
    const km = car.mileage || car.mileage === 0 ? `주행 ${Number(car.mileage).toLocaleString('ko-KR')}km` : '';
    const bits = [y ? `${y}년식` : '', km, car.fuel_type || '', car.is_new_car ? '신차급' : '', noAccident(car) ? '무사고' : '', car.badge_no_paint ? '무도색' : ''].filter(Boolean);
    const price = priceText(car);
    return `수원 ${ko} 중고차${bits.length ? ' — ' + bits.join(' · ') : ''}${price ? '. ' + price : ''}. 프롬케이카(FROM K CAR) ${PHONE} 방문·전화 상담.`;
  }

  return { guess, enName, koName, koModel, koBrand, isImport, seoTitle, seoDescription, hasHangul };
});
