/**
 * FROM K CAR — UI 다국어(한국어/러시아어/몽골어/영어) 지원
 * 매물 데이터(차량명, 사고이력, 진단요약 등)는 번역 대상이 아니며,
 * 메뉴/버튼/라벨 등 고정 UI 텍스트만 전환한다.
 */
(function (global) {
  const STORAGE_KEY = 'fkcar_lang';

  const DICT = {
    ko: {
      hero_showroom: '수원 SKV1모터스 전시장',
      dealer_role: 'FROM K CAR 담당',
      dealer_name: '김종찬 팀장',
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
      view_list: '리스트로 보기',
      view_grid: '썸네일로 보기',
      empty_title: '아직 등록된 매물이 없어요',
      empty_desc: '관리자 페이지에서 매물 URL을 입력해 첫 매물을 추가해보세요.',
      empty_cta: '매물 추가하러 가기',
      empty_filtered_title: '조건에 맞는 매물이 없어요',
      empty_filtered_desc: '검색어나 필터를 조정해보세요.',
      status_selling: '판매중',
      status_sold: '판매완료',
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
      translate_btn: '번역하기',
      download_images_btn: '사진 전체 다운로드 (ZIP)'
    },
    ru: {
      hero_showroom: 'Автосалон SKV1 Motors, Сувон',
      dealer_role: 'Менеджер FROM K CAR',
      dealer_name: 'KIM JONG CHAN',
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
      view_list: 'Список',
      view_grid: 'Плитка',
      empty_title: 'Пока нет зарегистрированных автомобилей',
      empty_desc: 'Добавьте первое объявление через страницу администратора.',
      empty_cta: 'Добавить автомобиль',
      empty_filtered_title: 'Ничего не найдено по заданным условиям',
      empty_filtered_desc: 'Попробуйте изменить запрос или фильтры.',
      status_selling: 'В продаже',
      status_sold: 'Продано',
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
      translate_btn: 'Перевести на русский',
      download_images_btn: 'Скачать все фото (ZIP)'
    },
    mn: {
      hero_showroom: 'Сувон хотын SKV1 Моторс автосалон',
      dealer_role: 'FROM K CAR-ийн менежер',
      dealer_name: 'KIM JONG CHAN',
      search_placeholder: 'Нэр, бүс, дугаараар хайх',
      filter_all_brand: 'Бүх брэнд',
      filter_all_fuel: 'Бүх түлш',
      sort_registered_desc: 'Шинээр нэмэгдсэн',
      sort_price_asc: 'Үнэ өсөхөөр',
      sort_price_desc: 'Үнэ буурахаар',
      sort_mileage_asc: 'Гүйлт бага',
      sort_year_desc: 'Он шинэ',
      gallery_title: 'Бүртгэлтэй машинууд',
      result_count_suffix: ' машин байна',
      view_list: 'Жагсаалт',
      view_grid: 'Хавтгай',
      empty_title: 'Одоогоор бүртгэлтэй машин алга байна',
      empty_desc: 'Админ хуудаснаас машины URL оруулж эхний зарыг нэмнэ үү.',
      empty_cta: 'Машин нэмэх',
      empty_filtered_title: 'Тохирох машин олдсонгүй',
      empty_filtered_desc: 'Хайлт эсвэл шүүлтүүрээ өөрчилж үзнэ үү.',
      status_selling: 'Зарагдаж байна',
      status_sold: 'Зарагдсан',
      badge_no_accident: 'Ослын түүхгүй',
      car_title_fallback: 'Нэр тодорхойгүй',
      car_image_alt_fallback: 'Машины зураг',
      detail_btn: 'Дэлгэрэнгүй',
      original_listing_title: 'Эх зарыг үзэх',
      original_listing_btn: 'Эх зарын хуудсыг үзэх',
      brand_fallback: 'Бусад',
      spec_title: 'Үндсэн мэдээлэл',
      spec_year: 'Үйлдвэрлэсэн он',
      spec_mileage: 'Гүйлт',
      spec_fuel: 'Түлш',
      spec_transmission: 'Хурдны хайрцаг',
      spec_displacement: 'Хөдөлгүүрийн багтаамж',
      spec_color: 'Өнгө',
      spec_seat_color: 'Дотоод өнгө',
      spec_region: 'Бүс нутаг',
      diag_title: 'Оношилгоо · Ослын түүх',
      no_accident_info: 'Мэдээлэл байхгүй',
      panel_diagnosis_title: 'Фрэйм ба гадна панелийн оношилгоо',
      panel_frame: 'Фрэйм',
      panel_exterior: 'Гадна панель',
      panel_weld: 'Гагнуур/засвар',
      panel_exchange: 'Солилт',
      panel_count_suffix: ' удаа',
      options_title: 'Гол тохиргоо',
      options_empty: 'Бүртгэлтэй тохиргооны мэдээлэл байхгүй.',
      desc_title: 'Машины танилцуулга',
      memo_title: 'Тэмдэглэл',
      load_error: 'Машины жагсаалтыг ачаалахад алдаа гарлаа.',
      translate_btn: 'Монгол хэл рүү орчуулах',
      download_images_btn: 'Бүх зургийг татах (ZIP)'
    },
    en: {
      hero_showroom: 'SKV1 Motors Showroom, Suwon',
      dealer_role: 'FROM K CAR Manager',
      dealer_name: 'KIM JONG CHAN',
      search_placeholder: 'Search by name, region, plate number',
      filter_all_brand: 'All brands',
      filter_all_fuel: 'All fuel types',
      sort_registered_desc: 'Newest first',
      sort_price_asc: 'Price: low to high',
      sort_price_desc: 'Price: high to low',
      sort_mileage_asc: 'Lowest mileage',
      sort_year_desc: 'Newest model year',
      gallery_title: 'Available Listings',
      result_count_suffix: ' listings found',
      view_list: 'List',
      view_grid: 'Grid',
      empty_title: 'No listings registered yet',
      empty_desc: 'Add your first listing from the admin page by entering a URL.',
      empty_cta: 'Add a listing',
      empty_filtered_title: 'No listings match your filters',
      empty_filtered_desc: 'Try adjusting your search or filters.',
      status_selling: 'For sale',
      status_sold: 'Sold',
      badge_no_accident: 'Accident-free',
      car_title_fallback: 'Title not available',
      car_image_alt_fallback: 'Car photo',
      detail_btn: 'Details',
      original_listing_title: 'View original listing',
      original_listing_btn: 'View original listing page',
      brand_fallback: 'Other',
      spec_title: 'Basic Info',
      spec_year: 'Model year',
      spec_mileage: 'Mileage',
      spec_fuel: 'Fuel',
      spec_transmission: 'Transmission',
      spec_displacement: 'Displacement',
      spec_color: 'Exterior color',
      spec_seat_color: 'Interior color',
      spec_region: 'Region',
      diag_title: 'Diagnosis & Accident History',
      no_accident_info: 'No information',
      panel_diagnosis_title: 'Frame & Exterior Panel Diagnosis',
      panel_frame: 'Frame',
      panel_exterior: 'Exterior panel',
      panel_weld: 'Sheet metal/weld',
      panel_exchange: 'Replaced',
      panel_count_suffix: 'x',
      options_title: 'Key Options',
      options_empty: 'No option information registered.',
      desc_title: 'Description',
      memo_title: 'Note',
      load_error: 'Failed to load the listings.',
      translate_btn: 'Translate to English',
      download_images_btn: 'Download all photos (ZIP)'
    }
  };

  const SUPPORTED_LANGS = ['ko', 'ru', 'mn', 'en'];

  function getLang() {
    const stored = localStorage.getItem(STORAGE_KEY);
    return SUPPORTED_LANGS.includes(stored) ? stored : 'ko';
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
    document.querySelectorAll('.lang-flag-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.lang === getLang());
    });
  }

  function setLang(lang) {
    localStorage.setItem(STORAGE_KEY, SUPPORTED_LANGS.includes(lang) ? lang : 'ko');
    document.documentElement.lang = getLang();
    applyStaticI18n();
    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang: getLang() } }));
  }

  document.documentElement.lang = getLang();
  applyStaticI18n();
  document.querySelectorAll('.lang-flag-btn').forEach((btn) => {
    btn.addEventListener('click', () => setLang(btn.dataset.lang));
  });

  global.KCarI18n = { t, getLang, setLang, applyStaticI18n };
})(window);
