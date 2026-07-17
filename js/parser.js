/**
 * FROM K CAR — KB차차차 매물 상세페이지 파서
 * r.jina.ai 리더 서비스를 통해 마크다운으로 변환된 페이지 텍스트를 분석하여
 * 차량 정보를 구조화된 객체로 추출한다.
 *
 * 주의: 이 파서는 "로그인 없이 공개적으로 열람 가능한" 매물 상세페이지만 대상으로 한다.
 */
(function (global) {
  const READER_PREFIX = 'https://r.jina.ai/';

  /** 숫자만 추출 (콤마/문자 제거) */
  function toNumber(str) {
    if (!str) return null;
    const n = String(str).replace(/[^0-9]/g, '');
    return n ? parseInt(n, 10) : null;
  }

  /** "4,490만원" -> 44900000 */
  function priceTextToWon(str) {
    if (!str) return null;
    const m = String(str).match(/([\d,]+)\s*만원/);
    if (!m) return toNumber(str);
    return toNumber(m[1]) * 10000;
  }

  /** URL에서 carSeq 추출 (평문 URL인 경우만 가능) */
  function extractCarSeqFromUrl(url) {
    const m = url.match(/carSeq=(\d+)/);
    return m ? m[1] : null;
  }

  /** 마크다운 텍스트에서 이미지 URL들을 모아 대표 매물(carSeq)의 이미지만 필터링 */
  function extractImages(text, preferredCarSeq) {
    const re = /https:\/\/img\.kbchachacha\.com\/IMG\/carimg\/[a-zA-Z]\/img\d+\/img\d+\/(\d+)_(\d+)\.(?:jpg|jpeg|png|webp)/g;
    const found = [];
    const seqCount = {};
    let m;
    while ((m = re.exec(text)) !== null) {
      const seq = m[1];
      const url = m[0].split('?')[0];
      found.push({ seq, url });
      seqCount[seq] = (seqCount[seq] || 0) + 1;
    }
    let targetSeq = preferredCarSeq;
    if (!targetSeq || !seqCount[targetSeq]) {
      // 가장 많이 등장한 carSeq를 대표 매물로 추정
      targetSeq = Object.keys(seqCount).sort((a, b) => seqCount[b] - seqCount[a])[0] || null;
    }
    const uniq = [];
    const seen = new Set();
    found.forEach((item) => {
      if (item.seq === targetSeq && !seen.has(item.url)) {
        seen.add(item.url);
        uniq.push(item.url);
      }
    });
    return { images: uniq, carSeq: targetSeq };
  }

  /** 제목/차량번호 추출 */
  function extractTitle(text) {
    const m = text.match(/\*\*\(([^)]+)\)([\s\S]{0,120}?)\*\*/);
    if (!m) return { carNumber: null, title: null };
    const carNumber = m[1].trim();
    const rawTitle = m[2].replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    return { carNumber, title: rawTitle };
  }

  /** 브랜드 추정: 국내 인기 수입/국산 브랜드 목록 매칭 */
  const BRAND_LIST = [
    // 제네시스는 "현대 제네시스 ..." 처럼 옛 표기에 '현대'를 함께 포함하는 경우가 있어 먼저 검사한다.
    '제네시스', '벤츠', 'BMW', '아우디', '폭스바겐', '포르쉐', '볼보', '랜드로버', '재규어',
    '미니', '푸조', '렉서스', '토요타', '혼다', '닛산', '테슬라', '캐딜락',
    '한국GM', '쉐보레', '현대', '기아', '쌍용', 'KG모빌리티', '르노', '르노코리아', '시트로엥'
  ];
  function extractBrand(title) {
    if (!title) return null;
    const found = BRAND_LIST.find((b) => title.includes(b));
    return found || title.split(' ')[0];
  }

  /** 판매가격 추출 */
  function extractPrice(text) {
    const m = text.match(/판매가격\*\*([\d,]+\s*만원)\*\*/);
    if (!m) return { priceDisplay: null, price: null };
    return { priceDisplay: m[1].replace(/\s/g, ''), price: priceTextToWon(m[1]) };
  }

  /** 연식/주행거리/연료/지역 한 줄 요약 (예: "24년02월(23년형)34,708km 가솔린 경기") */
  function extractSummaryLine(text) {
    const m = text.match(/(\d{2}년\d{2}월\([^)]+\))\s*([\d,]+km)\s+(\S+)\s+(\S+)/);
    if (!m) return {};
    return {
      yearInfo: m[1],
      mileage: toNumber(m[2]),
      fuelType: m[3],
      region: m[4]
    };
  }

  /** 기본정보 표 파싱 */
  function extractBasicInfoTable(text) {
    const result = {};
    const labelMap = {
      '차량정보': 'carNumber2',
      '연식': 'yearInfo',
      '주행거리': 'mileageText',
      '연료': 'fuelType',
      '변속기': 'transmission',
      '연비': 'fuelEfficiency',
      '차종': 'bodyType',
      '배기량': 'displacement',
      '차량색상': 'color',
      '시트색상': 'seatColor',
      '압류': 'seizure',
      '저당': 'mortgage',
      '세금미납': 'taxUnpaid',
      '제시번호': 'presentNumber'
    };
    // "라벨 | 값" 패턴을 전부 훑어서 아는 라벨이면 채택
    const re = /(차량정보|연식|주행거리|연료|변속기|연비|차종|배기량|차량색상|시트색상|압류|저당|세금미납|제시번호)\s*\|\s*\*{0,2}([^|]+?)\*{0,2}\s*\|/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const key = labelMap[m[1]];
      if (key && result[key] === undefined) {
        result[key] = m[2].trim();
      }
    }
    if (result.mileageText) result.mileage = toNumber(result.mileageText);
    return result;
  }

  /** 사고/보험 이력 요약 */
  function extractAccidentInfo(text) {
    const parts = [];
    const patterns = [
      ['전손이력', /전손이력\s*\*{0,2}([^\*\n]+)\*{0,2}/],
      ['침수이력', /침수이력\s*\*{0,2}([^\*\n]+)\*{0,2}/],
      ['용도이력', /용도이력\s*\*{0,2}([^\*\n]+)\*{0,2}/],
      ['소유자변경', /소유자변경\s*\*{0,2}([^\*\n]+)\*{0,2}/]
    ];
    patterns.forEach(([label, re]) => {
      const m = text.match(re);
      if (m) parts.push(`${label} ${m[1].trim()}`);
    });
    const accidentFree = /보험사고정보\s*사고없음/.test(text);
    const insuranceCount = text.match(/보험이력\s*(\d+)건/);
    let summary = accidentFree ? '무사고' : '사고이력있음';
    if (insuranceCount) summary += ` · 보험이력 ${insuranceCount[1]}건`;
    if (parts.length) summary += ` · ${parts.join(' · ')}`;
    return summary;
  }

  /** 주요옵션 목록 추출 */
  function extractOptions(text) {
    const sectionMatch = text.match(/## 주요옵션([\s\S]*?)(?:\*\s*실제 차량에|## |\* \* \*)/);
    if (!sectionMatch) return [];
    const section = sectionMatch[1];
    const lines = section.split('\n');
    const options = [];
    let current = '';
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (trimmed.startsWith('*')) {
        if (current) options.push(current.trim());
        current = trimmed.replace(/^\*+\s*/, '');
      } else if (trimmed.startsWith('(') || /^\(.*\)$/.test(trimmed)) {
        current += ' ' + trimmed;
      } else if (!trimmed.startsWith('[') && trimmed !== '옵션정보 팝업 열기') {
        current += ' ' + trimmed;
      }
    });
    if (current) options.push(current.trim());
    return options
      .map((o) => o.replace(/\s+/g, ' ').trim())
      .filter((o) => o && o !== '전체보기' && !o.startsWith('['));
  }

  /** 진단/주행거리 분석 요약 문구 */
  function extractDiagnosisSummary(text) {
    const parts = [];
    // "## 프레임 및 외부패널 진단" 상단 안내문에도 "외부패널 **무사고 진단완료**" 같은 문구가 먼저 나오므로,
    // 반드시 "프레임 **상태**" 바로 뒤에 이어지는 "외부패널 **상태**"만 한 쌍으로 잡는다.
    const overall = text.match(/프레임\s*\*{2}([^\*\n]+)\*{2}[\s\S]{0,20}?외부패널\s*\*{2}([^\*\n]+)\*{2}/);
    if (overall) {
      parts.push(`프레임 ${overall[1].trim()}`);
      parts.push(`외부패널 ${overall[2].trim()}`);
    }
    const mileageAnalysis = text.match(/총\s*([0-9년개월\s]+)동안\*{0,2}([\d,]+Km)\*{0,2}\(연평균\s*([\d,]+Km)\s*주행\)/);
    if (mileageAnalysis) {
      parts.push(`총 ${mileageAnalysis[1].trim()} 동안 ${mileageAnalysis[2]} 주행 (연평균 ${mileageAnalysis[3]})`);
    }
    const levelMatch = text.match(/주행거리는[^\[]*\[\s*([^\]]+)\s*\]/);
    if (levelMatch) parts.push(`주행거리 수준: ${levelMatch[1].trim()}`);
    const newCarRatio = text.match(/신차 출고 가격 대비\s*(\d+%)/);
    if (newCarRatio) parts.push(`신차가 대비 ${newCarRatio[1]} 수준`);
    return parts.join(' · ');
  }

  /** 프레임 및 외부패널 진단 상세 (판금/용접·교환 횟수, 부위별 상태) */
  function extractPanelDiagnosis(text) {
    const weldExchange = text.match(/판금\/용접\s*(\d+)\s*회\s*교환\s*(\d+)\s*회/);
    const overall = text.match(/프레임\s*\*{2}([^\*\n]+)\*{2}[\s\S]{0,20}?외부패널\s*\*{2}([^\*\n]+)\*{2}/);
    const headline = text.match(/([가-힣0-9]+)\s*차량의 진단 결과\s*([^\n]+?)\s*입니다/);

    function parsePairs(segment) {
      const items = [];
      const re = /([^*]+?)\*\*([^*]+)\*\*/g;
      let m;
      while ((m = re.exec(segment)) !== null) {
        items.push({ label: m[1].trim(), status: m[2].trim() });
      }
      return items;
    }

    const lineMatch = text.match(/외부패널\s+((?:[^\n*]+\*\*[^*\n]+\*\*)+)프레임\s+((?:[^\n*]+\*\*[^*\n]+\*\*)+)/);
    const exteriorPanels = lineMatch ? parsePairs(lineMatch[1]) : [];
    const frameGroups = lineMatch ? parsePairs(lineMatch[2]) : [];

    if (!weldExchange && !overall && exteriorPanels.length === 0 && frameGroups.length === 0) {
      return null;
    }

    return {
      weld_count: weldExchange ? toNumber(weldExchange[1]) : null,
      exchange_count: weldExchange ? toNumber(weldExchange[2]) : null,
      frame_status: overall ? overall[1].trim() : null,
      exterior_status: overall ? overall[2].trim() : null,
      headline: headline ? `${headline[1].trim()} 차량의 진단 결과 ${headline[2].trim()}입니다` : null,
      exterior_panels: exteriorPanels,
      frame_groups: frameGroups
    };
  }

  /**
   * 메인 파싱 함수
   * @param {string} markdownText - r.jina.ai 로 가져온 마크다운 텍스트
   * @param {string} originalUrl - 원본 매물 URL
   */
  function parseListing(markdownText, originalUrl) {
    const urlCarSeq = extractCarSeqFromUrl(originalUrl);
    const { images, carSeq } = extractImages(markdownText, urlCarSeq);
    const finalCarSeq = urlCarSeq || carSeq;
    const { carNumber, title } = extractTitle(markdownText);
    const { price, priceDisplay } = extractPrice(markdownText);
    const summary = extractSummaryLine(markdownText);
    const basicInfo = extractBasicInfoTable(markdownText);
    const accidentInfo = extractAccidentInfo(markdownText);
    const options = extractOptions(markdownText);
    const diagnosisSummary = extractDiagnosisSummary(markdownText);
    const panelDiagnosis = extractPanelDiagnosis(markdownText);

    const finalCarNumber = carNumber || basicInfo.carNumber2 || null;
    const finalYearInfo = summary.yearInfo || basicInfo.yearInfo || null;
    const finalMileage = summary.mileage || basicInfo.mileage || null;
    const finalFuel = summary.fuelType || basicInfo.fuelType || null;
    const finalRegion = summary.region || null;

    const data = {
      source_url: originalUrl,
      car_seq: finalCarSeq,
      title: title || null,
      car_number: finalCarNumber,
      brand: extractBrand(title),
      price: price,
      price_display: priceDisplay,
      year_info: finalYearInfo,
      mileage: finalMileage,
      fuel_type: finalFuel,
      transmission: basicInfo.transmission || null,
      displacement: basicInfo.displacement || null,
      color: basicInfo.color || null,
      seat_color: basicInfo.seatColor || null,
      region: finalRegion,
      accident_info: accidentInfo,
      options: options,
      main_image: images[0] || null,
      images: images,
      diagnosis_summary: diagnosisSummary,
      panel_diagnosis: panelDiagnosis,
      status: '판매중'
    };
    return data;
  }

  /**
   * 원격 URL을 r.jina.ai 리더로 가져와 파싱까지 수행
   */
  async function fetchAndParse(originalUrl) {
    const readerUrl = READER_PREFIX + originalUrl;
    const res = await fetch(readerUrl);
    if (!res.ok) {
      throw new Error('페이지를 가져오지 못했습니다 (status ' + res.status + ')');
    }
    const text = await res.text();
    if (!text || text.length < 200) {
      throw new Error('가져온 내용이 비어있습니다. 로그인 전용 페이지이거나 존재하지 않는 매물일 수 있습니다.');
    }
    const data = parseListing(text, originalUrl);
    if (!data.title && !data.price) {
      throw new Error('차량 정보를 추출하지 못했습니다. 로그인 후에만 열람 가능한 매물이거나 페이지 구조가 다를 수 있습니다.');
    }
    return data;
  }

  global.KCarParser = {
    parseListing,
    fetchAndParse,
    toNumber,
    priceTextToWon
  };
})(window);
