/**
 * FROM K CAR — 담당자 버전 (프로필).
 * 같은 사이트를 담당자별로 보여주기 위한 정의다.
 *   www.fromkcar.kr         → 김종찬 팀장 (기존 그대로)
 *   www.fromkcar.kr/HOONS   → 정훈 이사 (연락처·프로필 사진·명함만 다르고 나머지는 동일)
 * 서버(Node)는 이 파일로 HTML 안의 담당자 정보를 바꿔 내려보내고, 브라우저는 같은 정보로
 * 문의 버튼·명함·주소(경로)를 맞춘다. 담당자를 더 늘리려면 PROFILES에 항목을 하나 추가하면 된다.
 * (카카오 채널, 텔레그램, 인스타그램, 사무실 전화·팩스·주소는 회사 공통이라 여기서 바꾸지 않는다.)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KCarProfiles = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const PROFILES = {
    default: {
      id: 'default',
      base: '',
      nameKo: '김종찬 팀장',
      nameEn: 'KIM JONG CHAN',
      phone: '010-7449-8282',
      phoneIntl: '+82-10-7449-8282',
      wa: '821074498282',
      email: 'chanini78@naver.com',
      photo: 'images/dealer-photo-v2.jpg',
      // SNS로 사이트 주소를 공유할 때 보이는 대표 이미지(1200×630). 이미지를 바꿀 땐 파일 이름도 바꿔야 SNS 쪽 옛 이미지가 새로 갱신된다.
      ogImage: 'images/og-jongchan.png',
      cardKo: 'images/idcard-kr.jpg',
      cardEn: 'images/idcard-en.jpg'
    },
    hoons: {
      id: 'hoons',
      base: '/HOONS',
      nameKo: '정훈 이사',
      // 화면에 보이는 한국어 이름: 이름 글자 사이를 띄우고 직함(이사)은 작게 (명함과 같은 모양). alt 등 일반 텍스트에는 nameKo를 쓴다.
      nameKoHtml: '정 훈 <span style="font-size:0.65em;margin-left:0.15em;">이사</span>',
      nameEn: 'JEONG HOON',
      phone: '010-6422-1235',
      phoneIntl: '+82-10-6422-1235',
      wa: '821064221235', // 왓츠앱 문의 번호는 담당자 휴대폰 번호를 따른다
      email: 'jh1162@naver.com',
      photo: 'images/hoons/profile.jpg',
      ogImage: 'images/hoons/og-image.png',
      cardKo: 'images/hoons/idcard-kr.jpg',
      cardEn: 'images/hoons/idcard-en.jpg'
    }
  };

  // 경로 맨 앞이 "/HOONS"(대소문자 무관)이면 그 담당자 버전. 예: /HOONS, /hoons/, /HOONS/car/abc, /HOONS/ru
  function fromPath(pathname) {
    const m = String(pathname || '').match(/^\/([A-Za-z0-9_-]+)(?=\/|$)/);
    if (m) {
      const hit = Object.values(PROFILES).find((p) => p.base && p.base.slice(1).toLowerCase() === m[1].toLowerCase());
      if (hit) return hit;
    }
    return PROFILES.default;
  }

  // 담당자 경로(/HOONS)를 떼어낸 나머지 경로. 예: "/HOONS/car/abc" → "/car/abc", "/HOONS" → "/"
  function inner(pathname, profile) {
    const p = profile || fromPath(pathname);
    if (!p.base) return pathname;
    return String(pathname).slice(p.base.length) || '/';
  }

  // 서버가 HTML을 내려줄 때 기본(김종찬) 정보를 해당 담당자 정보로 바꾼다.
  function applyToHtml(html, profile) {
    if (!profile || profile.id === 'default') return html;
    const d = PROFILES.default;
    const pairs = [
      // 담당자 이름 표시칸은 글자 모양을 바꾼 버전으로 (아래 일반 이름 교체보다 먼저 해야 한다)
      ...(profile.nameKoHtml ? [[`data-i18n="dealer_name">${d.nameKo}<`, `data-i18n="dealer_name">${profile.nameKoHtml}<`]] : []),
      [`wa.me/${d.wa}`, `wa.me/${profile.wa}`],
      [d.phoneIntl, profile.phoneIntl],
      [d.phone, profile.phone],
      [d.email, profile.email],
      [d.nameEn, profile.nameEn],
      [d.nameKo, profile.nameKo],
      [d.photo, profile.photo],
      [d.ogImage, profile.ogImage],
      // 로고·"갤러리로" 같은 처음으로 가는 링크는 이 담당자 버전의 첫 화면으로
      ['href="index.html"', `href="${profile.base}"`]
    ];
    return pairs.reduce((out, [from, to]) => out.split(from).join(to), html);
  }

  return { PROFILES, fromPath, inner, applyToHtml };
});
