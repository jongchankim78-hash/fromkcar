/**
 * FROM K CAR — UI 다국어(한국어/러시아어) 지원
 * 매물 데이터(차량명, 사고이력, 진단요약 등)는 번역 대상이 아니며,
 * 메뉴/버튼/라벨 등 고정 UI 텍스트만 전환한다.
 */
(function (global) {
  const STORAGE_KEY = 'fkcar_lang';

  const DICT = {
    ko: {
      admin_login: '관리자 로그인',
      admin_add: '매물 추가',
      hero_showroom: '수원 SKV1모터스 전시장',
      dealer_role: 'FROM K CAR 담당',
      search_placeholder: '차량명, 지역, 번호판으로 검색',
      filter_all_brand: '전체 브랜드',
      filter_all_fuel: '전체 연료',
      sort_registered_desc: '최근 등록순',
      sort_price_asc: '가격 낮은순',
      sort_price_desc: '가격 높은순',
      sort_mileage_asc: '주행거리 적은순',
      sort_year_desc: '연식 최신순',
      gallery_title: '등록된 매물',
      result_count_suffix: '건의 매물을 보고 있어요',
      empty_title: '아직 등록된 매물이 없어요',
      empty_desc: '관리자 페이지에서 매물 URL을 입력해 첫 매물을 추가해보세요.',
      empty_cta: '매물 추가하러 가기',
      empty_filtered_title: '조건에 맞는 매물이 없어요',
      empty_filtered_desc: '검색어나 필터를 조정해보세요.',
      status_selling: '판매중',
      status_sold: '판매완료',
      status_check: '확인필요',
      badge_no_accident: '완전무사고',
      car_title_fallback: '차량명 미확인',
      car_image_alt_fallback: '차량 이미지',
      detail_btn: '상세보기',
      original_listing_title: '원본 매물 보기',
      original_listing_btn: '원본 매물 페이지에서 보기',
      brand_fallback: '기타',
      spec_title: '기본 정보',
      spec_year: '연식',
      spec_mileage: '주행거리',
      spec_fuel: '연료',
      spec_transmission: '변속기',
      spec_displacement: '배기량',
      spec_color: '차량색상',
      spec_seat_color: '시트색상',
      spec_region: '지역',
      diag_title: '진단 · 사고 이력',
      no_accident_info: '정보 없음',
      panel_diagnosis_title: '프레임 및 외부패널 진단',
      panel_frame: '프레임',
      panel_exterior: '외부패널',
      panel_weld: '판금/용접',
      panel_exchange: '교환',
      panel_count_suffix: '회',
      options_title: '주요 옵션',
      options_empty: '등록된 옵션 정보가 없습니다.',
      desc_title: '매물 소개',
      memo_title: '메모',
      load_error: '매물 목록을 불러오는 중 오류가 발생했습니다.',
      lang_toggle_flag: 'ru'
    },
    ru: {
      admin_login: 'Вход для администратора',
      admin_add: 'Добавить автомобиль',
      hero_showroom: 'Автосалон SKV1 Motors, Сувон',
      dealer_role: 'Менеджер FROM K CAR',
      search_placeholder: 'Поиск по названию, региону, номеру',
      filter_all_brand: 'Все марки',
      filter_all_fuel: 'Все виды топлива',
      sort_registered_desc: 'Сначала новые',
      sort_price_asc: 'Цена: по возрастанию',
      sort_price_desc: 'Цена: по убыванию',
      sort_mileage_asc: 'Меньший пробег',
      sort_year_desc: 'Новее по году',
      gallery_title: 'Автомобили в наличии',
      result_count_suffix: ' объявлений найдено',
      empty_title: 'Пока нет зарегистрированных автомобилей',
      empty_desc: 'Добавьте первое объявление через страницу администратора.',
      empty_cta: 'Добавить автомобиль',
      empty_filtered_title: 'Ничего не найдено по заданным условиям',
      empty_filtered_desc: 'Попробуйте изменить запрос или фильтры.',
      status_selling: 'В продаже',
      status_sold: 'Продано',
      status_check: 'Уточняется',
      badge_no_accident: 'Без ДТП',
      car_title_fallback: 'Название не указано',
      car_image_alt_fallback: 'Фото автомобиля',
      detail_btn: 'Подробнее',
      original_listing_title: 'Смотреть оригинал',
      original_listing_btn: 'Смотреть оригинальное объявление',
      brand_fallback: 'Другое',
      spec_title: 'Основная информация',
      spec_year: 'Год выпуска',
      spec_mileage: 'Пробег',
      spec_fuel: 'Топливо',
      spec_transmission: 'КПП',
      spec_displacement: 'Объём двигателя',
      spec_color: 'Цвет кузова',
      spec_seat_color: 'Цвет салона',
      spec_region: 'Регион',
      diag_title: 'Диагностика и история ДТП',
      no_accident_info: 'Нет информации',
      panel_diagnosis_title: 'Диагностика рамы и кузовных панелей',
      panel_frame: 'Рама',
      panel_exterior: 'Кузовные панели',
      panel_weld: 'Жесть/сварка',
      panel_exchange: 'Замена',
      panel_count_suffix: ' раз',
      options_title: 'Основные опции',
      options_empty: 'Информация об опциях отсутствует.',
      desc_title: 'Описание',
      memo_title: 'Заметка',
      load_error: 'Ошибка при загрузке списка автомобилей.',
      lang_toggle_flag: 'kr'
    }
  };

  function getLang() {
    return localStorage.getItem(STORAGE_KEY) || 'ko';
  }

  function t(key) {
    const lang = getLang();
    return (DICT[lang] && DICT[lang][key]) || DICT.ko[key] || key;
  }

  function applyStaticI18n() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });
    const toggleFlag = document.getElementById('lang-toggle-flag');
    if (toggleFlag) toggleFlag.className = 'fi fi-' + t('lang_toggle_flag');
  }

  function setLang(lang) {
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang === 'ru' ? 'ru' : 'ko';
    applyStaticI18n();
    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
  }

  document.documentElement.lang = getLang() === 'ru' ? 'ru' : 'ko';
  applyStaticI18n();
  const toggleBtn = document.getElementById('lang-toggle-btn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => setLang(getLang() === 'ko' ? 'ru' : 'ko'));
  }

  global.KCarI18n = { t, getLang, setLang, applyStaticI18n };
})(window);
