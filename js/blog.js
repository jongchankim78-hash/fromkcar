/**
 * FROM K CAR — 네이버 블로그 매물 소개글 생성기 (관리자 전용).
 * 매물 데이터에서 "실제로 있는 장점"만 골라 글을 만든다 (없는 내용을 지어내지 않는다).
 * 같은 형식이 반복되면 네이버가 유사문서로 볼 수 있어서, 문장 틀은 매물/재생성 횟수마다 달라진다.
 * 담당자 연락처·주소는 아래 DEALER에서 한 번에 고친다.
 */
(function (global) {
  const SITE = 'https://www.fromkcar.kr';
  const DEALER = {
    team: '프롬케이카',
    name: '김종찬 팀장',
    phone: '010-7449-8282',
    tel: '031-306-8080',
    email: 'chanini78@naver.com',
    address: '경기도 수원시 권선구 평동로79번길 45, 314호 (SKV1모터스 평동)',
    kakao: 'http://pf.kakao.com/_jWCxnX/chat',
    telegram: 'https://t.me/fromkcar',
    whatsapp: 'https://wa.me/821074498282'
  };

  const BRAND_KO = {
    'bmw': 'BMW', 'mercedes benz': '벤츠', 'mercedes-benz': '벤츠', 'benz': '벤츠', 'volvo': '볼보', '볼보': '볼보',
    'kia': '기아', 'hyundai': '현대', 'genesis': '제네시스', 'honda': '혼다', 'toyota': '토요타', 'lexus': '렉서스',
    'audi': '아우디', 'volkswagen': '폭스바겐', 'porsche': '포르쉐', 'land rover': '랜드로버', 'mini': '미니',
    'tesla': '테슬라', 'ford': '포드', 'jeep': '지프', 'renault': '르노', 'chevrolet': '쉐보레', 'ssangyong': '쌍용',
    'kg mobility': 'KG모빌리티'
  };

  // 옵션 이름에서 고객이 좋아하는 항목만 골라 보여주기 위한 목록 [표시 이름, 찾는 패턴]
  const OPTION_HIGHLIGHTS = [
    ['선루프', /선루프|썬루프|파노라마/],
    ['통풍시트', /통풍/],
    ['열선시트', /열선\s*시트/],
    ['열선 핸들', /열선\s*(핸들|스티어링)/],
    ['가죽시트', /가죽|나파|퀼팅/],
    ['어라운드뷰', /어라운드|서라운드뷰|360/],
    ['헤드업디스플레이(HUD)', /HUD|헤드업/i],
    ['크루즈 컨트롤', /크루즈|ACC/i],
    ['전동 트렁크', /파워\s*트렁크|전동\s*트렁크|스마트\s*트렁크|테일게이트/],
    ['메모리 시트', /메모리/],
    ['프리미엄 오디오', /하만|바워스|뱅앤|B&O|마크\s*레빈|렉시콘|BOSE|보스|메리디안/i],
    ['차선 이탈 방지', /차선/],
    ['전방 충돌 방지', /충돌/],
    ['후측방 경보', /후측방|블라인드/],
    ['무선 충전', /무선\s*충전/],
    ['후방 카메라', /후방\s*카메라/],
    ['내비게이션', /내비/]
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  function noInfo(v) {
    return !v || ['-', '정보없음', '정보 없음', '인기색상'].includes(String(v).trim());
  }

  function effectiveNoAccident(car) {
    if (car.badge_no_accident !== undefined && car.badge_no_accident !== null) return !!car.badge_no_accident;
    return !!(car.accident_info && car.accident_info.startsWith('무사고'));
  }

  // "25년12월(26년형)" → { reg: 2025, model: 2026 }
  function parseYears(yearInfo) {
    const s = String(yearInfo || '');
    const reg = s.match(/(\d{2})년\s*(\d{1,2})?\s*월?/);
    const model = s.match(/\((\d{2})년형\)/);
    const full = (yy) => 2000 + Number(yy);
    return {
      reg: reg ? full(reg[1]) : null,
      regMonth: reg && reg[2] ? Number(reg[2]) : 1,
      model: model ? full(model[1]) : (reg ? full(reg[1]) : null)
    };
  }

  function priceText(car) {
    if (car.price_display) return car.price_display;
    return car.price ? `${Math.round(car.price / 10000).toLocaleString('ko-KR')}만원` : '';
  }

  function kmText(km) {
    return km || km === 0 ? `${Number(km).toLocaleString('ko-KR')}km` : '';
  }

  function brandKo(car) {
    const b = String(car.brand || '').trim();
    return BRAND_KO[b.toLowerCase()] || b;
  }

  function carUrl(car) {
    return `${SITE}/car/${car.id}?src=naver_blog`;
  }

  // 매물 데이터에서 "근거가 있는" 장점만 뽑는다.
  function buildAdvantages(car) {
    const list = [];
    const yrs = parseYears(car.year_info);
    const now = new Date();
    const ageYears = yrs.reg ? Math.max(0.5, (now.getFullYear() - yrs.reg) + (now.getMonth() + 1 - yrs.regMonth) / 12) : null;
    const km = Number(car.mileage);
    const fuel = String(car.fuel_type || '');
    const pd = car.panel_diagnosis || {};

    if (car.is_new_car) {
      list.push({ b: '완전신차', t: `${Number.isFinite(km) && km >= 0 ? `주행거리 ${kmText(km)}의 ` : ''}새 차 그대로의 상태로, 신차 구매 대비 합리적인 가격에 만나보실 수 있습니다.` });
    }
    if (effectiveNoAccident(car)) {
      list.push({ b: '완전무사고', t: '보험 사고 이력이 없는 무사고 차량입니다. 중고차를 고를 때 가장 중요하게 보는 부분이죠.' });
    }
    if (car.badge_no_paint) {
      list.push({ b: '무도색(NO PAINT)', t: '외판 도색·판금 흔적 없이 출고 당시 도장 상태를 유지하고 있습니다.' });
    }
    if (pd.frame_status === '정상' && pd.exterior_status === '정상') {
      list.push({ b: '프레임·외판 모두 정상', t: '진단 결과 프레임(골격)과 외판 모두 이상 없이 정상으로 확인됩니다.' });
    } else if (pd.frame_status === '정상') {
      list.push({ b: '프레임(골격) 정상', t: '차량 뼈대에 해당하는 프레임에 손상이 없는 것으로 확인됩니다.' });
    }
    if (!car.is_new_car && Number.isFinite(km) && km > 0) {
      if (ageYears) {
        const perYear = Math.round(km / ageYears / 100) * 100;
        if (perYear <= 10000) {
          list.push({ b: '낮은 주행거리', t: `${kmText(km)} 주행으로 연평균 약 ${perYear.toLocaleString('ko-KR')}km, 일반적인 연간 주행거리보다 짧게 탔습니다.` });
        }
      } else if (km <= 30000) {
        list.push({ b: '낮은 주행거리', t: `${kmText(km)}만 주행한 차량입니다.` });
      }
    }
    if (yrs.model && now.getFullYear() - yrs.model <= 2) {
      list.push({ b: `${yrs.model}년형 최신 연식`, t: '연식이 최근이라 최신 디자인과 편의사양을 누릴 수 있고, 되팔 때도 유리합니다.' });
    }
    if (/전기|EV/i.test(fuel)) {
      list.push({ b: '전기차', t: '주유 대신 충전으로 달리는 차량으로, 연료비와 유지비 부담을 줄일 수 있습니다.' });
    } else if (/하이브리드|HEV/i.test(fuel)) {
      list.push({ b: '하이브리드', t: '연비가 좋아 출퇴근이나 장거리 운행에서 연료비를 아낄 수 있습니다.' });
    } else if (/디젤/.test(fuel)) {
      list.push({ b: '디젤 엔진', t: '토크가 넉넉하고 연비가 좋아 장거리 주행이 많은 분께 잘 맞습니다.' });
    }

    const optionText = (Array.isArray(car.options) ? car.options : []).join(' | ');
    const hits = OPTION_HIGHLIGHTS.filter(([, re]) => re.test(optionText)).map(([label]) => label).slice(0, 6);
    if (hits.length >= 2) {
      list.push({ b: '풍부한 옵션', t: `${hits.join(', ')} 등 편의·안전 사양이 갖춰져 있습니다.` });
    }

    if (!noInfo(car.color) || !noInfo(car.seat_color)) {
      const ext = noInfo(car.color) ? '' : `외장 ${car.color}`;
      const int = noInfo(car.seat_color) ? '' : `내장 ${car.seat_color}`;
      list.push({ b: '색상 조합', t: `${[ext, int].filter(Boolean).join(' / ')} 조합으로 깔끔한 인상을 줍니다.` });
    }
    return list.slice(0, 7);
  }

  // 영어 차명으로 등록된 매물에서 네이버 검색어로 많이 쓰는 한글 모델명을 찾는다 (없으면 영문/숫자 모델명).
  const MODEL_KO = {
    SORENTO: '쏘렌토', SPORTAGE: '스포티지', CARNIVAL: '카니발', SELTOS: '셀토스', STINGER: '스팅어', MORNING: '모닝',
    SONATA: '쏘나타', GRANDEUR: '그랜저', PALISADE: '팰리세이드', 'SANTA FE': '싼타페', SANTAFE: '싼타페',
    TUCSON: '투싼', AVANTE: '아반떼', KONA: '코나', STARIA: '스타리아', IONIQ: '아이오닉', PILOT: '파일럿',
    ODYSSEY: '오딧세이', 'LAND CRUISER': '랜드크루저', CAMRY: '캠리', 'SIENNA': '시에나'
  };

  function modelKeyword(car) {
    const title = String(car.title || '');
    const ko = title.match(/[가-힣]{2,}/);
    if (ko) return ko[0];
    const upper = title.toUpperCase();
    const known = Object.keys(MODEL_KO).find((k) => upper.includes(k));
    if (known) return MODEL_KO[known];
    const m = title.match(/\b([A-Za-z]{1,3}\d{1,3}[A-Za-z]?)\b/);
    return m ? m[1].toUpperCase() : '';
  }

  function buildTags(car) {
    const bk = brandKo(car).replace(/\s+/g, '');
    const model = modelKeyword(car);
    const tags = ['중고차', '수원중고차', '경기중고차', '중고차매물', '프롬케이카', '무사고중고차'];
    if (car.is_new_car) tags.push('신차급중고차', '신차');
    if (bk) tags.push(`${bk}중고차`);
    if (model) tags.push(`${model}중고차`, model);
    if (/전기|EV/i.test(car.fuel_type || '')) tags.push('전기차중고');
    if (/하이브리드/.test(car.fuel_type || '')) tags.push('하이브리드중고차');
    const yrs = parseYears(car.year_info);
    if (yrs.model) tags.push(`${yrs.model}년식`);
    return [...new Set(tags)].slice(0, 15).map((t) => `#${t}`).join(' ');
  }

  function buildTitle(car, seed) {
    const yrs = parseYears(car.year_info);
    const year = yrs.model ? `${yrs.model}년형` : '';
    const mark = car.is_new_car ? '완전신차' : (effectiveNoAccident(car) ? '무사고' : '');
    const km = !car.is_new_car && Number(car.mileage) > 0 ? kmText(car.mileage) : '';
    const variants = [
      [`[수원중고차]`, year, car.title, mark, priceText(car)],
      [`[수원중고차]`, car.title, year, km, mark],
      [`[${brandKo(car) || '수원'}중고차]`, year, car.title, priceText(car), mark],
      [`수원중고차`, year, car.title, mark, km, priceText(car)]
    ];
    const pick = variants[(hash(String(car.id)) + seed) % variants.length];
    return pick.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() + ' - 프롬케이카';
  }

  function buildBlocks(car, opts) {
    const seed = opts.seed || 0;
    const v = (arr, salt) => arr[(hash(String(car.id)) + seed + (salt || 0)) % arr.length];
    const yrs = parseYears(car.year_info);
    const bk = brandKo(car);
    const name = `${yrs.model ? yrs.model + '년형 ' : ''}${car.title}`.trim();
    const adv = buildAdvantages(car);
    const topWords = adv.slice(0, 2).map((a) => a.b).join(', ');
    const url = carUrl(car);
    const blocks = [];

    // 차량명에 브랜드가 이미 들어 있으면(KIA ..., BMW ...) 앞에 또 붙이지 않는다.
    const dn = bk && !name.toLowerCase().includes(bk.toLowerCase()) && !name.toLowerCase().includes(String(car.brand || '').toLowerCase())
      ? `${bk} ${name}` : name;
    const withAdv = topWords ? ` (${topWords})` : '';

    blocks.push({ type: 'p', text: v([
      `안녕하세요, 수원 SKV1모터스에서 중고차를 소개해 드리는 프롬케이카 ${DEALER.name}입니다. 오늘 소개해 드릴 차량은 ${dn}${withAdv}입니다.`,
      `${bk ? bk + ' ' : ''}중고차를 찾고 계신가요? 프롬케이카 ${DEALER.name}입니다. 이번에 입고된 차량은 ${dn}${withAdv}입니다. 자세히 살펴보시죠.`,
      `수원에서 믿고 맡길 수 있는 중고차를 찾는 분들께 소개합니다. ${dn}${topWords ? ' — ' + topWords : ''} 매물이 입고되었습니다.`,
      `중고차는 좋은 차를 먼저 만나는 게 가장 중요하다고 생각합니다. 오늘 프롬케이카에 입고된 차량은 ${dn}${withAdv}입니다.`
    ], 1) });

    blocks.push({ type: 'p', text: v([
      `가격은 ${priceText(car) || '문의'}이며, 아래에서 차량의 장점과 상태를 정리해 두었으니 끝까지 확인해 보세요.`,
      `판매 가격은 ${priceText(car) || '문의'}입니다. 이 차량이 왜 추천드릴 만한지 하나씩 말씀드리겠습니다.`,
      `${priceText(car) ? priceText(car) + '에 ' : ''}만나보실 수 있는 차량입니다. 장점과 상태를 꼼꼼히 정리했습니다.`
    ], 2) });

    if (adv.length) {
      blocks.push({ type: 'h', text: v(['이 차량의 장점', '이 차량을 추천하는 이유', '핵심 포인트 정리'], 3) });
      blocks.push({ type: 'items', items: adv });
    }

    if (car.description_ko && car.description_ko.trim()) {
      blocks.push({ type: 'h', text: '딜러 한마디' });
      blocks.push({ type: 'p', text: car.description_ko.trim() });
    }

    const kv = [];
    kv.push(['차량명', car.title]);
    if (car.year_info) kv.push(['연식', car.year_info]);
    if (car.mileage || car.mileage === 0) kv.push(['주행거리', kmText(car.mileage)]);
    if (car.fuel_type) kv.push(['연료', car.fuel_type]);
    if (car.transmission) kv.push(['변속기', car.transmission]);
    if (car.displacement) kv.push(['배기량', car.displacement]);
    if (!noInfo(car.color)) kv.push(['외장 색상', car.color]);
    if (!noInfo(car.seat_color)) kv.push(['내장 색상', car.seat_color]);
    kv.push(['판매 가격', priceText(car) || '문의']);
    blocks.push({ type: 'h', text: '차량 기본 정보' });
    blocks.push({ type: 'kv', items: kv });

    const options = Array.isArray(car.options) ? car.options.filter(Boolean) : [];
    if (options.length) {
      blocks.push({ type: 'h', text: '주요 옵션' });
      blocks.push({ type: 'p', text: options.slice(0, 30).join(' · ') });
    }

    const state = [];
    if (!noInfo(car.accident_info)) state.push(`사고 이력: ${car.accident_info}`);
    if (!noInfo(car.diagnosis_summary)) state.push(car.diagnosis_summary);
    if (state.length) {
      blocks.push({ type: 'h', text: '사고 이력 · 차량 상태' });
      state.forEach((s) => blocks.push({ type: 'p', text: s }));
    }

    if (opts.photos && Array.isArray(car.images) && car.images.length) {
      blocks.push({ type: 'h', text: '차량 사진' });
      car.images.slice(0, 15).forEach((src) => {
        blocks.push({ type: 'img', url: /^https?:/.test(src) ? src : SITE + src });
      });
    }

    blocks.push({ type: 'h', text: v(['중고차 구매 전 꼭 확인하세요', '구매 전 체크 포인트'], 4) });
    blocks.push({ type: 'p', text: v([
      '중고차는 사진과 글만으로 판단하기보다 직접 보고 확인하시는 것이 가장 정확합니다. 방문 전에 미리 연락 주시면 차량을 준비해 두고 상세하게 설명드리겠습니다. 성능점검기록부와 사고 이력도 함께 확인하실 수 있습니다.',
      '실제 차량 상태는 직접 확인하시는 게 가장 좋습니다. 방문 상담을 원하시면 전화나 카카오톡으로 먼저 연락 주세요. 성능점검과 사고 이력 확인 방법도 친절하게 안내해 드립니다.'
    ], 5) });
    blocks.push({ type: 'p', text: '※ 판매 상태와 가격은 변동될 수 있으니 문의하실 때 최신 정보를 꼭 확인해 주세요.' });

    blocks.push({ type: 'h', text: '상담 · 방문 안내' });
    blocks.push({ type: 'kv', items: [
      ['담당', `${DEALER.team} ${DEALER.name}`],
      ['휴대폰', DEALER.phone],
      ['전화', DEALER.tel],
      ['카카오톡 상담', DEALER.kakao],
      ['주소', DEALER.address],
      ['이 차량 자세히 보기', url],
      ['전체 매물 보기', `${SITE}/?src=naver_blog`]
    ] });
    blocks.push({ type: 'p', text: v([
      `${name}에 대해 궁금한 점은 언제든 편하게 문의 주세요. 감사합니다.`,
      `마음에 드는 차량이 있다면 부담 없이 연락 주세요. 정성껏 상담해 드리겠습니다.`,
      `${DEALER.name}이 차량 상태부터 구매 절차까지 친절하게 안내해 드리겠습니다. 감사합니다.`
    ], 6) });
    return blocks;
  }

  const S = {
    h: 'margin:28px 0 10px;font-size:19px;font-weight:700;',
    p: 'margin:0 0 12px;font-size:15px;line-height:1.8;',
    li: 'margin:0 0 8px;font-size:15px;line-height:1.7;'
  };

  function renderHtml(blocks) {
    return blocks.map((b) => {
      if (b.type === 'h') return `<p style="${S.h}">■ ${esc(b.text)}</p>`;
      if (b.type === 'p') return `<p style="${S.p}">${esc(b.text)}</p>`;
      if (b.type === 'items') return b.items.map((i) => `<p style="${S.li}">✔ <b>${esc(i.b)}</b> — ${esc(i.t)}</p>`).join('');
      if (b.type === 'kv') return b.items.map(([k, val]) => {
        const isUrl = /^https?:\/\//.test(val);
        return `<p style="${S.li}">• <b>${esc(k)}</b> : ${isUrl ? `<a href="${esc(val)}">${esc(val)}</a>` : esc(val)}</p>`;
      }).join('');
      if (b.type === 'img') return `<p style="text-align:center;margin:0 0 12px;"><img src="${esc(b.url)}" style="max-width:100%;"></p>`;
      return '';
    }).join('\n');
  }

  function renderText(blocks) {
    return blocks.map((b) => {
      if (b.type === 'h') return `\n■ ${b.text}`;
      if (b.type === 'p') return b.text;
      if (b.type === 'items') return b.items.map((i) => `✔ ${i.b} — ${i.t}`).join('\n');
      if (b.type === 'kv') return b.items.map(([k, val]) => `• ${k} : ${val}`).join('\n');
      return '';
    }).filter((s) => s !== '').join('\n');
  }

  /**
   * @param {object} car 매물 데이터
   * @param {{seed?: number, photos?: boolean}} opts seed를 바꾸면 다른 문장 틀로 다시 만든다
   * @returns {{title: string, html: string, text: string, tags: string, url: string}}
   */
  function generate(car, opts) {
    const o = { seed: 0, photos: false, ...(opts || {}) };
    const blocks = buildBlocks(car, o);
    return {
      title: buildTitle(car, o.seed),
      html: renderHtml(blocks),
      text: renderText(blocks),
      tags: buildTags(car),
      url: carUrl(car)
    };
  }

  global.KCarBlog = { generate, DEALER };
})(window);
