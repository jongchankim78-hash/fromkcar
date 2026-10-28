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

  // src 꼬리표는 사이트 리포트의 "유입 경로"에서 어느 글/채널을 타고 왔는지 구분하는 데 쓴다.
  function carUrl(car, src) {
    return `${SITE}/car/${car.id}?src=${src || 'naver_blog'}`;
  }

  // 같은 브랜드 + 비슷한 가격대 순으로 판매중인 다른 차량을 고른다 (사이트의 "비슷한 차량"과 같은 기준).
  function similarOnSale(car, cars, limit) {
    const price = Number(car.price) || 0;
    return (cars || [])
      .filter((c) => c.id !== car.id && c.status !== '판매완료' && !c.deleted)
      .map((c) => {
        let score = 0;
        if (brandKo(c) === brandKo(car)) score += 3;
        const p = Number(c.price) || 0;
        if (price && p) {
          const gap = Math.abs(p - price) / price;
          if (gap <= 0.2) score += 3;
          else if (gap <= 0.4) score += 1;
        }
        return { c, score };
      })
      .sort((a, b) => b.score - a.score || (a.c.display_order ?? 0) - (b.c.display_order ?? 0))
      .slice(0, limit || 3)
      .map((x) => x.c);
  }

  function contactBlocks(carLink) {
    const items = [
      ['담당', `${DEALER.team} ${DEALER.name}`],
      ['휴대폰', DEALER.phone],
      ['전화', DEALER.tel],
      ['카카오톡 상담', DEALER.kakao],
      ['주소', DEALER.address]
    ];
    if (carLink) items.push(['이 차량 자세히 보기', carLink]);
    items.push(['전체 매물 보기', `${SITE}/?src=naver_blog`]);
    return [{ type: 'h', text: '상담 · 방문 안내' }, { type: 'kv', items }];
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
    const prefix = car.status === '판매완료' ? '[판매완료] ' : '';
    return prefix + pick.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() + ' - 프롬케이카';
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
    const sold = car.status === '판매완료';
    const similar = sold ? similarOnSale(car, opts.cars, 3) : [];

    if (sold) {
      blocks.push({ type: 'p', text: '【판매완료 안내】 이 차량은 현재 판매가 완료되었습니다. 비슷한 조건의 판매중인 차량은 아래 링크에서 확인해 주세요.' });
      blocks.push({ type: 'p', text: v([
        `안녕하세요, 수원 SKV1모터스 프롬케이카 ${DEALER.name}입니다. 많은 관심을 받았던 ${dn}${withAdv}의 판매가 완료되어 소개글을 남깁니다.`,
        `프롬케이카 ${DEALER.name}입니다. ${dn}${withAdv} 차량은 좋은 주인을 만나 판매가 완료되었습니다. 이런 차량을 찾으신다면 아래 내용을 참고해 주세요.`
      ], 1) });
      blocks.push({ type: 'p', text: `판매 당시 가격은 ${priceText(car) || '문의'}였습니다. 같은 조건의 차량을 찾으신다면 비슷한 매물을 안내해 드릴 수 있으니 편하게 문의 주세요.` });
    } else {
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
    }

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

    if (similar.length) {
      blocks.push({ type: 'h', text: '비슷한 판매중 차량' });
      blocks.push({ type: 'kv', items: similar.map((c) => [`${c.title}${priceText(c) ? ' ' + priceText(c) : ''}`, carUrl(c)]) });
    }

    blocks.push(...contactBlocks(url));
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

  /* ---------------- 정보성 글 (매물과 무관한 블로그 글감) ---------------- */
  // 네이버는 매물 홍보글만 있는 블로그보다 정보성 글이 함께 있는 블로그를 더 좋게 평가하는 경향이 있다.
  // 글마다 판매중인 매물 링크(?src=naver_blog)를 넣어 방문으로 이어지게 한다.
  const TOPICS = [
    {
      id: 'checklist',
      label: '중고차 구매 전 체크리스트 10가지',
      title: '중고차 구매 전 꼭 확인해야 할 체크리스트 10가지',
      tags: ['중고차구매', '중고차체크리스트', '중고차구매팁', '중고차잘사는법'],
      intros: [
        (n) => `중고차는 같은 모델이라도 차량마다 상태 차이가 크기 때문에, 계약 전에 무엇을 확인하느냐가 곧 만족도를 좌우합니다. 수원 SKV1모터스에서 중고차를 소개하는 프롬케이카 ${n}이 구매 전에 꼭 확인해야 할 체크리스트를 정리했습니다.`,
        (n) => `처음 중고차를 사려는 분들이 가장 많이 하시는 질문이 "무엇부터 확인해야 하나요?"입니다. 현장에서 중고차를 다루는 프롬케이카 ${n}이 계약 전에 반드시 확인하시길 권하는 10가지를 순서대로 정리했습니다.`
      ],
      sections: [
        { h: '구매 전 체크리스트 10가지', items: [
          ['사고·침수 이력 조회', '보험개발원 카히스토리 같은 서비스로 보험 사고 이력을 미리 조회해 보세요. 판매자가 말해 준 내용과 기록이 같은지 비교하는 것이 핵심입니다.'],
          ['성능·상태점검기록부 확인', '매매업자는 차량을 판매할 때 성능·상태점검기록부를 고객에게 교부하도록 되어 있습니다. 점검 일자와 주행거리가 현재 차량 상태와 맞는지 확인하세요.'],
          ['외판과 프레임 상태', '문, 후드, 펜더의 단차와 색 차이를 눈으로 확인하고, 프레임(골격) 부위에 용접·교환 흔적이 없는지 점검기록부와 대조합니다.'],
          ['주행거리 점검', '연식에 비해 주행거리가 지나치게 짧거나 길지 않은지 보고, 점검기록부·정비 이력과 일치하는지 확인합니다.'],
          ['소모품 상태', '타이어 마모, 브레이크 패드, 배터리, 엔진오일 상태는 구매 직후 추가 비용으로 이어질 수 있어 미리 봐 두는 것이 좋습니다.'],
          ['시운전', '시동 직후 소음, 변속 충격, 핸들 쏠림, 브레이크 반응, 에어컨 냉방까지 직접 타 보며 확인하세요.'],
          ['옵션 작동 여부', '창문, 선루프, 후방 카메라, 내비게이션, 시트 열선·통풍처럼 수리비가 큰 옵션이 실제로 작동하는지 하나씩 눌러 봅니다.'],
          ['등록원부와 권리관계', '압류·저당이 걸려 있지 않은지 자동차등록원부로 확인하고, 차량 명의가 판매자와 일치하는지 봅니다.'],
          ['계약서 특약', '보증 범위, 수리 약속, 인도 조건은 말로만 하지 말고 계약서에 문서로 남겨 두세요.'],
          ['총비용 확인', '차량 가격 외에 이전 등록 비용, 보험료, 세금 등 부대비용을 합친 총액을 미리 확인해야 예산이 어긋나지 않습니다.']
        ] }
      ],
      outros: [
        '체크리스트를 하나씩 확인하다 보면 좋은 차와 아쉬운 차가 분명하게 보입니다. 확인이 어렵거나 궁금한 항목이 있다면 편하게 문의 주세요.',
        '중고차는 서두르지 않고 확인할수록 만족도가 높아집니다. 궁금한 점은 언제든 연락 주세요.'
      ]
    },
    {
      id: 'accident',
      label: '무사고 중고차 확인법 (성능점검기록부)',
      title: '무사고 중고차 확인하는 방법 — 성능점검기록부 보는 법',
      tags: ['무사고중고차', '성능점검기록부', '중고차사고이력', '중고차확인'],
      intros: [
        (n) => `"무사고 차량입니다"라는 말만 믿고 계약하셨다가 나중에 후회하는 경우가 적지 않습니다. 프롬케이카 ${n}이 무사고 여부를 직접 확인하는 방법과 성능·상태점검기록부 보는 법을 쉽게 정리했습니다.`,
        (n) => `중고차를 고를 때 가장 중요한 기준은 단연 사고 이력입니다. 수원에서 중고차를 다루는 프롬케이카 ${n}이 무사고 차량을 확인하는 방법을 정리해 드립니다.`
      ],
      sections: [
        { h: '무사고 차량이란?', p: '일반적으로 무사고는 차량의 주요 골격(프레임) 부위에 손상이나 교환·수리 이력이 없는 차량을 뜻합니다. 문이나 범퍼처럼 바깥 패널만 교환하거나 도색한 경우는 보통 단순 교환·수리로 분류되어 사고 이력과는 구분됩니다. 다만 업체마다 표현이 다를 수 있어 기록으로 직접 확인하는 것이 안전합니다.' },
        { h: '성능·상태점검기록부 보는 법', items: [
          ['사고·교환·수리 이력', '외판 부위는 교환(X), 판금 또는 용접(W) 같은 기호로 표시됩니다. 표시된 부위가 어디인지, 몇 군데인지 확인하세요.'],
          ['주요 골격 부위', '프레임 계열 부위에 이력이 표시되어 있다면 사고 차량으로 보는 것이 일반적입니다. 무사고라고 들었는데 이 항목에 표시가 있다면 반드시 확인해야 합니다.'],
          ['주행거리와 점검 일자', '점검 당시 주행거리가 현재 계기판과 크게 다르지 않은지, 점검 일자가 너무 오래되지 않았는지 봅니다.'],
          ['엔진·변속기 상태', '누유나 작동 이상 여부가 적혀 있는지 확인하고, 이상이 있다면 수리 계획이나 가격에 반영되어 있는지 물어보세요.']
        ] },
        { h: '보험 이력으로 한 번 더 확인', p: '보험 처리 이력은 보험개발원 카히스토리 같은 서비스에서 조회할 수 있습니다. 다만 자비로 수리한 경우에는 보험 이력에 남지 않을 수 있으므로, 점검기록부와 직접 확인을 함께 해야 정확합니다.' },
        { h: '눈으로 확인하는 팁', items: [
          ['패널 틈새', '문, 후드, 트렁크 사이의 틈이 좌우 균일한지 보세요. 한쪽만 넓거나 좁다면 교환·수리 가능성이 있습니다.'],
          ['도장 상태', '밝은 곳에서 색과 광택이 부위마다 다르지 않은지 확인합니다.'],
          ['볼트와 실링', '후드·펜더 볼트의 도색이 벗겨졌거나 실링(코킹) 자국이 고르지 않다면 분해 이력을 의심해 볼 수 있습니다.'],
          ['트렁크·엔진룸 내부', '겉으로는 깨끗해도 내부 용접 자국이나 판금 흔적은 안쪽에서 드러나는 경우가 많습니다.']
        ] }
      ],
      outros: [
        '기록과 눈으로 확인하는 과정을 함께 거치면 사고 차량을 피할 가능성이 크게 높아집니다. 직접 보고 싶은 차량이 있다면 방문 전에 연락 주세요.',
        '무사고 여부는 말이 아니라 기록으로 확인하는 것이 원칙입니다. 확인 방법이 궁금하시면 언제든 문의 주세요.'
      ]
    },
    {
      id: 'fake-listing',
      label: '허위매물 구별법과 안전한 거래 요령',
      title: '중고차 허위매물 구별법과 안전하게 거래하는 요령',
      tags: ['허위매물', '중고차사기예방', '중고차안전거래', '중고차구매주의'],
      intros: [
        (n) => `중고차 허위매물은 아직도 구매자들이 가장 걱정하는 문제 중 하나입니다. 프롬케이카 ${n}이 허위매물을 구별하는 방법과 안전하게 거래하는 요령을 정리했습니다.`,
        (n) => `온라인에서 마음에 드는 중고차를 발견했는데 가격이 너무 좋다면 한 번 더 의심해 봐야 합니다. 프롬케이카 ${n}이 허위매물 구별법을 알려 드립니다.`
      ],
      sections: [
        { h: '이런 매물은 조심하세요', items: [
          ['시세보다 지나치게 저렴한 가격', '같은 연식·주행거리 차량과 비교했을 때 이유 없이 크게 저렴하다면 미끼 매물일 가능성이 있습니다.'],
          ['차량번호를 알려 주지 않는 경우', '정상적인 매물은 차량번호로 이력 조회와 점검기록부 확인이 가능합니다. 번호 공개를 꺼린다면 이유를 물어보세요.'],
          ['계약금부터 보내라는 요구', '차량을 직접 보기 전에 계약금이나 보증금을 먼저 입금하라는 요구는 특히 주의해야 합니다.'],
          ['방문을 피하거나 다른 곳으로 유도', '실제 차량이 있는 곳으로 오라고 하지 않고 다른 장소나 다른 차량으로 유도한다면 의심해 봐야 합니다.']
        ] },
        { h: '안전하게 거래하는 순서', items: [
          ['판매자 확인', '자동차매매업 등록 여부와 매매종사원증을 확인하고, 계약서의 판매자 정보와 일치하는지 봅니다.'],
          ['차량 직접 확인', '사진과 실제 차량이 같은지, 차량번호가 같은지 현장에서 확인합니다.'],
          ['서류 확인', '성능·상태점검기록부와 자동차등록증의 내용이 서로 맞는지 대조합니다.'],
          ['대금 지급', '계약서를 작성한 뒤 계약서에 적힌 판매자 명의의 계좌로 지급하고, 영수증을 받아 두세요.']
        ] }
      ],
      outros: [
        '조금 번거롭더라도 확인 절차를 거치는 것이 가장 안전한 방법입니다. 차량을 직접 보고 설명을 듣고 싶으시다면 방문 전에 연락 주세요.',
        '좋은 차를 안전하게 사는 것이 가장 중요합니다. 궁금한 점이 있다면 언제든 문의해 주세요.'
      ]
    },
    {
      id: 'import-vs-domestic',
      label: '수입 중고차 vs 국산 중고차',
      title: '수입 중고차 vs 국산 중고차, 어떤 차를 사야 할까',
      tags: ['수입중고차', '국산중고차', '중고차비교', '수입차중고'],
      intros: [
        (n) => `같은 예산이면 국산 신형을 살지, 수입 중고차를 살지 고민하시는 분들이 많습니다. 프롬케이카 ${n}이 두 선택의 장단점을 비교해 드립니다.`,
        (n) => `수입 중고차는 매력적이지만 유지비가 걱정되고, 국산 중고차는 안정적이지만 아쉬운 부분이 있습니다. 프롬케이카 ${n}이 기준을 정리해 드립니다.`
      ],
      sections: [
        { h: '비교 포인트', items: [
          ['가격과 감가', '일반적으로 수입차는 신차 가격 대비 감가가 큰 편이라, 같은 예산으로 더 높은 차급이나 옵션의 차량을 만나볼 수 있습니다.'],
          ['부품값과 정비비', '수입차는 부품값과 공임이 국산차보다 높은 경우가 많습니다. 구매 전에 소모품 교체 비용과 정비 가능한 곳을 알아 두세요.'],
          ['서비스망', '국산차는 전국에 정비 거점이 많아 접근성이 좋고, 수입차도 인기 모델은 전문 정비소가 잘 갖춰져 있습니다.'],
          ['보험료와 세금', '배기량과 차량 가격에 따라 보험료와 세금이 달라지므로 구매 전에 대략적인 연간 비용을 계산해 보시길 권합니다.'],
          ['되팔 때', '국산차는 수요가 꾸준하고, 수입차는 모델과 상태에 따라 차이가 큽니다. 인기 모델과 관리 상태가 좋을수록 유리합니다.']
        ] },
        { h: '이런 분께 추천', items: [
          ['국산 중고차', '유지비를 최대한 아끼고 싶거나 정비 접근성을 중요하게 생각하는 분'],
          ['수입 중고차', '같은 예산으로 더 높은 차급과 주행 감성, 옵션을 누리고 싶은 분']
        ] }
      ],
      outros: [
        '정답은 없지만 예산, 주행 패턴, 유지비 기준을 정하면 선택이 훨씬 쉬워집니다. 고민되는 차량이 있다면 상담해 드립니다.',
        '어떤 차든 상태가 좋은 차를 고르는 것이 가장 중요합니다. 비교하고 싶은 모델이 있다면 편하게 문의 주세요.'
      ]
    },
    {
      id: 'export-guide',
      label: '한국 중고차 수출 절차 한눈에 보기',
      title: '한국 중고차 수출 절차 한눈에 보기',
      tags: ['중고차수출', '한국중고차수출', '자동차수출', '중고차수출절차'],
      intros: [
        (n) => `한국 중고차는 품질과 관리 상태가 좋아 해외 바이어들에게 꾸준히 인기가 있습니다. 중고차 수출을 전문으로 하는 프롬케이카 ${n}이 수출 절차를 한눈에 볼 수 있게 정리했습니다.`,
        (n) => `해외로 중고차를 보내려면 어떤 과정을 거쳐야 할까요? 수출 딜러인 프롬케이카 ${n}이 차량 선택부터 선적까지의 흐름을 설명해 드립니다.`
      ],
      sections: [
        { h: '수출 절차 6단계', items: [
          ['1. 상담과 차량 선택', '바이어가 원하는 차종, 예산, 목적지를 알려 주시면 조건에 맞는 차량을 추천해 드립니다.'],
          ['2. 가격과 조건 확정', '차량 가격에 수출 비용이 포함되는지, 어느 항구까지 책임지는지(FOB, CIF 등) 거래 조건을 명확히 합니다.'],
          ['3. 계약과 대금 결제', '계약서를 작성하고 약속한 방식으로 대금을 결제합니다.'],
          ['4. 수출 서류와 말소 등록', '국내 등록을 말소하고 수출신고에 필요한 서류를 준비합니다.'],
          ['5. 통관과 선적', '수출 통관을 마친 뒤 항구에서 선박에 선적합니다. 차량 운송은 RoRo 선박이나 컨테이너 방식이 주로 쓰입니다.'],
          ['6. 현지 도착과 통관', '목적지 항구에 도착한 후 현지 수입 통관 절차를 거쳐 차량을 인수합니다.']
        ] },
        { h: '미리 확인해야 할 점', p: '목적지 국가마다 수입 가능한 차량의 연식, 배기량, 연료 종류 등에 대한 규정이 다르고 수시로 바뀔 수 있습니다. 차량을 고르기 전에 현지 수입 규정부터 확인하는 것이 중요합니다. 또한 차량 상태를 사진과 영상으로 충분히 확인한 뒤 결정하시길 권해 드립니다.' }
      ],
      outros: [
        '프롬케이카는 수출 상담뿐 아니라 국내 구매 상담도 함께 진행하고 있습니다. 차량과 조건이 궁금하시면 언제든 문의해 주세요.',
        '수출 절차가 복잡해 보여도 단계별로 나누면 어렵지 않습니다. 궁금한 점은 편하게 문의 주세요.'
      ]
    }
  ];

  /**
   * 정보성 글. cars에 판매중인 매물이 있으면 글 아래에 추천 매물 링크를 넣는다.
   * @returns {{title: string, html: string, text: string, tags: string}}
   */
  function generateTopic(topicId, opts) {
    const o = { seed: 0, cars: [], ...(opts || {}) };
    const topic = TOPICS.find((t) => t.id === topicId) || TOPICS[0];
    const v = (arr, salt) => arr[(hash(topic.id) + o.seed + (salt || 0)) % arr.length];
    const blocks = [];

    blocks.push({ type: 'p', text: v(topic.intros, 1)(DEALER.name) });
    topic.sections.forEach((s) => {
      blocks.push({ type: 'h', text: s.h });
      if (s.p) blocks.push({ type: 'p', text: s.p });
      if (s.items) blocks.push({ type: 'items', items: s.items.map(([b, t]) => ({ b, t })) });
    });
    blocks.push({ type: 'p', text: v(topic.outros, 2) });

    const onSale = (o.cars || []).filter((c) => c.status !== '판매완료' && !c.deleted)
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)).slice(0, 3);
    if (onSale.length) {
      blocks.push({ type: 'h', text: '프롬케이카 추천 매물' });
      blocks.push({ type: 'kv', items: onSale.map((c) => [`${c.title}${priceText(c) ? ' ' + priceText(c) : ''}`, carUrl(c)]) });
    }
    blocks.push(...contactBlocks(null));

    const tags = ['수원중고차', '중고차', '프롬케이카', ...topic.tags];
    return {
      title: `${topic.title} - 프롬케이카`,
      html: renderHtml(blocks),
      text: renderText(blocks),
      tags: [...new Set(tags)].map((t) => `#${t}`).join(' ')
    };
  }

  /* ---------------- 다른 채널용 짧은 소개글 ---------------- */
  const SHORT_CHANNELS = [
    { id: 'instagram', label: '인스타그램' },
    { id: 'daangn', label: '당근마켓' },
    { id: 'kakao', label: '카카오톡·문자' }
  ];

  function badgeWords(car) {
    const w = [];
    if (car.is_new_car) w.push('완전신차');
    if (effectiveNoAccident(car)) w.push('완전무사고');
    if (car.badge_no_paint) w.push('무도색');
    return w;
  }

  function infoLines(car) {
    const lines = [];
    if (car.year_info) lines.push(['연식', car.year_info]);
    if (car.mileage || car.mileage === 0) lines.push(['주행거리', kmText(car.mileage)]);
    if (car.fuel_type) lines.push(['연료', car.fuel_type]);
    return lines;
  }

  function generateShort(car, channel) {
    const adv = buildAdvantages(car);
    const price = priceText(car) || '문의';
    const words = badgeWords(car);
    const sold = car.status === '판매완료' ? '[판매완료] ' : '';
    const info = infoLines(car);

    if (channel === 'instagram') {
      const extra = ['카스타그램', '차스타그램', '수입중고차', '중고차추천', '중고차딜러', '수원', '자동차', '중고차구매'];
      const tags = [...new Set([...buildTags(car).split(' ').map((t) => t.replace('#', '')), ...extra])].slice(0, 25).map((t) => `#${t}`).join(' ');
      const lines = [
        `🚗 ${sold}${car.title}`,
        words.length ? words.map((w) => `✅ ${w}`).join('  ') : '',
        '',
        `💰 ${price}`,
        ...info.map(([k, val]) => `${{ 연식: '📅', 주행거리: '🛣', 연료: '⛽' }[k]} ${val}`),
        '',
        ...adv.slice(0, 3).map((a) => `✔ ${a.b}`),
        '',
        '📍 수원 SKV1모터스',
        `📞 ${DEALER.phone} (전화·카톡·문자)`,
        '🔗 더 많은 매물은 프로필 링크에서 확인하세요 (fromkcar.kr)',
        '',
        tags
      ];
      return { text: lines.join('\n').replace(/\n{3,}/g, '\n\n'), note: '인스타그램 게시물 설명란에 붙여넣으세요. 해시태그는 25개 이내로 맞춰져 있습니다.' };
    }

    if (channel === 'daangn') {
      const mark = words[0] || '중고차';
      const lines = [
        `[${mark}] ${parseYears(car.year_info).model ? parseYears(car.year_info).model + '년형 ' : ''}${car.title}`,
        '',
        `가격: ${price}`,
        ...info.map(([k, val]) => `${k}: ${val}`),
        !noInfo(car.color) ? `색상: ${car.color}${!noInfo(car.seat_color) ? ' / 내장 ' + car.seat_color : ''}` : '',
        '',
        '▶ 이 차량의 장점',
        ...adv.slice(0, 5).map((a) => `- ${a.b}: ${a.t}`),
        '',
        '▶ 위치: 수원 SKV1모터스 (경기도 수원시 권선구 평동로79번길 45)',
        `▶ 문의: ${DEALER.phone} (전화·문자·카카오톡)`,
        '',
        '※ 실제 차량 상태는 방문하셔서 직접 확인하실 수 있습니다. 방문 전에 연락 주세요.'
      ];
      return { text: lines.join('\n').replace(/\n{3,}/g, '\n\n'), note: '당근마켓은 연락처나 외부 링크에 대한 운영 규정이 있을 수 있어요. 게시가 막히면 "문의" 줄을 지우고 올려 주세요.' };
    }

    // 카카오톡·문자: 고객에게 바로 보낼 수 있는 짧은 안내
    const lines = [
      `[프롬케이카] ${sold}${car.title}`,
      info.map(([, val]) => val).join(' · '),
      `💰 ${price}`,
      adv.length ? `✔ ${adv.slice(0, 3).map((a) => a.b).join(' / ')}` : '',
      '',
      `🔗 사진·상세 보기: ${carUrl(car, 'kakao')}`,
      `📞 ${DEALER.name} ${DEALER.phone}`
    ];
    return { text: lines.join('\n').replace(/\n{3,}/g, '\n\n'), note: '상담 중인 고객에게 카카오톡이나 문자로 바로 보낼 수 있는 짧은 안내문입니다. 링크로 들어온 방문은 리포트에 "링크 꼬리표: kakao"로 잡힙니다.' };
  }

  /* ---------------- 블로그 대표 이미지 (정사각형 PNG) ---------------- */
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('사진을 불러오지 못했습니다.'));
      img.src = src;
    });
  }

  function coverFit(ctx, img, x, y, w, h) {
    const scale = Math.max(w / img.width, h / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 제목을 maxWidth 안에서 최대 maxLines줄로 나눈다 (넘치면 "…").
  function wrapLines(ctx, text, maxWidth, maxLines) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (ctx.measureText(test).width > maxWidth && cur) {
        lines.push(cur);
        cur = w;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) {
      const kept = lines.slice(0, maxLines);
      kept[maxLines - 1] = kept[maxLines - 1].replace(/\s*\S*$/, '') + '…';
      return kept;
    }
    return lines;
  }

  /** 대표 사진 위에 뱃지·차량명·가격을 얹은 1080x1080 이미지를 canvas에 그린다. 사진을 못 읽으면 예외를 던진다. */
  async function renderCover(car, canvas) {
    const W = 1080;
    const H = 1080;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const src = car.main_image || (Array.isArray(car.images) && car.images[0]);
    if (!src) throw new Error('등록된 사진이 없습니다.');
    const img = await loadImage(src);
    if (document.fonts && document.fonts.load) {
      await Promise.all([document.fonts.load('800 56px "Noto Sans KR"'), document.fonts.load('700 30px "Noto Sans KR"'), document.fonts.load('800 36px "Poppins"')]).catch(() => {});
    }
    const FONT = '"Noto Sans KR", "Malgun Gothic", sans-serif';
    const NAVY = '#0b1b3a';
    const GOLD = '#fcd34d';

    ctx.fillStyle = NAVY;
    ctx.fillRect(0, 0, W, H);
    coverFit(ctx, img, 0, 0, W, 700);
    const g = ctx.createLinearGradient(0, 520, 0, 700);
    g.addColorStop(0, 'rgba(11,27,58,0)');
    g.addColorStop(1, 'rgba(11,27,58,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 520, W, 180);

    // 뱃지 (왼쪽 위)
    const chips = [];
    if (car.is_new_car) chips.push(['완전신차', '#f59e0b', '#3b2300']);
    if (effectiveNoAccident(car)) chips.push(['완전무사고', '#16a34a', '#ffffff']);
    if (car.badge_no_paint) chips.push(['NO PAINT', '#2563eb', '#ffffff']);
    let cx = 40;
    ctx.font = `800 36px ${FONT}`;
    ctx.textBaseline = 'middle';
    chips.forEach(([label, bg, fg]) => {
      const w = ctx.measureText(label).width + 48;
      roundRect(ctx, cx, 40, w, 68, 34);
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.fillStyle = fg;
      ctx.fillText(label, cx + 24, 75);
      cx += w + 14;
    });

    // 차량명
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 54px ${FONT}`;
    const titleLines = wrapLines(ctx, car.title || '', W - 80, 2);
    titleLines.forEach((line, i) => ctx.fillText(line, 40, 760 + i * 66));

    // 가격
    const priceY = 760 + (titleLines.length - 1) * 66 + 130;
    ctx.fillStyle = GOLD;
    ctx.font = `800 110px ${FONT}`;
    ctx.fillText(priceText(car) || '가격 문의', 40, priceY);

    // 연식 · 주행거리 · 연료
    const meta = [car.year_info ? car.year_info.replace(/\(.*\)/, '').trim() : '', Number(car.mileage) >= 0 && car.mileage !== null && car.mileage !== undefined ? kmText(car.mileage) : '', car.fuel_type || ''].filter(Boolean).join('  ·  ');
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `700 34px ${FONT}`;
    ctx.fillText(meta, 40, priceY + 56);

    // 하단 서명
    ctx.fillStyle = GOLD;
    ctx.font = '800 34px "Poppins", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('FROM K CAR', W - 40, H - 36);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = `600 26px ${FONT}`;
    ctx.fillText(`수원 SKV1모터스 · ${DEALER.phone}`, W - 40, H - 78);
    ctx.textAlign = 'left';
  }

  global.KCarBlog = { generate, generateTopic, generateShort, renderCover, TOPICS, SHORT_CHANNELS, DEALER };
})(window);
