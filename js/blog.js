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
    if (global.KCarKo) return global.KCarKo.koBrand(car);
    const b = String(car.brand || '').trim();
    return BRAND_KO[b.toLowerCase()] || b;
  }

  // 한글 차명 (js/korean-name.js): 영문 차명 "KIA THE NEW SORENTO ..." → "기아 쏘렌토". 관리자가 입력한 title_ko가 있으면 그것을 쓴다.
  function koName(car) {
    return global.KCarKo ? global.KCarKo.koName(car) : String(car.title || '');
  }

  // 목록/비교 글에서 쓰는 이름: 한글 차명을 앞세우고 원래 차명을 괄호로 덧붙인다.
  function carLabel(c) {
    const ko = koName(c);
    return ko && ko !== c.title ? `${ko} (${c.title})` : String(c.title || '');
  }

  function fuelWord(car) {
    const f = String(car.fuel_type || '');
    if (/전기|EV/i.test(f)) return '전기';
    if (/하이브리드|HEV/i.test(f)) return '하이브리드';
    if (/디젤/.test(f)) return '디젤';
    if (/가솔린|휘발유/.test(f)) return '가솔린';
    return '';
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

  // 고객이 실제로 묻는 질문 + 이 매물 데이터로 답할 수 있는 답변만 쓴다 (없는 사실을 지어내지 않는다)
  function buildFaq(car, ko, short) {
    const price = priceText(car) || '문의';
    const sold = car.status === '판매완료';
    let accident;
    if (effectiveNoAccident(car)) {
      accident = '완전무사고 차량입니다. 성능점검기록부와 보험 이력으로 확인하실 수 있고, 방문하시면 서류를 함께 보여드립니다.';
    } else if (!noInfo(car.accident_info)) {
      accident = `사고 이력은 "${car.accident_info}"로 확인됩니다. 자세한 내용은 성능점검기록부를 함께 보며 설명드립니다.`;
    } else {
      accident = '사고 이력은 성능점검기록부 기준으로 확인해 상세히 설명드립니다. 문의 주세요.';
    }
    return [
      { q: `${short} 중고차 사고 이력은 어떤가요?`, a: accident },
      { q: `${ko} 중고차 가격은 얼마인가요?`, a: `${sold ? '판매 당시' : '판매'} 가격은 ${price}입니다. 가격과 판매 상태는 변동될 수 있으니 문의하실 때 최신 정보를 확인해 주세요.` },
      { q: `${short} 실차는 어디서 볼 수 있나요?`, a: `수원 SKV1모터스(${DEALER.address})에서 직접 확인하실 수 있습니다. 방문 전에 ${DEALER.phone}로 연락 주시면 차량을 준비해 두겠습니다.` },
      { q: `${short} 구매 절차는 어떻게 되나요?`, a: '전화나 카카오톡으로 상담한 뒤 차량을 확인하고 계약, 이전 등록 순서로 진행됩니다. 필요한 서류와 비용은 상담할 때 안내해 드립니다.' }
    ];
  }

  function contactBlocks(carLink, heading) {
    const items = [
      ['담당', `${DEALER.team} ${DEALER.name}`],
      ['휴대폰', DEALER.phone],
      ['전화', DEALER.tel],
      ['카카오톡 상담', DEALER.kakao],
      ['주소', DEALER.address]
    ];
    if (carLink) items.push(['이 차량 자세히 보기', carLink]);
    items.push(['전체 매물 보기', `${SITE}/?src=naver_blog`]);
    return [{ type: 'h', text: heading || '상담 · 방문 안내' }, { type: 'kv', items }];
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
    const kom = global.KCarKo ? global.KCarKo.koModel(car) : '';
    if (kom) return kom.replace(/\s+/g, '');
    const title = String(car.title || '');
    const ko = title.match(/[가-힣]{2,}/);
    if (ko) return ko[0];
    const upper = title.toUpperCase();
    const known = Object.keys(MODEL_KO).find((k) => upper.includes(k));
    if (known) return MODEL_KO[known];
    const m = title.match(/\b([A-Za-z]{1,3}\d{1,3}[A-Za-z]?)\b/);
    return m ? m[1].toUpperCase() : '';
  }

  // 네이버 블로그 태그: 검색어로 실제 쓰이는 한글 키워드를 우선해 10개 이내로 (태그를 너무 많이 달면 오히려 스팸처럼 보인다)
  function buildTags(car) {
    const bk = brandKo(car).replace(/\s+/g, '');
    const model = modelKeyword(car);
    const fuel = fuelWord(car);
    const yrs = parseYears(car.year_info);
    const tags = ['수원중고차'];
    if (model) tags.push(`${model}중고차`);
    if (model && fuel) tags.push(`${model}${fuel}`);
    if (bk) tags.push(`${bk}중고차`);
    if (car.is_new_car) tags.push('신차급중고차');
    if (effectiveNoAccident(car)) tags.push('무사고중고차');
    if (global.KCarKo && global.KCarKo.isImport(car)) tags.push('수입중고차');
    if (yrs.model) tags.push(`${yrs.model}년식`);
    tags.push('프롬케이카', '경기중고차');
    return [...new Set(tags)].slice(0, 10).map((t) => `#${t}`).join(' ');
  }

  // 제목에서 중요도가 낮은 조각부터 빼서 길이(max자) 안에 맞춘다. 네이버 검색 결과에서는 30~35자 안팎에서 잘리므로
  // 핵심 키워드("수원 + 한글 모델 + 중고차")를 항상 맨 앞에 두고, 가격·연식·상태는 뒤에 붙인다.
  function fitTitle(parts, max) {
    let list = parts.filter((p) => p.t);
    const join = () => list.map((p) => p.t).join(' ').replace(/\s+\|\s+/g, ' | ').replace(/\s+/g, ' ').trim();
    while (join().length > max && list.length > 1) {
      const low = list.reduce((m, p) => (p.p < m.p ? p : m), list[0]);
      if (low.p >= 10) break;
      list = list.filter((p) => p !== low);
    }
    return join();
  }

  function buildTitle(car, seed) {
    const yrs = parseYears(car.year_info);
    const ko = koName(car);
    const year = yrs.model ? `${yrs.model}년식` : '';
    const fuel = fuelWord(car);
    const mark = car.is_new_car ? '신차급' : (effectiveNoAccident(car) ? '무사고' : '');
    const marks = [car.is_new_car ? '신차급' : '', effectiveNoAccident(car) ? '무사고' : ''].filter(Boolean).join(' ');
    const km = !car.is_new_car && Number(car.mileage) > 0 ? `주행 ${kmText(car.mileage)}` : (car.is_new_car && (car.mileage || car.mileage === 0) ? `주행 ${kmText(car.mileage)}` : '');
    const price = priceText(car);
    const variants = [
      [{ t: `수원 ${ko} 중고차`, p: 10 }, { t: year, p: 5 }, { t: mark, p: 7 }, { t: price, p: 6 }],
      [{ t: `${ko}${fuel ? ' ' + fuel : ''} 중고 가격`, p: 10 }, { t: marks ? `| 수원 ${marks} 매물` : '| 수원 중고차 매물', p: 7 }],
      [{ t: `${ko} 중고차,`, p: 10 }, { t: km, p: 5 }, { t: mark, p: 7 }, { t: price, p: 8 }, { t: '(수원 프롬케이카)', p: 4 }],
      [{ t: `수원 ${ko} 중고차`, p: 10 }, { t: year, p: 6 }, { t: fuel, p: 5 }, { t: mark, p: 7 }, { t: '- 프롬케이카', p: 3 }]
    ];
    const pick = variants[(hash(String(car.id)) + seed) % variants.length];
    const prefix = car.status === '판매완료' ? '[판매완료] ' : '';
    return prefix + fitTitle(pick, 46);
  }

  /* ---------------- 브랜드 · 모델 이야기 ---------------- */
  // 널리 알려진 공개 정보만 짧게 담았다. 연도·사실은 게시 전에 한 번 더 확인하는 것이 좋다 (관리자 화면에도 안내가 있다).
  const BRAND_STORY = {
    'BMW': 'BMW는 1916년 독일 바이에른에서 항공기 엔진 제조사로 출발한 브랜드입니다. 이후 자동차와 오토바이로 영역을 넓혔고, "운전의 즐거움"을 앞세운 주행 감성으로 프리미엄 시장에서 입지를 다졌습니다.',
    '벤츠': '벤츠의 뿌리는 1886년 카를 벤츠가 특허를 받은 세계 최초의 내연기관 자동차로 거슬러 올라갑니다. 1926년 다임러와 벤츠가 합쳐지며 지금의 메르세데스-벤츠가 되었고, 안전과 고급스러움을 상징하는 브랜드로 자리 잡았습니다.',
    '볼보': '볼보는 1927년 스웨덴 예테보리에서 첫 차를 선보인 브랜드로, 안전을 최우선으로 하는 철학으로 유명합니다. 1959년 3점식 안전벨트를 개발하고 그 특허를 다른 업체도 쓸 수 있게 공개한 일화로 널리 알려져 있습니다.',
    '기아': '기아는 1944년 자전거 부품을 만드는 회사로 출발해 한국을 대표하는 완성차 브랜드로 성장했습니다. 1998년부터 현대자동차그룹의 일원으로 SUV와 전기차 라인업을 빠르게 넓혀 왔습니다.',
    '현대': '현대자동차는 1967년 설립되어 1975년 한국 최초의 고유 모델 "포니"를 선보인 한국 대표 완성차 브랜드입니다. 오늘날에는 SUV와 전기차(아이오닉) 라인업으로 세계 시장에서 존재감을 키우고 있습니다.',
    '제네시스': '제네시스는 2015년 현대자동차가 독립 브랜드로 선보인 프리미엄 브랜드입니다. 세단 G80, G90과 SUV GV70, GV80 등으로 라인업을 넓히며 국산 프리미엄 시장을 이끌고 있습니다.',
    '혼다': '혼다는 1948년 일본에서 혼다 소이치로가 창업한 브랜드로, 엔진 기술력으로 이름을 알렸습니다. 신뢰성과 실용성을 중시하는 SUV와 미니밴으로 꾸준한 인기를 얻고 있습니다.',
    '토요타': '토요타는 1937년 일본에서 자동차 사업을 시작한 브랜드로, 1997년 세계 최초의 양산 하이브리드 "프리우스"를 선보인 것으로 유명합니다. 내구성과 신뢰성 면에서 높은 평가를 받아 왔습니다.',
    '렉서스': '렉서스는 1989년 토요타가 선보인 프리미엄 브랜드로, 정숙성과 꼼꼼한 품질 관리, 하이브리드 기술로 알려져 있습니다.',
    '아우디': '아우디는 1909년 독일에서 창업한 브랜드로, "기술을 통한 진보(Vorsprung durch Technik)"라는 슬로건으로 유명합니다. 1980년대 선보인 콰트로 사륜구동 시스템이 대표적인 기술로 꼽힙니다.',
    '폭스바겐': '폭스바겐은 "국민차"라는 뜻으로, 1937년 독일에서 시작했습니다. 비틀과 골프로 대중에게 사랑받아 온 브랜드입니다.',
    '포르쉐': '포르쉐는 1931년 페르디난트 포르쉐 박사가 독일 슈투트가르트에서 설립한 스포츠카 브랜드입니다. 911로 대표되는 주행 성능과, SUV 카이엔·마칸으로도 폭넓은 사랑을 받고 있습니다.',
    '랜드로버': '랜드로버는 1948년 영국에서 첫 모델을 선보인 오프로드 SUV 전문 브랜드입니다. 레인지로버와 디펜더 같은 대표 모델로 알려져 있습니다.',
    '테슬라': '테슬라는 2003년 미국에서 설립된 전기차 전문 브랜드로, 소프트웨어 업데이트와 자체 충전 인프라로 전기차 시장을 이끌어 왔습니다.',
    '미니': '미니는 1959년 영국에서 첫 모델이 나온 소형차 브랜드로, 개성 있는 디자인과 경쾌한 주행감으로 사랑받아 왔으며 지금은 BMW 그룹에 속해 있습니다.',
    '포드': '포드는 1903년 헨리 포드가 설립하고, 1908년 모델 T로 자동차 대중화를 이끈 미국 브랜드입니다.',
    '지프': '지프는 제2차 세계대전 군용차에서 출발한 미국의 오프로드 SUV 브랜드로, 랭글러로 대표되는 험로 주행 능력으로 유명합니다.',
    '쉐보레': '쉐보레는 1911년 미국에서 시작된 브랜드로, 한국에서는 한국GM을 통해 판매되고 있습니다.',
    'KG모빌리티': 'KG모빌리티는 쌍용자동차가 2023년 새 이름으로 출발한 브랜드로, 토레스·렉스턴 등 SUV 중심의 라인업을 갖추고 있습니다.',
    '르노': '르노코리아는 르노삼성자동차에서 2022년 이름을 바꾼 브랜드로, 프랑스 르노 그룹의 한국 법인입니다.'
  };

  const MODEL_STORY = {
    '쏘렌토': '쏘렌토는 2002년 처음 출시된 기아의 대표 중형 SUV로, 세대를 거듭하며 패밀리 SUV 시장에서 꾸준한 사랑을 받고 있습니다.',
    '카니발': '카니발은 1998년 처음 선보인 기아의 대표 미니밴(MPV)입니다. 넉넉한 실내 공간으로 대가족과 패밀리카 수요에서 꾸준히 사랑받아 왔습니다.',
    '스포티지': '스포티지는 1993년 처음 출시된 기아의 대표 준중형 SUV로, 국산 SUV 시장을 연 모델 중 하나로 꼽힙니다.',
    'EV6': 'EV6는 2021년 출시된 기아 최초의 전기차 전용 모델로, 전용 플랫폼(E-GMP)을 바탕으로 만들어졌습니다.',
    '모닝': '모닝은 2004년 처음 출시된 기아의 대표 경차입니다.',
    '그랜저': '그랜저는 1986년 처음 출시된 현대자동차의 대표 준대형 세단으로, 오랫동안 국산 고급 세단의 대명사로 불려 왔습니다.',
    '쏘나타': '쏘나타는 1985년 처음 출시된 현대자동차의 대표 중형 세단으로, 오랜 기간 국민 세단으로 사랑받아 왔습니다.',
    '팰리세이드': '팰리세이드는 2018년 출시된 현대자동차의 대형 SUV로, 넉넉한 3열 공간으로 큰 인기를 얻었습니다.',
    '싼타페': '싼타페는 2000년 처음 출시된 현대자동차의 대표 중형 SUV입니다.',
    '투싼': '투싼은 2004년 처음 출시된 현대자동차의 준중형 SUV로, 도심형 SUV 시장에서 꾸준히 인기를 얻어 왔습니다.',
    '아반떼': '아반떼는 1990년 처음 출시된 현대자동차의 준중형 세단으로, 합리적인 가격과 실용성으로 사랑받아 왔습니다.',
    '아이오닉 5': '아이오닉 5는 2021년 출시된 현대자동차의 전기차 전용 플랫폼(E-GMP) 기반 모델입니다.',
    '아이오닉 6': '아이오닉 6는 2022년 출시된 현대자동차의 전기차 전용 플랫폼(E-GMP) 기반 모델로, 유선형 디자인이 특징입니다.',
    'GV80': 'GV80은 2020년 출시된 제네시스 최초의 SUV입니다. 제네시스 브랜드의 디자인과 고급 사양을 SUV로 구현한 모델로 알려져 있습니다.',
    'GV70': 'GV70은 2020년 출시된 제네시스의 중형 SUV로, 스포티한 주행감과 고급스러운 실내로 주목받았습니다.',
    'G80': 'G80은 제네시스를 대표하는 중대형 세단입니다. 2020년 출시된 3세대(RG3)부터 제네시스 고유의 디자인 언어를 본격적으로 보여 주었습니다.',
    'X3': 'BMW X3는 2003년 처음 출시된 BMW의 중형 SUV(SAV)입니다.',
    'X5': 'BMW X5는 1999년 BMW 최초의 SUV(SAV)로 출시되어 프리미엄 SUV 시장을 연 대표 모델입니다.',
    'X6': 'BMW X6는 2008년 처음 선보인 쿠페형 SUV(SAC)로, 쿠페형 SUV라는 장르를 대중화한 모델로 알려져 있습니다.',
    'X7': 'BMW X7은 2019년 출시된 BMW의 플래그십 SUV입니다.',
    '3시리즈': 'BMW 3시리즈는 1975년 처음 출시된 BMW의 대표 컴팩트 스포츠 세단입니다.',
    '5시리즈': 'BMW 5시리즈는 1972년 처음 출시된 BMW의 대표 중형 세단입니다.',
    '7시리즈': 'BMW 7시리즈는 1977년 처음 출시된 BMW의 플래그십 세단입니다.',
    'E클래스': '벤츠 E클래스는 오랜 역사를 가진 벤츠의 대표 중형 세단으로, 안전과 편의 신기술을 앞서 도입해 온 모델로 알려져 있습니다.',
    'S클래스': '벤츠 S클래스는 벤츠의 플래그십 세단으로, 새로운 기술을 가장 먼저 선보이는 모델로 알려져 있습니다.',
    'C클래스': '벤츠 C클래스는 벤츠의 대표 준중형 세단으로, S클래스의 감성을 담은 모델로 알려져 있습니다.',
    'ML': '벤츠 M클래스(ML)는 1997년 벤츠 최초의 양산 SUV로 출시된 모델로, 이후 GLE로 이름이 바뀌었습니다.',
    'GLE': '벤츠 GLE는 M클래스(ML)의 후속으로 2015년 이름이 바뀐 벤츠의 대표 중대형 SUV입니다.',
    'GLC': '벤츠 GLC는 2015년 GLK의 후속으로 나온 벤츠의 대표 중형 SUV입니다.',
    'XC60': '볼보 XC60은 2008년 처음 선보인 중형 SUV로, 볼보의 안전 기술을 담은 베스트셀러 모델입니다.',
    'XC90': '볼보 XC90은 2002년 출시된 볼보의 플래그십 SUV입니다.',
    'S90': '볼보 S90은 볼보의 플래그십 세단입니다.',
    '파일럿': '혼다 파일럿은 2002년 처음 출시된 3열 대형 SUV로, 넉넉한 실내 공간이 장점입니다.',
    '카이엔': '포르쉐 카이엔은 2002년 출시된 포르쉐 최초의 SUV로, 스포츠카의 주행 감각을 SUV에 담았다는 평가를 받았습니다.'
  };

  function modelStoryOf(car) {
    const m = global.KCarKo ? global.KCarKo.koModel(car) : '';
    if (!m) return '';
    if (MODEL_STORY[m]) return MODEL_STORY[m];
    if (/^ML\d*$/i.test(m)) return MODEL_STORY.ML;
    return '';
  }

  // 이 차량 자체의 이야기: 매물 데이터(연식·주행거리·색상·상태)만으로 쓴다. 이력이나 주인에 대해 지어내지 않는다.
  function carDataStory(car, ko, v) {
    const yrs = parseYears(car.year_info);
    const parts = [];
    if (yrs.reg) parts.push(`이 차량은 ${yrs.reg}년${yrs.regMonth && car.year_info.match(/월/) ? ` ${yrs.regMonth}월` : ''}에 등록된${yrs.model && yrs.model !== yrs.reg ? ` ${yrs.model}년형` : ''} ${ko}입니다.`);
    else parts.push(`이 차량은 프롬케이카에 입고된 ${ko}입니다.`);
    const km = Number(car.mileage);
    if (car.is_new_car && Number.isFinite(km)) parts.push(`주행거리는 ${kmText(km)}로 사실상 새 차 상태 그대로입니다.`);
    else if (Number.isFinite(km) && car.mileage !== null && car.mileage !== undefined && car.mileage !== '') parts.push(`지금까지 ${kmText(km)}를 달렸습니다.`);
    const colors = [noInfo(car.color) ? '' : `외장 ${car.color}`, noInfo(car.seat_color) ? '' : `내장 ${car.seat_color}`].filter(Boolean);
    if (colors.length) parts.push(`${colors.join(', ')} 조합입니다.`);
    const status = [effectiveNoAccident(car) ? '완전무사고' : '', car.badge_no_paint ? '무도색' : ''].filter(Boolean);
    parts.push(status.length ? `${status.join('·')} 상태로 프롬케이카에 입고되어 새 주인을 기다리고 있습니다.` : '지금은 수원 프롬케이카에서 새 주인을 기다리고 있습니다.');
    return parts.join(' ');
  }

  function storyBlocks(car, ko, short, v) {
    const blocks = [];
    const brand = brandKo(car);
    if (BRAND_STORY[brand]) {
      blocks.push({ type: 'h', text: `${brand} 브랜드 이야기` });
      blocks.push({ type: 'p', text: BRAND_STORY[brand] });
    }
    // 한글 모델명을 못 찾아 영문 차명이 길게 남은 경우에는 소제목을 "이 차량 이야기"로 짧게 쓴다
    const storyName = short.length > 18 ? '이 차량' : short;
    blocks.push({ type: 'h', text: v([`${storyName} 이야기`, `${storyName} 모델 이야기`], 7) });
    const ms = modelStoryOf(car);
    if (ms) blocks.push({ type: 'p', text: ms });
    blocks.push({ type: 'p', text: carDataStory(car, ko, v) });
    return blocks;
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

    // 검색 키워드: 한글 차명("기아 쏘렌토")을 첫 문장과 소제목에 자연스럽게 넣는다 (첫 150자 안에 핵심 키워드가 있어야 유리)
    const ko = koName(car);
    const short = (global.KCarKo && global.KCarKo.koModel(car)) || ko; // 소제목·질문에 섞어 써서 같은 키워드가 너무 반복되지 않게 한다
    const yearWord = yrs.model ? `${yrs.model}년식` : '';
    const kmWord = car.mileage || car.mileage === 0 ? `주행거리 ${kmText(car.mileage)}` : '';
    const markWords = [car.is_new_car ? '완전신차' : '', effectiveNoAccident(car) ? '완전무사고' : '', car.badge_no_paint ? '무도색' : ''].filter(Boolean).join(' ');
    const specLine = [yearWord, kmWord, fuelWord(car), markWords].filter(Boolean).join(', ');
    const spec = specLine ? `${specLine}의 ` : '';

    if (sold) {
      blocks.push({ type: 'p', text: `【판매완료 안내】 이 ${ko} 중고차는 현재 판매가 완료되었습니다. 비슷한 조건의 판매중인 차량은 아래 링크에서 확인해 주세요.` });
      blocks.push({ type: 'p', text: v([
        `안녕하세요, 수원 SKV1모터스 프롬케이카 ${DEALER.name}입니다. 많은 관심을 받았던 ${spec}${ko} 매물의 판매가 완료되어 소개글을 남깁니다.`,
        `프롬케이카 ${DEALER.name}입니다. ${spec}${ko} 차량은 좋은 주인을 만나 판매가 완료되었습니다. 수원에서 ${ko} 중고차를 찾으신다면 아래 내용을 참고해 주세요.`
      ], 1) });
      blocks.push({ type: 'p', text: `판매 당시 가격은 ${priceText(car) || '문의'}였습니다. 같은 조건의 차량을 찾으신다면 비슷한 매물을 안내해 드릴 수 있으니 편하게 문의 주세요.` });
    } else {
      blocks.push({ type: 'p', text: v([
        `수원에서 ${ko} 중고차를 찾고 계신가요? 프롬케이카 ${DEALER.name}입니다. ${spec}${ko} 매물이 입고되었습니다.`,
        `안녕하세요, 수원 SKV1모터스에서 중고차를 소개해 드리는 프롬케이카 ${DEALER.name}입니다. 오늘은 ${spec}${ko} 중고차를 소개합니다.`,
        `${ko} 중고차 가격이 궁금하신가요? 프롬케이카에 입고된 차량은 ${ko}(${specLine || car.title})입니다. 가격은 ${priceText(car) || '문의'}입니다.`,
        `수원 ${ko} 중고차를 알아보는 분들께 소개합니다. ${spec}${ko} 매물이 프롬케이카에 입고되었습니다.`
      ], 1) });

      blocks.push({ type: 'p', text: v([
        `가격은 ${priceText(car) || '문의'}이며, 아래에서 차량의 장점과 상태를 정리해 두었으니 끝까지 확인해 보세요.`,
        `판매 가격은 ${priceText(car) || '문의'}입니다. 이 차량이 왜 추천드릴 만한지 하나씩 말씀드리겠습니다.`,
        `${priceText(car) ? priceText(car) + '에 ' : ''}만나보실 수 있는 차량입니다. 장점과 상태를 꼼꼼히 정리했습니다.`
      ], 2) });
    }

    // 브랜드·모델 이야기: 글에 읽을 거리를 더하고, 독자가 차에 대해 이해한 상태에서 장점을 보게 한다
    blocks.push(...storyBlocks(car, ko, short, v));

    if (adv.length) {
      blocks.push({ type: 'h', text: v([`${ko} 중고차 장점`, `${ko} 중고차, 이런 점이 좋습니다`, `${ko} 핵심 포인트 정리`], 3) });
      blocks.push({ type: 'items', items: adv });
    }

    if (!sold) {
      blocks.push({ type: 'h', text: `${short} 중고차, 이런 분께 추천합니다` });
      blocks.push({ type: 'items', items: whoFits(car).map((t, i) => ({ b: `추천 ${i + 1}`, t })) });
    }

    if (car.description_ko && car.description_ko.trim()) {
      blocks.push({ type: 'h', text: '딜러 한마디' });
      blocks.push({ type: 'p', text: car.description_ko.trim() });
    }

    const kv = [];
    kv.push(['차량명', ko !== car.title ? `${ko} (${car.title})` : car.title]);
    if (car.year_info) kv.push(['연식', car.year_info]);
    if (car.mileage || car.mileage === 0) kv.push(['주행거리', kmText(car.mileage)]);
    if (car.fuel_type) kv.push(['연료', car.fuel_type]);
    if (car.transmission) kv.push(['변속기', car.transmission]);
    if (car.displacement) kv.push(['배기량', car.displacement]);
    if (!noInfo(car.color)) kv.push(['외장 색상', car.color]);
    if (!noInfo(car.seat_color)) kv.push(['내장 색상', car.seat_color]);
    kv.push(['판매 가격', priceText(car) || '문의']);
    blocks.push({ type: 'h', text: `${ko} 중고차 가격과 기본 정보` });
    blocks.push({ type: 'kv', items: kv });

    const options = Array.isArray(car.options) ? car.options.filter(Boolean) : [];
    if (options.length) {
      blocks.push({ type: 'h', text: `${short} 옵션 정리` });
      blocks.push({ type: 'p', text: options.slice(0, 30).join(' · ') });
    }

    const state = [];
    if (!noInfo(car.accident_info)) state.push(`사고 이력: ${car.accident_info}`);
    if (!noInfo(car.diagnosis_summary)) state.push(car.diagnosis_summary);
    if (state.length) {
      blocks.push({ type: 'h', text: `${short} 사고 이력·차량 상태` });
      state.forEach((s) => blocks.push({ type: 'p', text: s }));
    }

    // 질문 형태의 문장은 네이버 검색과 구글 요약 결과에 잘 잡힌다 (고객이 실제로 묻는 말로 구성)
    blocks.push({ type: 'h', text: `${short} 중고차 자주 묻는 질문` });
    blocks.push({ type: 'faq', items: buildFaq(car, ko, short) });

    if (opts.photos && Array.isArray(car.images) && car.images.length) {
      blocks.push({ type: 'h', text: `${ko} 차량 사진` });
      car.images.slice(0, 15).forEach((src) => {
        blocks.push({ type: 'img', url: /^https?:/.test(src) ? src : SITE + src });
      });
    }

    blocks.push({ type: 'h', text: v(['중고차 구매 전 꼭 확인하세요', '구매 전 체크 포인트'], 4) });
    blocks.push({ type: 'p', text: v([
      '중고차는 사진과 글만으로 판단하기보다 직접 보고 확인하시는 것이 가장 정확합니다. 방문 전에 미리 연락 주시면 차량을 준비해 두고 상세하게 설명드리겠습니다. 성능점검기록부와 사고 이력도 함께 확인하실 수 있습니다.',
      '실제 차량 상태는 직접 확인하시는 게 가장 좋습니다. 방문 상담을 원하시면 전화나 카카오톡으로 먼저 연락 주세요. 성능점검과 사고 이력 확인 방법도 친절하게 안내해 드립니다.'
    ], 5) });
    blocks.push({ type: 'items', items: [
      { b: '성능·상태점검기록부', t: '사고·교환·수리 이력과 주행거리를 기록으로 확인하세요.' },
      { b: '보험 이력 조회', t: '보험 처리 이력을 따로 조회해 판매자 설명과 같은지 비교해 보세요.' },
      { b: '시운전', t: '가속, 변속, 브레이크, 소음을 직접 타 보며 확인하는 것이 가장 정확합니다.' }
    ] });
    blocks.push({ type: 'p', text: '※ 판매 상태와 가격은 변동될 수 있으니 문의하실 때 최신 정보를 꼭 확인해 주세요.' });

    if (similar.length) {
      blocks.push({ type: 'h', text: '비슷한 판매중 차량' });
      blocks.push({ type: 'kv', items: similar.map((c) => [`${carLabel(c)}${priceText(c) ? ' ' + priceText(c) : ''}`, carUrl(c)]) });
    }

    blocks.push(...contactBlocks(url, `수원 ${ko} 중고차 방문·상담 안내`));
    blocks.push({ type: 'p', text: v([
      `${short}에 대해 궁금한 점은 언제든 편하게 문의 주세요. 감사합니다.`,
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
      if (b.type === 'faq') return b.items.map((i) => `<p style="${S.li}"><b>Q. ${esc(i.q)}</b><br>A. ${esc(i.a)}</p>`).join('');
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
      if (b.type === 'faq') return b.items.map((i) => `Q. ${i.q}\nA. ${i.a}`).join('\n');
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
    },
    {
      id: 'price-check',
      label: '중고차 시세, 이렇게 확인하세요',
      title: '중고차 시세 확인하는 방법 — 비싼 차와 싼 차를 가려내는 기준',
      tags: ['중고차시세', '중고차가격', '중고차시세확인', '중고차가격비교'],
      intros: [(n) => `중고차는 같은 모델이라도 차량마다 가격이 다르다 보니 "이 가격이 적당한가?"가 가장 큰 고민입니다. 프롬케이카 ${n}이 시세를 판단하는 기준을 정리했습니다.`],
      sections: [
        { h: '시세를 판단하는 기준', items: [
          ['같은 조건끼리 비교', '연식, 주행거리, 옵션, 색상이 비슷한 차량끼리 비교해야 의미가 있습니다. 모델명만 같다고 같은 가격대가 아닙니다.'],
          ['여러 매물 비교', 'KB차차차, 엔카 같은 중고차 사이트에서 같은 조건의 매물을 여러 개 찾아 가격 범위를 먼저 파악해 보세요.'],
          ['사고·도색 이력 반영', '무사고 차량과 사고·도색 이력이 있는 차량은 가격 차이가 큽니다. 이력까지 함께 비교해야 합니다.'],
          ['옵션과 트림', '같은 모델이라도 트림과 옵션(선루프, 어라운드뷰 등)에 따라 가격이 달라집니다.'],
          ['지나치게 싼 가격', '시세보다 이유 없이 크게 저렴하다면 사고 이력이나 문제가 숨어 있을 수 있어 더 꼼꼼히 확인해야 합니다.']
        ] },
        { h: '가격 협상 전에 정리할 것', p: '원하는 차량의 시세 범위를 알고 있으면 협상이 훨씬 쉬워집니다. 다만 단순히 싼 차를 찾기보다는 사고 이력, 상태, 부대비용까지 포함한 총비용을 기준으로 판단하시는 것이 결과적으로 이득입니다.' }
      ],
      outros: ['시세가 궁금한 차량이 있다면 언제든 문의 주세요. 비슷한 조건의 차량과 비교해 설명드립니다.']
    },
    {
      id: 'test-drive',
      label: '중고차 시운전 체크 요령',
      title: '중고차 시운전할 때 꼭 확인해야 할 것들',
      tags: ['중고차시운전', '중고차시승', '중고차확인', '중고차구매팁'],
      intros: [(n) => `중고차는 서류와 눈으로 보는 것만큼 직접 타 보는 것이 중요합니다. 프롬케이카 ${n}이 시운전 때 놓치기 쉬운 확인 포인트를 정리했습니다.`],
      sections: [
        { h: '시운전 체크 포인트', items: [
          ['시동과 공회전', '시동이 바로 걸리는지, 공회전 때 진동이나 이상한 소음이 없는지 확인하세요. 계기판에 경고등이 남아 있지 않은지도 봅니다.'],
          ['가속과 변속', '가속할 때 변속 충격이나 울컥거림이 없는지, 변속이 매끄러운지 확인합니다.'],
          ['브레이크', '브레이크를 밟을 때 한쪽으로 쏠리거나 떨림, 소음이 없는지 봅니다.'],
          ['핸들과 서스펜션', '직진할 때 핸들이 한쪽으로 쏠리지 않는지, 요철을 지날 때 하체에서 이상한 소리가 나지 않는지 확인합니다.'],
          ['에어컨과 히터', '냉방과 난방이 모두 제대로 작동하는지, 이상한 냄새가 나지 않는지 확인하세요.'],
          ['주차 후 확인', '시운전 후 주차한 자리 바닥에 오일이나 냉각수가 새지 않았는지 확인하면 누유 여부를 알 수 있습니다.']
        ] }
      ],
      outros: ['시운전은 가능한 한 다양한 도로(시내, 고속, 요철)에서 해 보시는 것이 좋습니다. 방문 시운전을 원하시면 미리 연락 주세요.']
    },
    {
      id: 'contract',
      label: '중고차 계약서 작성 시 주의사항',
      title: '중고차 계약서 작성할 때 반드시 확인할 사항',
      tags: ['중고차계약서', '중고차계약', '중고차거래주의', '중고차구매절차'],
      intros: [(n) => `중고차 거래에서 분쟁이 생기는 경우 대부분은 계약서에 정리되지 않은 약속에서 시작됩니다. 프롬케이카 ${n}이 계약서를 쓸 때 확인할 사항을 정리했습니다.`],
      sections: [
        { h: '계약서에서 확인할 것', items: [
          ['판매자 정보', '계약서의 판매자(업체 또는 개인) 정보가 실제 판매자와 일치하는지, 대금을 받을 계좌 명의가 같은지 확인합니다.'],
          ['차량 정보', '차량번호, 차대번호, 연식, 주행거리가 실제 차량과 등록증에 적힌 내용과 같은지 대조합니다.'],
          ['성능·상태점검기록부', '점검기록부를 받았는지, 계약서에 첨부되거나 기록되어 있는지 확인하세요.'],
          ['보증 범위', '차량 인도 후 문제가 생겼을 때 어디까지 책임지는지, 기간과 조건을 구체적으로 적어 두세요.'],
          ['특약 사항', '수리 약속, 소모품 교체, 사은품 등 말로 한 약속은 반드시 특약으로 문서에 남깁니다.'],
          ['대금과 일정', '계약금, 잔금, 인도일, 이전등록 일정을 명확히 정합니다.']
        ] }
      ],
      outros: ['계약서는 서두르지 말고 한 줄씩 읽어 본 뒤 서명하세요. 궁금한 조항이 있다면 편하게 문의해 주세요.']
    },
    {
      id: 'transfer',
      label: '중고차 이전 등록 절차와 서류',
      title: '중고차 이전 등록 절차와 준비 서류 정리',
      tags: ['중고차이전등록', '중고차명의이전', '중고차서류', '중고차구매절차'],
      intros: [(n) => `중고차 계약을 끝내면 명의 이전(이전 등록)을 해야 합니다. 처음이라면 어렵게 느껴질 수 있어 프롬케이카 ${n}이 흐름을 간단히 정리했습니다.`],
      sections: [
        { h: '이전 등록 흐름', items: [
          ['1. 계약과 대금 지급', '계약서를 쓰고 약속한 방식으로 대금을 지급합니다. 영수증이나 입금 내역을 보관하세요.'],
          ['2. 서류 준비', '일반적으로 자동차등록증, 양도 관련 서류, 신분증, 보험 가입 서류 등이 필요합니다. 필요한 서류는 상황에 따라 달라질 수 있으니 계약 전에 판매자에게 확인하세요.'],
          ['3. 보험 가입', '이전 등록과 운행을 위해 자동차보험에 먼저 가입해야 합니다.'],
          ['4. 이전 등록 신청', '정해진 기간 안에 관할 기관에서 이전 등록을 마쳐야 하며, 기간을 넘기면 과태료가 부과될 수 있습니다.']
        ] },
        { h: '업체를 통한 대행', p: '매매업체에서 구매하시는 경우 이전 등록을 대행해 주는 경우가 많습니다. 대행 여부와 비용, 소요 기간을 계약 전에 확인해 두세요.' }
      ],
      outros: ['이전 등록은 순서만 알면 어렵지 않습니다. 구매 절차가 궁금하시면 언제든 문의 주세요.']
    },
    {
      id: 'ev-used',
      label: '전기차 중고 구매 시 확인할 것',
      title: '전기차 중고 구매 전 꼭 확인해야 할 포인트',
      tags: ['전기차중고', '중고전기차', '전기차배터리', '전기차구매'],
      intros: [(n) => `전기차 중고에 관심 있는 분들이 늘고 있습니다. 내연기관차와 확인할 항목이 다르기 때문에 프롬케이카 ${n}이 핵심만 정리했습니다.`],
      sections: [
        { h: '전기차만의 체크 포인트', items: [
          ['배터리 상태', '전기차에서 가장 중요한 부분입니다. 배터리 상태(SOH)와 충전 이력, 완충 시 표시되는 주행 가능 거리를 확인하세요.'],
          ['배터리 보증', '제조사 배터리 보증이 얼마나 남았는지, 중고차로 승계되는지 확인합니다.'],
          ['충전 방식과 충전구', '급속·완속 충전 규격이 내가 이용할 충전 환경과 맞는지 확인하세요.'],
          ['주행 가능 거리', '계절과 주행 환경에 따라 달라지므로, 특히 겨울철 주행 가능 거리가 줄어드는 점을 감안해 판단하세요.'],
          ['충전 환경', '집이나 직장에서 충전할 수 있는지 먼저 확인하면 전기차의 장점을 훨씬 잘 누릴 수 있습니다.']
        ] }
      ],
      outros: ['전기차는 배터리 확인만 제대로 해도 만족도가 크게 달라집니다. 관심 있는 전기차가 있다면 편하게 문의 주세요.']
    },
    {
      id: 'fuel-choice',
      label: '디젤·가솔린·하이브리드·전기 선택법',
      title: '디젤·가솔린·하이브리드·전기차, 나에게 맞는 연료는?',
      tags: ['디젤중고차', '가솔린중고차', '하이브리드중고차', '전기차중고'],
      intros: [(n) => `중고차를 고를 때 연료를 무엇으로 할지가 의외로 큰 고민입니다. 프롬케이카 ${n}이 운행 습관에 따라 어떤 연료가 맞는지 정리했습니다.`],
      sections: [
        { h: '운행 습관별 추천', items: [
          ['장거리 운행이 많다면', '디젤이나 하이브리드가 연료비 면에서 유리한 경우가 많습니다. 고속도로 주행 비중이 높다면 디젤을 고려해 보세요.'],
          ['도심 단거리 위주라면', '가솔린이나 하이브리드, 전기차가 잘 맞습니다. 짧은 거리를 자주 타면 디젤은 관리에 신경 써야 할 부분이 늘 수 있습니다.'],
          ['충전 환경이 갖춰져 있다면', '집이나 직장에서 충전할 수 있다면 전기차가 유지비 면에서 매력적입니다.'],
          ['연료비보다 초기 비용이 중요하다면', '가솔린 차량이 구매 가격이 상대적으로 저렴한 편이라 초기 부담을 줄일 수 있습니다.']
        ] },
        { h: '선택 전에 계산해 볼 것', p: '월 주행거리와 연료 가격, 세금과 보험료를 함께 계산해 보시면 어떤 연료가 나에게 유리한지 훨씬 분명하게 보입니다.' }
      ],
      outros: ['어떤 연료가 맞는지 고민이시라면 운행 패턴을 말씀해 주세요. 상황에 맞는 차량을 추천해 드립니다.']
    },
    {
      id: 'suv-guide',
      label: '중고 SUV 고르는 법',
      title: '중고 SUV 고르는 법 — 용도별 선택 기준',
      tags: ['중고SUV', 'SUV중고차', '중고SUV추천', '패밀리카'],
      intros: [(n) => `SUV는 인기가 많은 만큼 선택지도 다양해서 무엇을 기준으로 골라야 할지 고민이 됩니다. 프롬케이카 ${n}이 용도별 기준을 정리했습니다.`],
      sections: [
        { h: 'SUV 선택 기준', items: [
          ['사용 목적', '가족 이동, 캠핑, 출퇴근 등 주된 용도에 따라 필요한 크기와 좌석 구성이 달라집니다.'],
          ['차체 크기', '넉넉한 실내가 좋지만 주차 환경과 도심 운행을 고려해 크기를 정하세요.'],
          ['구동 방식', '눈길이나 비포장도로를 자주 간다면 4륜(AWD)이 유리하고, 도심 위주라면 2륜도 충분한 경우가 많습니다.'],
          ['연료', '주행거리가 많다면 디젤이나 하이브리드, 도심 위주라면 가솔린이나 전기를 고려해 보세요.'],
          ['하체 점검', 'SUV는 험한 길을 다닌 경우가 있어 하체 긁힘이나 손상, 4륜 구동 계통의 작동 상태를 꼭 확인하세요.']
        ] }
      ],
      outros: ['SUV는 용도와 예산을 정하면 선택이 훨씬 쉬워집니다. 찾으시는 조건을 말씀해 주시면 맞는 차량을 추천해 드립니다.']
    },
    {
      id: 'first-car',
      label: '첫 차로 중고차 고르는 기준',
      title: '첫 차로 중고차를 고를 때 꼭 정해야 할 기준',
      tags: ['첫차추천', '첫차중고차', '사회초년생중고차', '중고차구매팁'],
      intros: [(n) => `첫 차는 설레는 만큼 실수하기도 쉽습니다. 프롬케이카 ${n}이 첫 차로 중고차를 고를 때 기준이 되는 내용을 정리했습니다.`],
      sections: [
        { h: '첫 차 선택 기준', items: [
          ['총 예산 정하기', '차량 가격뿐 아니라 보험료, 세금, 유류비, 정비비까지 포함한 한 달 유지비를 먼저 계산해 보세요.'],
          ['연식과 주행거리', '너무 오래된 차량은 수리비가 늘 수 있고, 지나치게 짧은 주행거리는 이력을 확인해 볼 필요가 있습니다.'],
          ['보험료', '운전 경력이 짧으면 보험료가 높을 수 있으니 차종별 보험료를 미리 확인하세요.'],
          ['인기 모델 선택', '수요가 꾸준한 모델은 나중에 되팔 때도 유리한 편입니다.'],
          ['사고 이력', '첫 차일수록 사고 이력이 없는 차량이 이후 관리 부담이 적습니다.']
        ] }
      ],
      outros: ['첫 차는 무리하지 않는 선에서 상태가 좋은 차를 고르는 것이 가장 중요합니다. 예산을 말씀해 주시면 함께 찾아드립니다.']
    },
    {
      id: 'new-like',
      label: '신차급 중고차가 인기인 이유',
      title: '신차급 중고차, 왜 인기일까? 장점과 확인할 점',
      tags: ['신차급중고차', '신차급', '준신차', '중고차장점'],
      intros: [(n) => `주행거리가 아주 짧은 신차급 중고차를 찾는 분들이 늘고 있습니다. 프롬케이카 ${n}이 신차급 중고차의 장점과 확인할 점을 정리했습니다.`],
      sections: [
        { h: '신차급 중고차의 장점', items: [
          ['신차 대비 합리적인 가격', '출고 직후 가격이 내려가는 구간을 지난 차량이라 같은 차를 신차보다 낮은 가격에 살 수 있는 경우가 많습니다.'],
          ['기다림 없는 인도', '신차는 출고 대기가 있을 수 있지만, 신차급 중고차는 바로 확인하고 인도받을 수 있습니다.'],
          ['최신 연식과 옵션', '연식이 최근이라 최신 디자인과 편의·안전 사양을 누릴 수 있습니다.']
        ] },
        { h: '구매 전에 확인할 점', items: [
          ['주행거리가 짧은 이유', '왜 짧게 탔는지(시승, 단기 사용 등) 이력을 확인해 보세요.'],
          ['제조사 보증 승계', '신차 보증이 남아 있다면 중고차 구매 시 승계가 되는지 조건을 확인하세요.'],
          ['무사고·무도색 여부', '신차급이라도 사고나 도색 이력이 없는지 기록으로 확인하는 것이 좋습니다.']
        ] }
      ],
      outros: ['신차급 중고차는 조건이 좋은 만큼 빨리 판매되는 편입니다. 관심 있는 차량이 있다면 먼저 문의해 주세요.']
    },
    {
      id: 'season-winter',
      season: [12, 1, 2],
      label: '겨울철 중고차 점검·구매 포인트',
      title: '겨울철 중고차 점검과 구매 시 체크할 포인트',
      tags: ['겨울철차량관리', '겨울철중고차', '중고차겨울', '자동차겨울점검'],
      intros: [(n) => `추운 날씨에는 차량 문제가 더 잘 드러납니다. 프롬케이카 ${n}이 겨울철 중고차를 점검하고 구매할 때 확인할 포인트를 정리했습니다.`],
      sections: [
        { h: '겨울철 체크 포인트', items: [
          ['배터리', '추위에 배터리 성능이 떨어지므로 시동이 잘 걸리는지, 배터리 상태가 괜찮은지 확인하세요.'],
          ['부동액·워셔액', '얼지 않도록 농도가 적절한지, 겨울용 워셔액을 쓰고 있는지 확인합니다.'],
          ['타이어', '타이어 마모와 공기압을 점검하고, 눈길이 잦다면 스노우 타이어도 고려하세요.'],
          ['히터와 열선', '히터, 시트 열선, 핸들 열선이 정상 작동하는지 직접 켜 보세요.'],
          ['하체 점검', '눈이 오면 제설제(염화칼슘)가 뿌려지므로 하체 부식 여부를 확인하는 것이 좋습니다.']
        ] }
      ],
      outros: ['추운 날씨에도 시동과 난방이 잘 작동하는 차량인지 직접 확인해 보시길 권합니다. 방문 전에 연락 주세요.']
    },
    {
      id: 'season-spring',
      season: [3, 4, 5],
      label: '봄철 중고차 점검 포인트',
      title: '봄철 중고차 점검 포인트 — 황사·꽃가루 시즌 체크',
      tags: ['봄철차량관리', '봄철중고차', '자동차봄점검', '중고차점검'],
      intros: [(n) => `봄이 되면 나들이가 늘어 차량 사용도 많아집니다. 프롬케이카 ${n}이 봄철에 확인하면 좋은 점검 포인트를 정리했습니다.`],
      sections: [
        { h: '봄철 체크 포인트', items: [
          ['에어컨 필터', '황사와 꽃가루가 많은 시기라 에어컨 필터 상태와 실내 냄새를 확인하세요.'],
          ['하체 세척과 부식', '겨울 동안 쌓인 제설제 때문에 하체가 부식되었는지 확인하고 세척합니다.'],
          ['타이어 공기압', '기온이 올라 공기압이 변하므로 공기압과 마모 상태를 점검합니다.'],
          ['와이퍼', '겨울을 지나 고무가 굳었다면 교체하세요. 봄비가 오기 전에 확인하면 좋습니다.'],
          ['냉방 성능', '여름 전에 에어컨 냉방이 잘 되는지 미리 확인해 두세요.']
        ] }
      ],
      outros: ['나들이 계절에 맞춰 좋은 차를 미리 준비해 두세요. 궁금한 점은 언제든 문의 주세요.']
    },
    {
      id: 'season-rainy',
      season: [6, 7, 8],
      label: '장마철 침수차 구별법',
      title: '장마철 침수차 구별하는 방법과 중고차 구매 주의점',
      tags: ['침수차구별', '침수차', '장마철중고차', '중고차침수'],
      intros: [(n) => `장마와 태풍이 지나면 침수차가 중고 시장에 섞여 나올 수 있다는 걱정이 커집니다. 프롬케이카 ${n}이 침수차를 구별하는 방법을 정리했습니다.`],
      sections: [
        { h: '침수 흔적 확인 포인트', items: [
          ['실내 냄새와 습기', '곰팡이나 퀴퀴한 냄새가 나는지, 시트 아래와 카펫이 눅눅하지 않은지 확인합니다.'],
          ['부품의 녹과 오염', '시트 레일, 안전벨트 끝부분, 페달 주변 볼트에 녹이나 흙탕물 자국이 있는지 봅니다.'],
          ['램프 내부', '헤드램프나 테일램프 안쪽에 습기나 물방울 자국이 남아 있는지 확인하세요.'],
          ['전장품 오작동', '창문, 오디오, 경고등 등 전기 장치가 가끔 오작동하지 않는지 점검합니다.'],
          ['이력 조회', '보험 이력 조회로 침수 이력이 있는지 함께 확인하세요.']
        ] }
      ],
      outros: ['침수 의심 징후가 하나라도 있으면 구매를 서두르지 말고 충분히 확인하세요. 궁금한 점은 편하게 문의 주세요.']
    },
    {
      id: 'season-autumn',
      season: [9, 10, 11],
      label: '장거리 운행 전 차량 점검 (추석·단풍철)',
      title: '명절·단풍철 장거리 운행 전 차량 점검 체크리스트',
      tags: ['장거리운행점검', '추석차량점검', '자동차점검', '가을중고차'],
      intros: [(n) => `명절과 단풍 시즌에는 장거리 운행이 늘어납니다. 프롬케이카 ${n}이 출발 전에 확인하면 좋은 점검 항목을 정리했습니다.`],
      sections: [
        { h: '출발 전 점검 항목', items: [
          ['엔진오일과 냉각수', '양과 상태를 확인하고 교체 시기가 지났다면 미리 교환하세요.'],
          ['타이어', '마모 상태와 공기압을 확인하세요. 장거리에서는 타이어 상태가 안전과 직결됩니다.'],
          ['브레이크', '브레이크 패드 마모와 제동 시 소음이나 떨림이 없는지 점검합니다.'],
          ['와이퍼와 워셔액', '갑작스러운 비에 대비해 와이퍼와 워셔액을 확인하세요.'],
          ['에어컨·히터 필터', '환절기에는 필터 상태가 실내 공기에 영향을 줍니다. 교체 시기를 확인하세요.']
        ] }
      ],
      outros: ['출발 전 점검만 해도 장거리 운행의 불안이 크게 줄어듭니다. 안전한 운행 되세요.']
    }
  ];

  /**
   * 정보성 글. cars에 판매중인 매물이 있으면 글 아래에 추천 매물 링크를 넣는다.
   * @returns {{title: string, html: string, text: string, tags: string}}
   */
  function generateTopic(topicId, opts) {
    const o = { seed: 0, cars: [], ...(opts || {}) };
    const topic = findTopic(topicId, o.cars) || TOPICS[0];
    const v = (arr, salt) => arr[(hash(topic.id) + o.seed + (salt || 0)) % arr.length];
    const blocks = [];

    // 재고를 보고 만드는 글은 매물 목록 자체가 본문이고, 그 밖의 글은 끝에 추천 매물 3대를 붙인다.
    if (topic.render) {
      blocks.push(...topic.render(o, v));
    } else {
      const intros = topic.intros.concat(GENERIC_INTROS(topic.title));
      blocks.push({ type: 'p', text: v(intros, 1)(DEALER.name) });
      topic.sections.forEach((s) => {
        blocks.push({ type: 'h', text: s.h });
        if (s.p) blocks.push({ type: 'p', text: s.p });
        if (s.items) blocks.push({ type: 'items', items: s.items.map(([b, t]) => ({ b, t })) });
      });
      blocks.push({ type: 'p', text: v((topic.outros || []).concat(GENERIC_OUTROS), 2) });

      const onSale = (o.cars || []).filter((c) => c.status !== '판매완료' && !c.deleted)
        .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)).slice(0, 3);
      if (onSale.length) {
        blocks.push({ type: 'h', text: '프롬케이카 추천 매물' });
        blocks.push({ type: 'kv', items: onSale.map((c) => [`${carLabel(c)}${priceText(c) ? ' ' + priceText(c) : ''}`, carUrl(c)]) });
      }
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

  // 글이 하나뿐인 주제도 "다른 문장으로 다시 만들기"가 달라 보이도록 공통 문장을 섞는다.
  const GENERIC_INTROS = (title) => [
    (n) => `수원 SKV1모터스에서 중고차를 소개하는 프롬케이카 ${n}입니다. 오늘은 고객님들께 자주 받는 질문을 바탕으로 "${title}"에 대해 정리해 보았습니다.`
  ];
  const GENERIC_OUTROS = [
    '이 글이 중고차를 고르시는 데 도움이 되었기를 바랍니다. 더 궁금한 점은 언제든 편하게 문의 주세요.'
  ];

  /* ---------------- 재고를 보고 만드는 주제 ---------------- */
  // 지금 판매중인 매물로 만드는 글이라 재고가 바뀌면 주제도 새로 생긴다 ("계속 제안"의 핵심).
  function priceBin(car) {
    const man = (Number(car.price) || 0) / 10000;
    if (man <= 0) return null;
    if (man < 3000) return ['under3000', '3천만원 이하', '3천만원 이하 가성비 중고차'];
    if (man < 5000) return ['3000to5000', '3천만원대', '3천만원대 중고차'];
    if (man < 8000) return ['5000to8000', '5천만원대~7천만원대', '5천만원~8천만원 중고차'];
    return ['over8000', '8천만원 이상', '8천만원 이상 프리미엄 중고차'];
  }

  function onSaleOf(cars) {
    return (cars || []).filter((c) => c.status !== '판매완료' && !c.deleted);
  }

  // 차량 목록으로 만드는 글의 공통 본문: 소개 → 한눈에 비교 → 차량별 장점 → 마무리
  function inventoryBlocks(list, o, v, { heading, intros, tip }) {
    const blocks = [];
    const shown = list.slice(0, 6);
    blocks.push({ type: 'p', text: v(intros, 1)(shown.length, list.length) });

    const priced = shown.filter((c) => Number(c.price) > 0);
    const cheapest = priced.slice().sort((a, b) => a.price - b.price)[0];
    const newest = shown.map((c) => ({ c, y: parseYears(c.year_info).model || 0 })).filter((x) => x.y).sort((a, b) => b.y - a.y)[0];
    const lowKm = shown.filter((c) => Number(c.mileage) >= 0 && c.mileage !== null && c.mileage !== undefined).sort((a, b) => a.mileage - b.mileage)[0];
    const cmp = [];
    if (shown.length >= 2 && cheapest) cmp.push(['가장 합리적인 가격', `${koName(cheapest)} (${priceText(cheapest)})`]);
    if (shown.length >= 2 && newest) cmp.push(['가장 최신 연식', `${koName(newest.c)} (${newest.y}년형)`]);
    if (shown.length >= 2 && lowKm) cmp.push(['가장 낮은 주행거리', `${koName(lowKm)} (${kmText(lowKm.mileage)})`]);
    if (cmp.length) {
      blocks.push({ type: 'h', text: '한눈에 비교' });
      blocks.push({ type: 'kv', items: cmp });
    }

    blocks.push({ type: 'h', text: heading });
    shown.forEach((c, i) => {
      const info = [parseYears(c.year_info).model ? parseYears(c.year_info).model + '년형' : '', c.mileage || c.mileage === 0 ? kmText(c.mileage) : '', c.fuel_type || '', priceText(c)].filter(Boolean).join(' · ');
      blocks.push({ type: 'p', text: `${i + 1}. ${carLabel(c)}` });
      blocks.push({ type: 'p', text: info });
      const adv = buildAdvantages(c).slice(0, 3);
      if (adv.length) blocks.push({ type: 'items', items: adv });
      blocks.push({ type: 'kv', items: [['상세·사진 보기', carUrl(c)]] });
    });
    if (list.length > shown.length) {
      blocks.push({ type: 'p', text: `그 밖에도 ${list.length - shown.length}대가 더 있습니다. 전체 매물은 아래 링크에서 확인해 주세요.` });
    }
    blocks.push({ type: 'h', text: '고르실 때 참고하세요' });
    blocks.push({ type: 'p', text: tip });
    return blocks;
  }

  const TIP_GENERIC = '같은 조건의 차량이라도 사고 이력과 도색 여부, 옵션에 따라 가격 차이가 큽니다. 가격만 보지 마시고 차량 상태와 이력을 함께 비교해 보세요. 실제 차량은 방문하셔서 직접 확인하실 수 있으니 방문 전에 연락 주세요.';

  function dynamicTopics(cars) {
    const list = onSaleOf(cars);
    const topics = [];
    const add = (t) => topics.push({ kind: 'data', ...t });

    // 브랜드별
    const byBrand = {};
    list.forEach((c) => { const b = brandKo(c); if (b) (byBrand[b] = byBrand[b] || []).push(c); });
    Object.keys(byBrand).forEach((b) => {
      const group = byBrand[b];
      add({
        id: `data:brand:${b}`,
        label: `현재 판매중인 ${b} 중고차 ${group.length}대 모아보기`,
        title: `수원 ${b} 중고차 추천 — 현재 판매중인 ${group.length}대 한눈에 보기`,
        tags: [`${b.replace(/\s+/g, '')}중고차`, `${b.replace(/\s+/g, '')}중고차추천`, '중고차추천', '중고차매물'],
        render: (o, v) => inventoryBlocks(group, o, v, {
          heading: `${b} 판매중 차량`,
          intros: [
            (shown, total) => `수원 SKV1모터스에서는 현재 ${b} 중고차 ${total}대를 판매하고 있습니다. ${b} 중고차를 알아보시는 분들을 위해 차량별 가격과 장점을 한눈에 정리했습니다.`,
            (shown, total) => `${b} 중고차를 찾고 계신가요? 프롬케이카 ${DEALER.name}입니다. 지금 보유 중인 ${b} ${total}대의 가격과 특징을 정리해 드립니다.`
          ],
          tip: TIP_GENERIC
        })
      });
    });

    // 가격대별 (2대 이상일 때)
    const byBin = {};
    list.forEach((c) => { const b = priceBin(c); if (b) (byBin[b[0]] = byBin[b[0]] || { meta: b, cars: [] }).cars.push(c); });
    Object.values(byBin).filter((g) => g.cars.length >= 2).forEach((g) => {
      add({
        id: `data:price:${g.meta[0]}`,
        label: `${g.meta[1]} 중고차 ${g.cars.length}대 모아보기`,
        title: `${g.meta[2]} — 수원에서 만나는 ${g.cars.length}대`,
        tags: [g.meta[1].replace(/\s+/g, '') + '중고차', '중고차추천', '가성비중고차'],
        render: (o, v) => inventoryBlocks(g.cars, o, v, {
          heading: `${g.meta[1]} 판매중 차량`,
          intros: [
            (shown, total) => `예산 ${g.meta[1]}으로 중고차를 찾고 계신 분들을 위해 현재 판매중인 ${total}대를 모아 정리했습니다.`,
            (shown, total) => `${g.meta[1]} 예산에서 선택할 수 있는 프롬케이카 판매 차량 ${total}대를 소개합니다.`
          ],
          tip: TIP_GENERIC
        })
      });
    });

    // 연료별 (전기·하이브리드·디젤)
    [['전기', /전기|EV/i, '전기차'], ['하이브리드', /하이브리드|HEV/i, '하이브리드'], ['디젤', /디젤/, '디젤']].forEach(([key, re, name]) => {
      const group = list.filter((c) => re.test(c.fuel_type || ''));
      if (group.length < 1) return;
      add({
        id: `data:fuel:${key}`,
        label: `${name} 중고차 ${group.length}대 모아보기`,
        title: `${name} 중고차 추천 — 수원에서 판매중인 ${group.length}대`,
        tags: [`${name}중고차`, `${name}중고`, '중고차추천'],
        render: (o, v) => inventoryBlocks(group, o, v, {
          heading: `${name} 판매중 차량`,
          intros: [
            (shown, total) => `${name} 중고차를 찾는 분들이 늘고 있습니다. 프롬케이카에서 지금 판매중인 ${name} 차량 ${total}대를 정리했습니다.`
          ],
          tip: key === '전기' ? '전기차는 배터리 상태와 충전 환경이 가장 중요합니다. 배터리 상태와 보증이 남아 있는지 문의하실 때 함께 확인해 보세요.' : TIP_GENERIC
        })
      });
    });

    // 무사고·무도색 / 신차급
    const clean = list.filter((c) => effectiveNoAccident(c) && c.badge_no_paint);
    if (clean.length >= 2) {
      add({
        id: 'data:clean',
        label: `무사고·무도색 중고차 ${clean.length}대 모아보기`,
        title: `무사고·무도색 중고차 모아보기 — 수원 ${clean.length}대`,
        tags: ['무사고중고차', '무도색', '무사고무도색', '중고차추천'],
        render: (o, v) => inventoryBlocks(clean, o, v, {
          heading: '무사고·무도색 차량',
          intros: [(shown, total) => `사고도 도색도 없는 차량만 찾으시는 분들을 위해, 프롬케이카가 현재 판매중인 무사고·무도색 차량 ${total}대를 모았습니다.`],
          tip: TIP_GENERIC
        })
      });
    }
    const fresh = list.filter((c) => c.is_new_car);
    if (fresh.length >= 1) {
      add({
        id: 'data:newcar',
        label: `완전신차급 중고차 ${fresh.length}대 모아보기`,
        title: `완전신차 중고차 추천 — 수원 판매중 ${fresh.length}대`,
        tags: ['신차급중고차', '완전신차', '신차급', '중고차추천'],
        render: (o, v) => inventoryBlocks(fresh, o, v, {
          heading: '완전신차 차량',
          intros: [(shown, total) => `신차 같은 차를 합리적인 가격에 찾는 분들께 소개합니다. 현재 판매중인 완전신차 ${total}대입니다.`],
          tip: '신차급 차량은 조건이 좋은 만큼 빨리 판매되는 편입니다. 관심 있는 차량이 있다면 먼저 문의해 주세요.'
        })
      });
    }

    // 최근 2주 안에 등록된 신규 입고
    const recent = list.filter((c) => (Date.now() - (c.created_at || 0)) < 14 * 86400000);
    if (recent.length >= 1) {
      add({
        id: 'data:recent',
        label: `이번 주 신규 입고 차량 ${recent.length}대`,
        title: `신규 입고 소식 — 이번에 들어온 중고차 ${recent.length}대`,
        tags: ['신규입고', '중고차신규', '중고차매물', '중고차추천'],
        recent: true,
        render: (o, v) => inventoryBlocks(recent, o, v, {
          heading: '신규 입고 차량',
          intros: [(shown, total) => `프롬케이카에 새로 입고된 차량 ${total}대를 소개합니다. 따끈따끈한 신규 매물을 가장 먼저 확인해 보세요.`],
          tip: TIP_GENERIC
        })
      });
    }
    return topics;
  }

  /* ---------------- "새 주제 제안받기"용 아이디어 풀 ---------------- */
  // 기본 추천 목록(listTopics)에는 나오지 않고, 관리자가 "새 주제 제안받기"를 누를 때마다 몇 개씩 꺼내 보여준다.
  // 재고가 늘면 차량별 가이드·비교 글이 함께 늘어나서 제안할 거리가 계속 생긴다.
  const EXTRA_TOPICS = [
    {
      id: 'insurance-save',
      label: '중고차 자동차보험료 아끼는 방법',
      title: '중고차 자동차보험료 아끼는 방법 — 가입 전 꼭 비교하세요',
      tags: ['자동차보험료', '자동차보험비교', '중고차보험', '다이렉트보험'],
      intros: [(n) => `중고차를 사고 나면 바로 챙겨야 하는 것이 자동차보험입니다. 같은 차도 가입 방법에 따라 보험료가 달라지기 때문에 프롬케이카 ${n}이 아끼는 방법을 정리했습니다.`],
      sections: [{ h: '보험료를 줄이는 방법', items: [
        ['여러 곳에서 견적 비교', '보험사마다 같은 조건에도 보험료가 다를 수 있으니 2~3곳 이상에서 견적을 받아 비교해 보세요.'],
        ['다이렉트(온라인) 가입', '설계사 없이 온라인으로 가입하는 상품이 상대적으로 저렴한 경우가 많습니다.'],
        ['운전자 범위 조정', '운전하는 사람의 범위를 필요한 만큼만 지정하면 보험료가 줄어드는 경우가 많습니다.'],
        ['특약 점검', '주행거리 특약, 블랙박스 할인 등 해당되는 특약이 있는지 확인하세요.'],
        ['보장 내용은 줄이지 말기', '보험료만 보고 대인·대물 보장을 지나치게 낮추면 사고 때 부담이 커질 수 있습니다.']
      ] }],
      outros: ['차량 계약과 함께 보험도 미리 알아보시면 인도일에 바로 운행하실 수 있습니다. 궁금한 점은 편하게 문의 주세요.']
    },
    {
      id: 'payment-method',
      label: '중고차 현금·할부·리스, 무엇이 유리할까',
      title: '중고차 구매 방법 비교 — 현금·할부·리스 어떤 게 유리할까',
      tags: ['중고차할부', '중고차리스', '중고차현금구매', '중고차구매방법'],
      intros: [(n) => `중고차를 사는 방법은 현금 구매, 할부, 리스 등 여러 가지입니다. 프롬케이카 ${n}이 각 방식의 특징을 비교해 드립니다.`],
      sections: [{ h: '구매 방법별 특징', items: [
        ['현금 구매', '이자 부담이 없고 절차가 단순합니다. 대신 목돈이 한 번에 들어갑니다.'],
        ['할부', '매달 나눠 내므로 초기 부담이 적지만 이자가 붙습니다. 금리와 기간을 꼼꼼히 비교하세요.'],
        ['리스', '월 납입금이 상대적으로 낮을 수 있지만 계약 기간과 종료 조건, 중도 해지 조건을 반드시 확인해야 합니다.']
      ] }, { h: '선택 전에 확인할 것', p: '월 납입금뿐 아니라 총 지출 금액(이자·수수료 포함)을 비교해 보세요. 보유 자금과 월 소득을 기준으로 무리 없는 방식을 고르는 것이 가장 중요합니다.' }],
      outros: ['구매 방식은 개인 상황에 따라 정답이 다릅니다. 궁금한 점은 편하게 문의해 주세요.']
    },
    {
      id: 'first-month',
      label: '중고차 구매 후 첫 한 달 해야 할 일',
      title: '중고차 구매 후 첫 한 달, 꼭 해야 할 일 체크리스트',
      tags: ['중고차구매후', '중고차관리', '중고차점검', '자동차관리'],
      intros: [(n) => `중고차를 인도받은 뒤 처음 한 달은 차량 상태를 파악하고 관리 기준을 잡는 중요한 시기입니다. 프롬케이카 ${n}이 구매 후 할 일을 정리했습니다.`],
      sections: [{ h: '구매 후 체크리스트', items: [
        ['보험과 이전 등록 확인', '보험이 정상 가입되었는지, 이전 등록이 끝났는지 확인하세요.'],
        ['소모품 점검', '엔진오일, 브레이크액, 필터류, 타이어 상태를 점검하고 필요하면 교체합니다.'],
        ['정비 이력 정리', '이전 정비 이력을 확인하고 앞으로의 점검 일정을 정해 둡니다.'],
        ['블랙박스·편의 용품', '블랙박스를 설치하고 필요한 용품을 준비하세요.'],
        ['이상 증상 기록', '초기에 느낀 소음이나 이상 증상은 메모해 두었다가 판매자에게 빨리 알리세요. 보증 조건이 있다면 기간 안에 알리는 것이 중요합니다.']
      ] }],
      outros: ['첫 한 달만 잘 관리해도 오래 안심하고 탈 수 있습니다. 구매 후 궁금한 점도 편하게 문의 주세요.']
    },
    {
      id: 'dealer-vs-private',
      label: '중고차 업체 구매 vs 개인 거래',
      title: '중고차 업체 구매 vs 개인 거래, 장단점 비교',
      tags: ['중고차업체', '중고차개인거래', '중고차딜러', '중고차거래비교'],
      intros: [(n) => `중고차를 업체에서 살지, 개인에게서 살지 고민하시는 분들이 많습니다. 프롬케이카 ${n}이 두 방식을 비교해 드립니다.`],
      sections: [{ h: '장단점 비교', items: [
        ['업체 구매의 장점', '성능·상태점검기록부 제공, 이전 등록 대행, 보증 등 절차를 갖춘 경우가 많아 초보자에게 비교적 안전합니다.'],
        ['업체 구매의 단점', '업체 마진이 포함되어 개인 거래보다 가격이 높을 수 있습니다.'],
        ['개인 거래의 장점', '중간 비용이 없어 가격이 저렴할 수 있고, 이전 소유자에게 차량 이력을 직접 들을 수 있습니다.'],
        ['개인 거래의 단점', '사후 책임이 불분명하고 서류 확인과 이전 절차를 직접 챙겨야 합니다.']
      ] }, { h: '선택 기준', p: '가격을 가장 중요하게 보고 확인할 자신이 있다면 개인 거래, 안전과 편의를 우선한다면 업체 구매가 일반적으로 더 잘 맞습니다.' }],
      outros: ['어느 쪽이든 서류와 차량 상태를 꼼꼼히 확인하는 것이 가장 중요합니다. 궁금한 점은 언제든 문의 주세요.']
    },
    {
      id: 'import-maintenance',
      label: '수입 중고차 유지비, 현실적으로 얼마나 들까',
      title: '수입 중고차 유지비, 현실적으로 따져 보기',
      tags: ['수입차유지비', '수입중고차', '수입차정비', '중고차유지비'],
      intros: [(n) => `수입 중고차는 구매 가격이 매력적이지만 유지비가 걱정되는 분이 많습니다. 프롬케이카 ${n}이 유지비를 현실적으로 따져 보는 방법을 정리했습니다.`],
      sections: [{ h: '유지비 항목별 점검', items: [
        ['소모품 교체비', '엔진오일, 브레이크 패드, 타이어 같은 소모품은 차종과 등급에 따라 비용 차이가 큽니다. 구매 전에 대략적인 교체 비용을 알아 두세요.'],
        ['정비 접근성', '정비를 맡길 수 있는 공식·전문 정비소가 가까운지, 부품 수급이 쉬운 모델인지 확인하세요.'],
        ['보증 여부', '남은 보증 기간이 있거나 중고차 보증 상품이 있다면 예상치 못한 수리비 부담을 줄일 수 있습니다.'],
        ['보험료와 세금', '배기량과 차량 가격에 따라 달라지므로 구매 전에 연간 비용을 계산해 보세요.'],
        ['예비 비용', '예상치 못한 수리에 대비해 연식에 따라 일정 금액을 따로 마련해 두는 것을 권합니다.']
      ] }],
      outros: ['유지비까지 계산해 보면 같은 가격의 차도 훨씬 현명하게 고르실 수 있습니다. 궁금한 차량이 있다면 문의 주세요.']
    }
  ];

  const carKey = (c) => (c.listing_no ? `n${c.listing_no}` : String(c.id).slice(0, 8));

  function carDisplayName(c) {
    const yrs = parseYears(c.year_info);
    return `${yrs.model ? yrs.model + '년형 ' : ''}${koName(c)}`.trim();
  }

  function whoFits(c) {
    const out = [];
    const fuel = String(c.fuel_type || '');
    if (c.is_new_car) out.push('신차 같은 차를 합리적인 가격에 찾는 분');
    if (effectiveNoAccident(c)) out.push('사고 이력 없는 차량을 우선하는 분');
    if (/전기|EV/i.test(fuel)) out.push('집이나 직장에서 충전할 수 있어 유지비를 아끼고 싶은 분');
    else if (/하이브리드/.test(fuel)) out.push('연비를 중요하게 보는 분');
    else if (/디젤/.test(fuel)) out.push('장거리 운행이 많은 분');
    if (Number(c.mileage) > 0 && Number(c.mileage) <= 30000 && !c.is_new_car) out.push('주행거리가 짧은 차를 찾는 분');
    if (!out.length) out.push('상태 좋은 차를 합리적인 가격에 찾는 분');
    return out.slice(0, 3);
  }

  function checkpointsFor(c) {
    const fuel = String(c.fuel_type || '');
    const items = [];
    if (/전기|EV/i.test(fuel)) items.push(['배터리 상태', '배터리 상태와 남은 보증, 실제 주행 가능 거리를 확인하세요.'], ['충전 환경', '충전 규격이 내가 이용할 충전 환경과 맞는지 확인하세요.']);
    else if (/디젤/.test(fuel)) items.push(['배출가스 관련 장치', '배출가스 저감 장치와 관련된 관리 이력을 확인하세요.'], ['엔진 소음', '시동 직후와 가속할 때 엔진 소음과 진동을 확인하세요.']);
    else if (/하이브리드/.test(fuel)) items.push(['하이브리드 배터리', '구동용 배터리 관련 점검 이력과 보증 조건을 확인하세요.']);
    else items.push(['엔진·변속기', '시동 소음, 가속, 변속 충격이 매끄러운지 시운전으로 확인하세요.']);
    items.push(['성능·상태점검기록부', '기록부의 사고·교환·수리 이력을 확인하고 실제 차량 상태와 대조하세요.'], ['보험 이력 조회', '보험 사고 이력을 별도로 조회해 판매자 설명과 같은지 비교하세요.']);
    return items;
  }

  function extraTopics(cars) {
    const list = onSaleOf(cars);
    const topics = EXTRA_TOPICS.map((t) => ({ kind: 'new', ...t }));
    const add = (t) => topics.push({ kind: 'new', ...t });

    // 차량 한 대를 깊이 소개하는 가이드
    list.forEach((c) => {
      add({
        id: `data:model:${carKey(c)}`,
        label: `${koName(c)} 구매 가이드 (장점과 확인할 점)`,
        title: `${carDisplayName(c)} 중고차 구매 가이드 — 장점과 확인할 점`,
        tags: [`${brandKo(c)}중고차`, modelKeyword(c) ? `${modelKeyword(c)}중고차` : '중고차추천', '중고차구매가이드'].filter(Boolean),
        carKey: carKey(c),
        render: (o, v) => {
          const blocks = [];
          const adv = buildAdvantages(c);
          blocks.push({ type: 'p', text: v([
            `프롬케이카에서 판매중인 ${carDisplayName(c)}에 관심을 가진 분들이 많아, 이 차량의 장점과 구매 전 확인할 점을 따로 정리했습니다.`,
            `${carDisplayName(c)}, 어떤 차일까요? 프롬케이카 ${DEALER.name}이 이 차량의 특징과 구매 전 체크 포인트를 자세히 설명드립니다.`
          ], 1) });
          if (adv.length) {
            blocks.push({ type: 'h', text: '이 차량의 장점' });
            blocks.push({ type: 'items', items: adv });
          }
          blocks.push({ type: 'h', text: '이런 분께 추천합니다' });
          blocks.push({ type: 'items', items: whoFits(c).map((t, i) => ({ b: `추천 ${i + 1}`, t })) });
          blocks.push({ type: 'h', text: '구매 전 확인할 점' });
          blocks.push({ type: 'items', items: checkpointsFor(c).map(([b, t]) => ({ b, t })) });
          blocks.push({ type: 'h', text: '차량 기본 정보' });
          blocks.push({ type: 'kv', items: [
            ['차량명', c.title],
            c.year_info ? ['연식', c.year_info] : null,
            c.mileage || c.mileage === 0 ? ['주행거리', kmText(c.mileage)] : null,
            c.fuel_type ? ['연료', c.fuel_type] : null,
            ['판매 가격', priceText(c) || '문의'],
            ['상세·사진 보기', carUrl(c)]
          ].filter(Boolean) });
          return blocks;
        }
      });
    });

    // 비슷한 가격대의 두 차량 비교 (가격 차이 30% 이내, 서로 다른 차량)
    const compared = new Set();
    list.forEach((a) => {
      list.forEach((b) => {
        if (a.id >= b.id || !(Number(a.price) > 0) || !(Number(b.price) > 0)) return;
        if (Math.abs(a.price - b.price) / Math.max(a.price, b.price) > 0.3) return;
        const key = `${carKey(a)}-${carKey(b)}`;
        if (compared.has(key)) return;
        compared.add(key);
        add({
          id: `data:cmp:${key}`,
          label: `${koName(a)} vs ${koName(b)} 비교`,
          title: `${koName(a)} vs ${koName(b)}, 어떤 차가 나에게 맞을까?`,
          tags: ['중고차비교', `${brandKo(a)}중고차`, `${brandKo(b)}중고차`].filter(Boolean),
          render: (o, v) => {
            const blocks = [];
            const row = (label, fa, fb) => [label, `${koName(a)}: ${fa} / ${koName(b)}: ${fb}`];
            blocks.push({ type: 'p', text: v([
              `비슷한 가격대에서 ${carDisplayName(a)}와(과) ${carDisplayName(b)} 중 무엇을 고를지 고민하시는 분들을 위해 두 차량을 비교해 보았습니다.`,
              `예산은 비슷한데 어떤 차가 더 나을까요? 프롬케이카에서 판매중인 두 차량을 항목별로 비교해 드립니다.`
            ], 1) });
            blocks.push({ type: 'h', text: '한눈에 비교' });
            blocks.push({ type: 'kv', items: [
              row('가격', priceText(a) || '문의', priceText(b) || '문의'),
              row('연식', a.year_info || '-', b.year_info || '-'),
              row('주행거리', a.mileage || a.mileage === 0 ? kmText(a.mileage) : '-', b.mileage || b.mileage === 0 ? kmText(b.mileage) : '-'),
              row('연료', a.fuel_type || '-', b.fuel_type || '-')
            ] });
            [a, b].forEach((c) => {
              blocks.push({ type: 'h', text: carLabel(c) });
              const adv = buildAdvantages(c).slice(0, 4);
              if (adv.length) blocks.push({ type: 'items', items: adv });
              blocks.push({ type: 'kv', items: [['상세·사진 보기', carUrl(c)]] });
            });
            const picks = [];
            const cheaper = a.price < b.price ? a : b;
            picks.push({ b: '가격을 아끼고 싶다면', t: `${koName(cheaper)} (${priceText(cheaper)})가 더 합리적입니다.` });
            const ya = parseYears(a.year_info).model || 0;
            const yb = parseYears(b.year_info).model || 0;
            if (ya !== yb) picks.push({ b: '더 최신 연식을 원한다면', t: `${koName(ya > yb ? a : b)} (${Math.max(ya, yb)}년형)를 보세요.` });
            const ka = Number(a.mileage);
            const kb = Number(b.mileage);
            if (Number.isFinite(ka) && Number.isFinite(kb) && ka !== kb) picks.push({ b: '주행거리가 짧은 차를 원한다면', t: `${koName(ka < kb ? a : b)} (${kmText(Math.min(ka, kb))})가 유리합니다.` });
            blocks.push({ type: 'h', text: '이런 분께는 이 차량' });
            blocks.push({ type: 'items', items: picks });
            blocks.push({ type: 'p', text: '두 차량 모두 실제 상태는 방문하셔서 직접 확인하실 수 있습니다. 방문 전에 연락 주세요.' });
            return blocks;
          }
        });
      });
    });

    // TOP 목록
    const priced = list.filter((c) => Number(c.price) > 0);
    if (priced.length >= 3) {
      const top = priced.slice().sort((x, y) => x.price - y.price).slice(0, 3);
      add({
        id: 'data:top-price',
        label: '가성비 좋은 중고차 TOP 3',
        title: '수원 가성비 중고차 TOP 3 — 합리적인 가격의 차량만 모았습니다',
        tags: ['가성비중고차', '중고차추천', '중고차TOP3', '저렴한중고차'],
        render: (o, v) => inventoryBlocks(top, o, v, {
          heading: '가격이 합리적인 차량 TOP 3',
          intros: [(shown, total) => `지금 프롬케이카에서 판매중인 차량 중 가격이 가장 합리적인 ${total}대를 골랐습니다.`],
          tip: '가격이 낮은 차량일수록 상태와 이력을 더 꼼꼼히 확인하는 것이 좋습니다. 사고 이력과 점검기록부를 함께 확인해 보세요.'
        })
      });
    }
    const lowKm = list.filter((c) => Number(c.mileage) >= 0 && c.mileage !== null && c.mileage !== undefined && !c.is_new_car);
    if (lowKm.length >= 3) {
      const top = lowKm.slice().sort((x, y) => x.mileage - y.mileage).slice(0, 3);
      add({
        id: 'data:top-km',
        label: '주행거리 짧은 중고차 TOP 3',
        title: '주행거리 짧은 중고차 TOP 3 — 거의 새 차 같은 상태',
        tags: ['저주행중고차', '주행거리짧은차', '중고차추천', '중고차TOP3'],
        render: (o, v) => inventoryBlocks(top, o, v, {
          heading: '주행거리가 짧은 차량 TOP 3',
          intros: [(shown, total) => `주행거리가 짧은 차량만 찾으시는 분들을 위해 지금 판매중인 차량 중 가장 짧게 탄 ${total}대를 소개합니다.`],
          tip: TIP_GENERIC
        })
      });
    }

    // 연식별 모아보기 (2대 이상)
    const byYear = {};
    list.forEach((c) => { const y = parseYears(c.year_info).model; if (y) (byYear[y] = byYear[y] || []).push(c); });
    Object.keys(byYear).filter((y) => byYear[y].length >= 2).forEach((y) => {
      add({
        id: `data:year:${y}`,
        label: `${y}년형 중고차 ${byYear[y].length}대 모아보기`,
        title: `${y}년형 중고차 모아보기 — 수원 ${byYear[y].length}대`,
        tags: [`${y}년식`, `${y}년형중고차`, '중고차추천'],
        render: (o, v) => inventoryBlocks(byYear[y], o, v, {
          heading: `${y}년형 판매중 차량`,
          intros: [(shown, total) => `${y}년형 중고차를 찾는 분들을 위해 프롬케이카에서 판매중인 ${total}대를 정리했습니다.`],
          tip: TIP_GENERIC
        })
      });
    });
    return topics;
  }

  function findTopic(id, cars) {
    return TOPICS.find((t) => t.id === id)
      || dynamicTopics(cars).find((t) => t.id === id)
      || extraTopics(cars).find((t) => t.id === id);
  }

  /**
   * "새 주제 제안받기": 아직 제안하지 않았고 최근에 쓰지도 않은 주제를 무작위로 count개 꺼낸다.
   * @param {Array} cars 매물 목록
   * @param {Object} opts { seen: 이미 제안한 id 배열, done: 작성 기록, count: 개수 }
   * @returns {{topics: Array, cycled: boolean}} cycled가 true면 한 바퀴를 다 돌아 처음부터 다시 제안한 것
   */
  function suggestNew(cars, opts) {
    const o = { seen: [], done: {}, count: 3, ...(opts || {}) };
    const pool = extraTopics(cars);
    const recentlyDone = (id) => o.done[id] && (Date.now() - o.done[id]) < 45 * 86400000;
    const pick = (excluded) => pool.filter((t) => !excluded.has(t.id) && !recentlyDone(t.id));
    let cycled = false;
    let candidates = pick(new Set(o.seen));
    if (candidates.length === 0) {
      cycled = true;
      candidates = pick(new Set());
    }
    // 재고 기반 제안을 먼저, 그 안에서는 무작위. 일반 주제가 한 번에 모두 섞여 나오지 않게 한다.
    const shuffle = (arr) => arr.map((t) => ({ t, r: Math.random() })).sort((a, b) => a.r - b.r).map((x) => x.t);
    const data = shuffle(candidates.filter((t) => t.id.startsWith('data:')));
    const general = shuffle(candidates.filter((t) => !t.id.startsWith('data:')));
    const ordered = [];
    for (let i = 0; i < Math.max(data.length, general.length); i++) {
      if (data[i]) ordered.push(data[i]);
      if (general[i]) ordered.push(general[i]);
    }
    const topics = ordered.slice(0, o.count).map((t) => ({ id: t.id, label: t.label, kind: 'new' }));
    return { topics, cycled: cycled && topics.length > 0 };
  }

  /**
   * 지금 쓰면 좋은 주제를 우선순위 순으로 돌려준다.
   * 이번 달 계절 글 > 재고(신규 입고·모아보기) 글 > 아직 안 쓴 일반 글 > 최근에 쓴 글(뒤로).
   * @param {Array} cars 매물 목록
   * @param {Object} doneMap { 주제id: 작성 시각(ms) }
   */
  function listTopics(cars, doneMap, now) {
    const t0 = now || Date.now();
    const month = new Date(t0).getMonth() + 1;
    const done = doneMap || {};
    const all = [];
    TOPICS.forEach((t) => {
      if (t.season && !t.season.includes(month)) return; // 계절 글은 그 철에만 보여준다
      all.push({ id: t.id, label: t.label, kind: t.season ? 'season' : 'evergreen', score: t.season ? 40 : 10 });
    });
    dynamicTopics(cars).forEach((t) => {
      all.push({ id: t.id, label: t.label, kind: t.recent ? 'recent' : 'data', score: t.recent ? 50 : 20 });
    });
    return all.map((t) => {
      const at = done[t.id] || 0;
      const days = at ? Math.floor((t0 - at) / 86400000) : null;
      let score = t.score;
      if (at) score = days < 45 ? -100 + days : score - 8; // 최근에 쓴 글은 뒤로, 오래됐으면 다시 제안
      return { ...t, doneAt: at || null, daysAgo: days, score };
    }).sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, 'ko'));
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
        `🚗 ${sold}${koName(car)} 중고차`,
        koName(car) !== car.title ? `(${car.title})` : '',
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
        `[${mark}] ${parseYears(car.year_info).model ? parseYears(car.year_info).model + '년형 ' : ''}${koName(car)} 중고차`,
        koName(car) !== car.title ? `차량명: ${car.title}` : '',
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
      `[프롬케이카] ${sold}${carLabel(car)}`,
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
    // 큰 글씨는 검색에서 쓰는 한글 차명, 그 아래에 원래(영문) 차명을 작게 덧붙인다
    const ko = koName(car);
    const titleLines = wrapLines(ctx, ko || car.title || '', W - 80, 2);
    titleLines.forEach((line, i) => ctx.fillText(line, 40, 760 + i * 66));
    const sub = ko && ko !== car.title ? car.title : '';
    if (sub) {
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.font = `600 28px ${FONT}`;
      ctx.fillText(wrapLines(ctx, sub, W - 80, 1)[0], 40, 760 + (titleLines.length - 1) * 66 + 44);
      ctx.fillStyle = '#ffffff';
    }

    // 가격
    const priceY = 760 + (titleLines.length - 1) * 66 + (sub ? 150 : 130);
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

  /* ---------------- 내가 입력한 주제로 만드는 글 ---------------- */
  // 판매중 매물 링크(최대 3대)와 연락처 블록은 AI가 쓰지 않고 코드가 붙인다 (연락처가 틀리지 않게).
  function tailBlocks(cars) {
    const blocks = [];
    const onSale = onSaleOf(cars).sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)).slice(0, 3);
    if (onSale.length) {
      blocks.push({ type: 'h', text: '프롬케이카 추천 매물' });
      blocks.push({ type: 'kv', items: onSale.map((c) => [`${carLabel(c)}${priceText(c) ? ' ' + priceText(c) : ''}`, carUrl(c)]) });
    }
    blocks.push(...contactBlocks(null));
    return blocks;
  }

  function cleanTags(list, extra) {
    const tags = (list || []).map((t) => String(t).replace(/[#\s]/g, '')).filter(Boolean);
    return [...new Set([...tags, ...extra])].slice(0, 10).map((t) => `#${t}`).join(' ');
  }

  /** Claude가 돌려준 글(JSON)을 화면용 글로 바꾼다. */
  function articleFromData(data, opts) {
    const o = { cars: [], ...(opts || {}) };
    const blocks = [];
    (data.intro || []).forEach((t) => { if (t) blocks.push({ type: 'p', text: String(t) }); });
    (data.sections || []).forEach((s) => {
      if (s.heading) blocks.push({ type: 'h', text: String(s.heading) });
      (s.paragraphs || []).forEach((t) => { if (t) blocks.push({ type: 'p', text: String(t) }); });
      if (s.points && s.points.length) blocks.push({ type: 'items', items: s.points.map((p) => ({ b: String(p.label || ''), t: String(p.text || '') })) });
    });
    if ((data.faq || []).length) {
      blocks.push({ type: 'h', text: `${o.topic || '자주 묻는 질문'} 자주 묻는 질문` });
      blocks.push({ type: 'faq', items: data.faq.map((f) => ({ q: String(f.q || ''), a: String(f.a || '') })) });
    }
    if (data.closing) blocks.push({ type: 'p', text: String(data.closing) });
    blocks.push(...tailBlocks(o.cars));
    return {
      title: String(data.title || o.topic || '').trim(),
      html: renderHtml(blocks),
      text: renderText(blocks),
      tags: cleanTags(data.tags, ['수원중고차', '프롬케이카'])
    };
  }

  /**
   * AI(API 키)를 쓸 수 없을 때의 초안 뼈대: 검색에 유리한 제목·첫 문단·소제목·질문 구성은 갖추고,
   * 실제 내용은 사장님이 채울 자리를 【직접 작성】으로 표시한다 (주제를 모르는 채로 아는 척 쓴 내용을 만들지 않기 위해).
   */
  function skeletonFromTopic(topic, opts) {
    const o = { cars: [], notes: '', ...(opts || {}) };
    const t = String(topic).trim();
    const blocks = [];
    blocks.push({ type: 'p', text: `수원에서 중고차를 판매하는 프롬케이카 ${DEALER.name}입니다. 오늘은 "${t}"에 대해 이야기해 보겠습니다.` });
    blocks.push({ type: 'p', text: `【직접 작성】 이 주제를 다루는 이유나, 고객님께 자주 받는 질문을 한두 문장으로 적어 주세요.${o.notes ? ` (요청하신 내용: ${o.notes})` : ''}` });
    blocks.push({ type: 'h', text: `${t}, 먼저 알아둘 점` });
    blocks.push({ type: 'p', text: '【직접 작성】 이 주제에서 가장 중요한 핵심을 두세 문장으로 설명해 주세요.' });
    blocks.push({ type: 'h', text: `${t} 확인 포인트` });
    blocks.push({ type: 'items', items: [
      { b: '포인트 1', t: '【직접 작성】 첫 번째로 확인할 내용을 적어 주세요.' },
      { b: '포인트 2', t: '【직접 작성】 두 번째로 확인할 내용을 적어 주세요.' },
      { b: '포인트 3', t: '【직접 작성】 세 번째로 확인할 내용을 적어 주세요.' }
    ] });
    blocks.push({ type: 'h', text: `${t} 현장에서 느끼는 점` });
    blocks.push({ type: 'p', text: '【직접 작성】 현장에서 직접 보고 느낀 점이나 고객님께 드리는 조언을 적어 주세요. 직접 겪은 이야기가 들어가면 글이 훨씬 신뢰를 얻습니다.' });
    blocks.push({ type: 'h', text: `${t} 자주 묻는 질문` });
    blocks.push({ type: 'faq', items: [
      { q: `${t}, 왜 중요한가요?`, a: '【직접 작성】 한두 문장으로 답해 주세요.' },
      { q: `${t}, 어떻게 확인하나요?`, a: '【직접 작성】 확인 방법을 간단히 적어 주세요.' },
      { q: `${t}에 대해 상담받을 수 있나요?`, a: `네, 전화(${DEALER.phone})나 카카오톡으로 편하게 문의해 주세요. 수원 SKV1모터스에서 방문 상담도 가능합니다.` }
    ] });
    blocks.push({ type: 'p', text: `${t}에 대해 궁금한 점은 언제든 편하게 문의 주세요. 감사합니다.` });
    blocks.push(...tailBlocks(o.cars));
    return {
      title: `${t} | 수원 중고차 프롬케이카`,
      html: renderHtml(blocks),
      text: renderText(blocks),
      tags: cleanTags(t.split(/\s+/).filter((w) => w.length >= 2), ['수원중고차', '중고차', '프롬케이카'])
    };
  }

  /* ---------------- SEO 점검 ---------------- */
  /**
   * 네이버·구글 검색 기준으로 글을 점검한다 (일반적으로 알려진 기준이며 순위를 보장하지는 않는다).
   * @param {{mode: 'car'|'topic', car?: object, title: string, bodyText: string, tags: string, photoCount?: number}} o
   * @returns {Array<{level: 'ok'|'warn'|'bad', label: string, detail: string}>}
   */
  function seoCheck(o) {
    const out = [];
    const add = (level, label, detail) => out.push({ level, label, detail });
    const title = String(o.title || '').trim();
    const body = String(o.bodyText || '');
    const flat = body.replace(/\s+/g, '');
    const isCar = o.mode === 'car' && o.car;
    const ko = isCar ? koName(o.car) : '';
    // 내가 입력한 주제 글(o.keyword)은 그 주제어를 핵심 키워드로 본다
    const custom = !isCar && o.keyword ? String(o.keyword).trim() : '';
    const key = isCar ? ko : (custom || '중고차');
    const minCount = custom ? 1 : 3;
    const count = (text, k) => (k ? text.split(k).length - 1 : 0);

    // 1. 제목 길이
    if (title.length >= 20 && title.length <= 46) add('ok', '제목 길이', `${title.length}자 — 검색 결과에서 잘리지 않는 길이예요.`);
    else if (title.length < 20) add('warn', '제목 길이', `${title.length}자 — 조금 짧아요. 연식·상태·가격 중 하나를 더 넣어 보세요.`);
    else add('warn', '제목 길이', `${title.length}자 — 길어서 검색 결과에서 뒤가 잘려요. 핵심 키워드는 앞쪽에 있는지 확인하세요.`);

    // 2. 제목 앞부분에 핵심 키워드 + "중고"
    const head = title.replace(/^\[.*?\]\s*/, '').slice(0, 26);
    if (isCar) {
      const mk = global.KCarKo ? (global.KCarKo.koModel(o.car) || ko) : ko;
      if (head.includes(mk) && /중고/.test(head)) add('ok', '제목 앞 키워드', `앞 26자 안에 "${mk}"와 "중고"가 있어요.`);
      else add('bad', '제목 앞 키워드', `앞 26자 안에 "${mk}"와 "중고"가 모두 있어야 검색에 유리해요.`);
    } else if (custom) {
      const firstWord = custom.split(/\s+/)[0];
      if (head.includes(firstWord)) add('ok', '제목 앞 키워드', `앞 26자 안에 주제어(${firstWord})가 있어요.`);
      else add('bad', '제목 앞 키워드', `앞 26자 안에 주제어(${firstWord})를 넣어 주세요.`);
    } else if (/중고/.test(head)) {
      add('ok', '제목 앞 키워드', '앞부분에 "중고"가 있어요.');
    } else {
      add('warn', '제목 앞 키워드', '제목 앞쪽에 "중고차"처럼 검색어가 들어가면 더 좋아요.');
    }

    // 3. 지역 키워드
    if (/수원/.test(title) || /수원/.test(body.slice(0, 200))) add('ok', '지역 키워드', '"수원"이 제목 또는 첫 문단에 있어요.');
    else add('warn', '지역 키워드', '제목이나 첫 문단에 "수원"을 넣으면 지역 검색에 유리해요.');

    // 4. 첫 150자에 핵심 키워드
    const firstKey = custom ? custom.split(/\s+/)[0] : key;
    if (body.slice(0, 160).includes(firstKey)) add('ok', '첫 문단 키워드', `첫 문단에 핵심어(${firstKey})가 들어 있어요.`);
    else add('bad', '첫 문단 키워드', `본문 첫 150자 안에 핵심어(${firstKey})를 넣어 주세요.`);

    // 5. 본문 분량
    if (flat.length >= 1500) add('ok', '본문 분량', `약 ${flat.length.toLocaleString('ko-KR')}자 — 충분해요.`);
    else if (flat.length >= 1000) add('warn', '본문 분량', `약 ${flat.length.toLocaleString('ko-KR')}자 — 1,500자 이상이면 더 좋아요. 직접 보신 느낌을 한두 단락 덧붙여 보세요.`);
    else add('bad', '본문 분량', `약 ${flat.length.toLocaleString('ko-KR')}자 — 짧은 편이에요. 직접 겪은 사례나 한마디를 덧붙여 주세요.`);

    // 6. 핵심 키워드 횟수 (너무 적어도, 너무 많아도 좋지 않다)
    const n = count(body, key);
    if (n >= minCount && n <= 9) add('ok', '키워드 횟수', `"${key}" ${n}번 — 자연스러운 범위예요.`);
    else if (n < minCount) add('warn', '키워드 횟수', `"${key}" ${n}번 — ${minCount}번 이상 자연스럽게 넣어 보세요.`);
    else add('warn', '키워드 횟수', `"${key}" ${n}번 — 너무 많으면 스팸으로 보일 수 있어요. 일부를 다른 표현으로 바꿔 보세요.`);

    // 7. 사이트 링크 (블로그 → 사이트 유입)
    if (/fromkcar\.kr/.test(body)) add('ok', '사이트 링크', '프롬케이카 사이트 링크가 들어 있어요.');
    else add('bad', '사이트 링크', '본문에 사이트 링크(fromkcar.kr)가 없어요. 손님이 넘어올 길이 필요해요.');

    // 8. 연락처
    if (/010-7449-8282/.test(body)) add('ok', '연락처', '휴대폰 번호가 들어 있어요.');
    else add('bad', '연락처', '본문에 연락처가 없어요.');

    // 9. 태그
    const tagCount = (String(o.tags || '').match(/#/g) || []).length;
    if (tagCount >= 5 && tagCount <= 10) add('ok', '태그', `${tagCount}개 — 적당해요.`);
    else add('warn', '태그', `${tagCount}개 — 5~10개가 적당해요.`);

    // 10. 사진 (매물 글만)
    if (isCar) {
      const p = Number(o.photoCount) || 0;
      if (p >= 10) add('ok', '사진', `${p}장 — 10장 이상이에요. 직접 찍은 사진이면 더 좋아요.`);
      else add('warn', '사진', `${p}장 — 10장 이상을 권해요. 가능하면 직접 찍은 사진을 쓰세요.`);
    }
    return out;
  }

  global.KCarBlog = { generate, generateTopic, generateShort, renderCover, listTopics, suggestNew, seoCheck, articleFromData, skeletonFromTopic, TOPICS, SHORT_CHANNELS, DEALER };
})(window);
