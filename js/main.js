/**
 * FROM K CAR — 메인 갤러리 페이지 로직
 */
(function () {
  const HOME_TITLE = document.title;
  let allCars = [];
  let currentModalImages = [];
  let currentModalIndex = 0;
  let currentModalCar = null;

  function getCarIdFromUrl() {
    const m = window.location.pathname.match(/^\/car\/([^/]+)\/?$/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  const gridEl = document.getElementById('car-grid');
  const loadingEl = document.getElementById('loading-state');
  const emptyEl = document.getElementById('empty-state');
  const resultCountEl = document.getElementById('result-count');
  const searchInput = document.getElementById('search-input');
  const brandFilter = document.getElementById('filter-brand');
  const fuelFilter = document.getElementById('filter-fuel');
  const sortSelect = document.getElementById('sort-select');

  function effectiveBrand(car) {
    // 옛 표기("현대 제네시스 ...")로 등록된 매물은 브랜드가 '현대'로 저장돼 있어도 실제로는 제네시스다.
    if (car.brand === '현대' && car.title && car.title.includes('제네시스')) return '제네시스';
    return car.brand;
  }

  function populateFilterOptions(cars) {
    const brands = [...new Set(cars.map(c => effectiveBrand(c)).filter(Boolean))].sort();
    const fuels = [...new Set(cars.map(c => c.fuel_type).filter(Boolean))].sort();
    const t = KCarI18n.t;
    brandFilter.innerHTML = `<option value="">${t('filter_all_brand')}</option>` + brands.map(b => `<option value="${KCarUtil.escapeHtml(b)}">${KCarUtil.escapeHtml(b)}</option>`).join('');
    fuelFilter.innerHTML = `<option value="">${t('filter_all_fuel')}</option>` + fuels.map(f => `<option value="${KCarUtil.escapeHtml(f)}">${KCarUtil.escapeHtml(f)}</option>`).join('');
  }

  function statusBadge(status) {
    const t = KCarI18n.t;
    const map = {
      '판매중': `<span class="badge badge-status-green"><i class="fa-solid fa-circle text-[8px]"></i>${t('status_selling')}</span>`,
      '판매완료': `<span class="badge badge-status-gray"><i class="fa-solid fa-circle text-[8px]"></i>${t('status_sold')}</span>`
    };
    return map[status] || map['판매중'];
  }

  function carCardHtml(car) {
    const t = KCarI18n.t;
    const images = Array.isArray(car.images) ? car.images : [];
    const mainImg = car.main_image || images[0] || 'https://via.placeholder.com/480x360?text=No+Image';
    const imgCount = images.length;
    return `
    <article class="car-card fade-in" data-id="${car.id}">
      <div class="car-card-img-wrap cursor-pointer" data-action="open-detail" data-id="${car.id}">
        <img src="${mainImg}" alt="${KCarUtil.escapeHtml(car.title || t('car_image_alt_fallback'))}" loading="lazy"
             onerror="this.src='https://via.placeholder.com/480x360?text=No+Image'">
        ${imgCount > 1 ? `<div class="car-card-count"><i class="fa-solid fa-images text-[11px]"></i>${imgCount}</div>` : ''}
        <div class="absolute top-3 left-3 flex gap-1.5">${statusBadge(car.status)}</div>
      </div>
      <div class="p-4 flex flex-col flex-1">
        <div class="flex items-center gap-1.5 mb-1.5">
          <span class="badge badge-blue">${KCarUtil.escapeHtml(effectiveBrand(car) || t('brand_fallback'))}</span>
          ${car.car_number ? `<span class="badge badge-gray">${KCarUtil.escapeHtml(car.car_number)}</span>` : ''}
          ${car.accident_info && car.accident_info.startsWith('무사고') ? `<span class="badge badge-nosplit"><i class="fa-solid fa-shield-heart"></i>${t('badge_no_accident')}</span>` : ''}
        </div>
        <h3 class="font-bold text-[15px] text-[var(--fk-gray-800)] line-clamp-2 mb-2 cursor-pointer" data-action="open-detail" data-id="${car.id}">
          ${KCarUtil.escapeHtml(car.title || t('car_title_fallback'))}
        </h3>
        <p class="text-xl font-extrabold text-[var(--fk-navy)] mb-3">${car.price_display || KCarUtil.formatPrice(car.price)}</p>
        <div class="flex flex-wrap gap-1.5 mb-4">
          <span class="spec-chip"><i class="fa-regular fa-calendar mr-1"></i>${KCarUtil.escapeHtml(car.year_info || '-')}</span>
          <span class="spec-chip"><i class="fa-solid fa-road mr-1"></i>${KCarUtil.formatMileage(car.mileage)}</span>
          <span class="spec-chip"><i class="fa-solid fa-gas-pump mr-1"></i>${KCarUtil.escapeHtml(car.fuel_type || '-')}</span>
          <span class="spec-chip"><i class="fa-solid fa-location-dot mr-1"></i>${KCarUtil.escapeHtml(car.region || '-')}</span>
        </div>
        <div class="mt-auto flex gap-2">
          <a href="/car/${car.id}" class="btn-secondary flex-1 !py-2 text-sm text-center" data-action="open-detail" data-id="${car.id}">
            <i class="fa-solid fa-circle-info mr-1.5"></i>${t('detail_btn')}
          </a>
          ${car.source_url ? `<a href="${car.source_url}" target="_blank" rel="noopener" class="btn-secondary !py-2 !px-3 text-sm" title="${t('original_listing_title')}"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ''}
        </div>
      </div>
    </article>`;
  }

  function carCardThumbHtml(car) {
    const t = KCarI18n.t;
    const images = Array.isArray(car.images) ? car.images : [];
    const mainImg = car.main_image || images[0] || 'https://via.placeholder.com/480x360?text=No+Image';
    return `
    <article class="car-card-thumb fade-in" data-id="${car.id}">
      <div class="car-card-img-wrap cursor-pointer" data-action="open-detail" data-id="${car.id}">
        <img src="${mainImg}" alt="${KCarUtil.escapeHtml(car.title || t('car_image_alt_fallback'))}" loading="lazy"
             onerror="this.src='https://via.placeholder.com/480x360?text=No+Image'">
        <div class="car-card-thumb-status">${statusBadge(car.status)}</div>
      </div>
      <div class="p-3">
        <h3 class="font-bold text-sm text-[var(--fk-gray-800)] line-clamp-2 mb-1 cursor-pointer" data-action="open-detail" data-id="${car.id}">
          ${KCarUtil.escapeHtml(car.title || t('car_title_fallback'))}
        </h3>
        <p class="text-sm font-extrabold text-[var(--fk-navy)] mb-2">${car.price_display || KCarUtil.formatPrice(car.price)}</p>
        <a href="/car/${car.id}" class="btn-secondary block w-full !py-2 text-xs text-center" data-action="open-detail" data-id="${car.id}">
          <i class="fa-solid fa-circle-info mr-1"></i>${t('detail_btn')}
        </a>
      </div>
    </article>`;
  }

  function carCardListHtml(car) {
    const t = KCarI18n.t;
    const images = Array.isArray(car.images) ? car.images : [];
    const mainImg = car.main_image || images[0] || 'https://via.placeholder.com/480x360?text=No+Image';
    return `
    <article class="car-card-list fade-in" data-id="${car.id}">
      <div class="car-card-list-img-wrap cursor-pointer" data-action="open-detail" data-id="${car.id}">
        <img src="${mainImg}" alt="${KCarUtil.escapeHtml(car.title || t('car_image_alt_fallback'))}" loading="lazy"
             onerror="this.src='https://via.placeholder.com/480x360?text=No+Image'">
        <div class="car-card-list-status">${statusBadge(car.status)}</div>
      </div>
      <div class="car-card-list-body cursor-pointer" data-action="open-detail" data-id="${car.id}">
        <div class="flex items-center gap-1.5">
          <span class="badge badge-blue">${KCarUtil.escapeHtml(effectiveBrand(car) || t('brand_fallback'))}</span>
          ${car.car_number ? `<span class="badge badge-gray">${KCarUtil.escapeHtml(car.car_number)}</span>` : ''}
        </div>
        <h3 class="font-bold text-sm text-[var(--fk-gray-800)] line-clamp-1">${KCarUtil.escapeHtml(car.title || t('car_title_fallback'))}</h3>
        <p class="text-base font-extrabold text-[var(--fk-navy)]">${car.price_display || KCarUtil.formatPrice(car.price)}</p>
        <div class="flex flex-wrap gap-1.5">
          <span class="spec-chip">${KCarUtil.escapeHtml(car.year_info || '-')}</span>
          <span class="spec-chip">${KCarUtil.formatMileage(car.mileage)}</span>
        </div>
      </div>
    </article>`;
  }

  const VIEW_STORAGE_KEY = 'fkcar_view';
  function getViewMode() {
    return localStorage.getItem(VIEW_STORAGE_KEY) === 'list' ? 'list' : 'grid';
  }
  function updateViewToggleUI() {
    const mode = getViewMode();
    document.querySelectorAll('.view-toggle-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === mode);
    });
  }
  function setViewMode(mode) {
    localStorage.setItem(VIEW_STORAGE_KEY, mode);
    updateViewToggleUI();
    applyFiltersAndRender();
  }

  function applyFiltersAndRender() {
    const q = (searchInput.value || '').trim().toLowerCase();
    const brand = brandFilter.value;
    const fuel = fuelFilter.value;
    const sort = sortSelect.value;

    let filtered = allCars.filter(car => {
      if (brand && effectiveBrand(car) !== brand) return false;
      if (fuel && car.fuel_type !== fuel) return false;
      if (q) {
        const hay = [car.title, car.region, car.car_number, car.brand].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      switch (sort) {
        case 'price_asc': return (a.price ?? Infinity) - (b.price ?? Infinity);
        case 'price_desc': return (b.price ?? -Infinity) - (a.price ?? -Infinity);
        case 'mileage_asc': return (a.mileage ?? Infinity) - (b.mileage ?? Infinity);
        case 'year_desc': return String(b.year_info || '').localeCompare(String(a.year_info || ''));
        default: return (b.created_at || 0) - (a.created_at || 0);
      }
    });

    resultCountEl.textContent = filtered.length;

    if (filtered.length === 0) {
      gridEl.classList.add('hidden');
      emptyEl.classList.remove('hidden');
      if (allCars.length > 0) {
        emptyEl.querySelector('h3').textContent = KCarI18n.t('empty_filtered_title');
        emptyEl.querySelector('p').textContent = KCarI18n.t('empty_filtered_desc');
      }
      return;
    }
    emptyEl.classList.add('hidden');
    gridEl.classList.remove('hidden');

    const isMobile = window.matchMedia('(max-width: 639px)').matches;
    const isListView = isMobile && getViewMode() === 'list';
    const isThumbView = isMobile && !isListView;
    gridEl.classList.toggle('car-grid-mobile-thumb', isThumbView);
    const cardFn = isListView ? carCardListHtml : (isThumbView ? carCardThumbHtml : carCardHtml);
    gridEl.innerHTML = filtered.map(cardFn).join('');
  }

  const BRAND_EN = {
    '벤츠': 'BENZ', 'BMW': 'BMW', '아우디': 'AUDI', '폭스바겐': 'VOLKSWAGEN',
    '포르쉐': 'PORSCHE', '볼보': 'VOLVO', '랜드로버': 'LAND ROVER', '재규어': 'JAGUAR',
    '미니': 'MINI', '푸조': 'PEUGEOT', '렉서스': 'LEXUS', '토요타': 'TOYOTA',
    '혼다': 'HONDA', '닛산': 'NISSAN', '테슬라': 'TESLA', '캐딜락': 'CADILLAC',
    '쉐보레': 'CHEVROLET', '현대': 'HYUNDAI', '기아': 'KIA', '제네시스': 'GENESIS',
    '쌍용': 'SSANGYONG', 'KG모빌리티': 'KG MOBILITY', '르노': 'RENAULT',
    '르노코리아': 'RENAULT KOREA', '시트로엥': 'CITROEN', '한국GM': 'CHEVROLET', 'GM': 'CHEVROLET'
  };
  const PRIMARY_BRANDS = ['벤츠', 'BMW', '볼보'];

  function brandLabel(brand) {
    return BRAND_EN[brand] || String(brand).toUpperCase();
  }

  function renderHeroBrandStats(cars) {
    const counts = {};
    cars.forEach(c => { const b = effectiveBrand(c); if (b) counts[b] = (counts[b] || 0) + 1; });

    const otherBrands = Object.keys(counts)
      .filter(b => !PRIMARY_BRANDS.includes(b))
      .sort((a, b) => counts[b] - counts[a]);
    const orderedBrands = [...PRIMARY_BRANDS, ...otherBrands].filter(b => counts[b] > 0);

    const container = document.getElementById('hero-brand-stats');
    container.innerHTML = orderedBrands.map(brand => `
      <button type="button" class="hero-brand-badge inline-flex items-center gap-2 bg-white/8 backdrop-blur rounded-xl px-4 py-2.5 border border-white/10 hover:border-[var(--fk-gold)]/60 transition-colors cursor-pointer" data-brand="${KCarUtil.escapeHtml(brand)}">
        <span class="font-extrabold text-white text-sm tracking-wide">${KCarUtil.escapeHtml(brandLabel(brand))}</span>
        <span class="text-[var(--fk-gold)] font-bold text-sm">${counts[brand] || 0}대</span>
      </button>
    `).join('');

    container.querySelectorAll('.hero-brand-badge').forEach(btn => {
      btn.addEventListener('click', () => {
        brandFilter.value = btn.dataset.brand;
        applyFiltersAndRender();
        document.getElementById('gallery').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function injectVehicleSchema(cars) {
    const prev = document.getElementById('vehicle-schema');
    if (prev) prev.remove();
    if (!cars.length) return;

    const itemList = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: cars.slice(0, 30).map((car, idx) => ({
        '@type': 'ListItem',
        position: idx + 1,
        item: {
          '@type': 'Car',
          name: car.title,
          brand: effectiveBrand(car),
          image: car.main_image || (Array.isArray(car.images) ? car.images[0] : undefined),
          vehicleModelDate: car.year_info,
          mileageFromOdometer: car.mileage ? { '@type': 'QuantitativeValue', value: car.mileage, unitCode: 'KMT' } : undefined,
          offers: {
            '@type': 'Offer',
            price: car.price,
            priceCurrency: 'KRW',
            availability: car.status === '판매중' ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            url: 'https://www.fromkcar.kr/'
          }
        }
      }))
    };

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'vehicle-schema';
    script.textContent = JSON.stringify(itemList);
    document.head.appendChild(script);
  }

  async function loadCars() {
    try {
      const res = await KCarAPI.listCars({ limit: 200 });
      allCars = (res.data || []).filter(c => !c.deleted);
      loadingEl.classList.add('hidden');
      populateFilterOptions(allCars);
      renderHeroBrandStats(allCars);
      applyFiltersAndRender();
      injectVehicleSchema(allCars);

      const urlCarId = getCarIdFromUrl();
      if (urlCarId) {
        const car = allCars.find(c => c.id === urlCarId);
        if (car) openDetailModal(car, { pushState: false });
      }
    } catch (e) {
      loadingEl.classList.add('hidden');
      emptyEl.classList.remove('hidden');
      KCarUtil.toast(KCarI18n.t('load_error'), 'error');
    }
  }

  /* ---------------- 상세 모달 ---------------- */
  function optionTagsHtml(options) {
    if (!Array.isArray(options) || options.length === 0) return `<p class="text-sm text-[var(--fk-gray-600)]">${KCarI18n.t('options_empty')}</p>`;
    return options.map(o => `<span class="option-tag"><i class="fa-solid fa-check text-[var(--fk-blue)] text-[11px]"></i>${KCarUtil.escapeHtml(o)}</span>`).join('');
  }

  function specRow(label, value) {
    return `<tr><th>${label}</th><td>${value ? KCarUtil.escapeHtml(String(value)) : '-'}</td></tr>`;
  }

  function panelDiagnosisHtml(pd, t) {
    if (!pd) return '';
    // 번역 후에도 정상/비정상 색상 판정이 틀어지지 않도록, 원문 기준으로 미리 계산해둔 플래그가 있으면 그걸 우선 쓴다.
    const isNormal = (item) => (item._isNormal !== undefined ? item._isNormal : item.status === '정상');
    const badgeCls = (normal) => (normal ? 'badge-green' : 'badge-red');
    const frameNormal = pd._frameIsNormal !== undefined ? pd._frameIsNormal : pd.frame_status === '정상';
    const exteriorNormal = pd._exteriorIsNormal !== undefined ? pd._exteriorIsNormal : pd.exterior_status === '정상';
    const panelRows = (items) => items.map((item) => `
      <div class="flex items-center justify-between gap-3 text-sm py-1.5 border-b border-[var(--fk-gray-100)] last:border-0">
        <span class="text-[var(--fk-gray-600)]">${KCarUtil.escapeHtml(item.label)}</span>
        <span class="font-bold flex-shrink-0 ${isNormal(item) ? 'text-[var(--fk-green)]' : 'text-[var(--fk-red)]'}">${KCarUtil.escapeHtml(item.status)}</span>
      </div>
    `).join('');

    return `
    <div class="mb-6 bg-[var(--fk-gray-50)] rounded-2xl p-4 sm:p-5">
      <h3 class="text-sm font-bold text-[var(--fk-gray-800)] mb-3"><i class="fa-solid fa-car-burst mr-1.5 text-[var(--fk-blue)]"></i>${t('panel_diagnosis_title')}</h3>
      ${pd.headline ? `<p class="text-sm text-[var(--fk-gray-800)] mb-3">${KCarUtil.escapeHtml(pd.headline)}</p>` : ''}
      <div class="flex flex-wrap gap-2 mb-4">
        ${pd.frame_status ? `<span class="badge ${badgeCls(frameNormal)}">${t('panel_frame')} ${KCarUtil.escapeHtml(pd.frame_status)}</span>` : ''}
        ${pd.exterior_status ? `<span class="badge ${badgeCls(exteriorNormal)}">${t('panel_exterior')} ${KCarUtil.escapeHtml(pd.exterior_status)}</span>` : ''}
        ${pd.weld_count !== null && pd.weld_count !== undefined ? `<span class="spec-chip">${t('panel_weld')} ${pd.weld_count}${t('panel_count_suffix')}</span>` : ''}
        ${pd.exchange_count !== null && pd.exchange_count !== undefined ? `<span class="spec-chip">${t('panel_exchange')} ${pd.exchange_count}${t('panel_count_suffix')}</span>` : ''}
      </div>
      <div class="grid sm:grid-cols-2 gap-x-6">
        ${Array.isArray(pd.exterior_panels) && pd.exterior_panels.length ? `<div>
          <p class="text-xs font-bold text-[var(--fk-gray-500)] uppercase tracking-wide mb-1">${t('panel_exterior')}</p>
          ${panelRows(pd.exterior_panels)}
        </div>` : ''}
        ${Array.isArray(pd.frame_groups) && pd.frame_groups.length ? `<div>
          <p class="text-xs font-bold text-[var(--fk-gray-500)] uppercase tracking-wide mb-1">${t('panel_frame')}</p>
          ${panelRows(pd.frame_groups)}
        </div>` : ''}
      </div>
    </div>`;
  }

  function buildCarInfoHtml(car, t) {
    const showTranslateBtn = KCarI18n.getLang() !== 'ko' && !car._translated;
    return `
      <div class="flex flex-wrap items-center gap-2 mt-5 mb-2">
        <span class="badge badge-blue">${KCarUtil.escapeHtml(effectiveBrand(car) || t('brand_fallback'))}</span>
        ${statusBadge(car.status)}
        ${car.car_number ? `<span class="badge badge-gray">${KCarUtil.escapeHtml(car.car_number)}</span>` : ''}
      </div>
      <h2 class="text-2xl font-extrabold text-[var(--fk-gray-800)] mb-2">${KCarUtil.escapeHtml(car.title || t('car_title_fallback'))}</h2>
      <p class="text-3xl font-extrabold text-[var(--fk-navy)] mb-3">${car.price_display || KCarUtil.formatPrice(car.price)}</p>

      ${showTranslateBtn ? `<button type="button" id="translate-all-btn" class="btn-secondary !py-2 text-sm mb-5"><i class="fa-solid fa-language mr-1.5"></i>${t('translate_btn')}</button>` : ''}

      <div class="grid sm:grid-cols-2 gap-6 mb-6">
        <div class="bg-[var(--fk-gray-50)] rounded-2xl p-4 sm:p-5">
          <h3 class="text-sm font-bold text-[var(--fk-gray-800)] mb-2"><i class="fa-solid fa-list-check mr-1.5 text-[var(--fk-blue)]"></i>${t('spec_title')}</h3>
          <table class="spec-table">
            ${specRow(t('spec_year'), car.year_info)}
            ${specRow(t('spec_mileage'), car.mileage ? KCarUtil.formatMileage(car.mileage) : null)}
            ${specRow(t('spec_fuel'), car.fuel_type)}
            ${specRow(t('spec_transmission'), car.transmission)}
            ${specRow(t('spec_displacement'), car.displacement)}
            ${specRow(t('spec_color'), car.color)}
            ${specRow(t('spec_seat_color'), car.seat_color)}
            ${specRow(t('spec_region'), car.region)}
          </table>
        </div>
        <div class="bg-[var(--fk-gray-50)] rounded-2xl p-4 sm:p-5">
          <h3 class="text-sm font-bold text-[var(--fk-gray-800)] mb-2"><i class="fa-solid fa-shield-halved mr-1.5 text-[var(--fk-blue)]"></i>${t('diag_title')}</h3>
          <p class="text-sm text-[var(--fk-gray-800)] leading-relaxed mb-3">${KCarUtil.escapeHtml(car.accident_info || t('no_accident_info'))}</p>
          ${car.diagnosis_summary ? `<p class="text-xs text-[var(--fk-gray-600)] leading-relaxed border-t border-[var(--fk-gray-200)] pt-3">${KCarUtil.escapeHtml(car.diagnosis_summary)}</p>` : ''}
        </div>
      </div>

      ${panelDiagnosisHtml(car.panel_diagnosis, t)}

      <div class="mb-6">
        <h3 class="text-sm font-bold text-[var(--fk-gray-800)] mb-3"><i class="fa-solid fa-star mr-1.5 text-[var(--fk-blue)]"></i>${t('options_title')}</h3>
        <div class="flex flex-wrap gap-2">${optionTagsHtml(car.options)}</div>
      </div>

      ${(() => {
        const lang = KCarI18n.getLang();
        const descText = lang === 'ko' ? car.description_ko : car['description_' + lang];
        if (!descText) return '';
        return `<div class="mb-6 bg-[var(--fk-gray-50)] border border-[var(--fk-gray-200)] rounded-2xl p-4 sm:p-5">
          <h3 class="text-sm font-bold text-[var(--fk-gray-800)] mb-3"><i class="fa-solid fa-align-left mr-1.5 text-[var(--fk-blue)]"></i>${t('desc_title')}</h3>
          <p class="text-sm text-[var(--fk-gray-800)] leading-relaxed whitespace-pre-line">${KCarUtil.escapeHtml(descText)}</p>
        </div>`;
      })()}

      ${car.memo ? `<div class="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-4">
        <h3 class="text-sm font-bold text-amber-800 mb-1"><i class="fa-solid fa-note-sticky mr-1.5"></i>${t('memo_title')}</h3>
        <p class="text-sm text-amber-900">${KCarUtil.escapeHtml(car.memo)}</p>
      </div>` : ''}

      <div class="flex gap-3">
        ${car.source_url ? `<a href="${car.source_url}" target="_blank" rel="noopener" class="btn-primary flex-1 text-center">
          <i class="fa-solid fa-arrow-up-right-from-square mr-2"></i>${t('original_listing_btn')}
        </a>` : ''}
      </div>
    `;
  }

  const translationCache = new Map();

  async function translateCarFields(car) {
    const lang = KCarI18n.getLang();
    const cacheKey = `${car.id}_${lang}`;
    if (translationCache.has(cacheKey)) return translationCache.get(cacheKey);
    if (lang === 'ko') return car;

    const descField = 'description_' + lang;
    const keys = [];
    const texts = [];
    const push = (key, val) => {
      if (val) { keys.push(key); texts.push(String(val).replace(/\n/g, ' ')); }
    };

    // 연식/지역처럼 압축된 한글 표기(예: "23년형", "경기")는 기계번역이 엉뚱하게 옮기는 경우가 많아 제외한다.
    push('accident_info', car.accident_info);
    push('diagnosis_summary', car.diagnosis_summary);
    push('color', car.color);
    push('seat_color', car.seat_color);
    push('fuel_type', car.fuel_type);
    push('transmission', car.transmission);
    push('memo', car.memo);
    if (!car[descField] && car.description_ko) push('description_ko_translated', car.description_ko);

    const pd = car.panel_diagnosis;
    if (pd) {
      push('pd_headline', pd.headline);
      push('pd_frame_status', pd.frame_status);
      push('pd_exterior_status', pd.exterior_status);
      (pd.exterior_panels || []).forEach((p, i) => { push(`pd_ext_l_${i}`, p.label); push(`pd_ext_s_${i}`, p.status); });
      (pd.frame_groups || []).forEach((p, i) => { push(`pd_frm_l_${i}`, p.label); push(`pd_frm_s_${i}`, p.status); });
    }
    (car.options || []).forEach((o, i) => push(`opt_${i}`, o));

    const translated = JSON.parse(JSON.stringify(car));
    translated._translated = true;

    if (translated.panel_diagnosis) {
      translated.panel_diagnosis._frameIsNormal = translated.panel_diagnosis.frame_status === '정상';
      translated.panel_diagnosis._exteriorIsNormal = translated.panel_diagnosis.exterior_status === '정상';
      (translated.panel_diagnosis.exterior_panels || []).forEach((p) => { p._isNormal = p.status === '정상'; });
      (translated.panel_diagnosis.frame_groups || []).forEach((p) => { p._isNormal = p.status === '정상'; });
    }

    if (texts.length === 0) {
      translationCache.set(cacheKey, translated);
      return translated;
    }

    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ko&tl=${lang}&dt=t&q=${encodeURIComponent(texts.join('\n'))}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('번역 요청에 실패했습니다.');
    const data = await res.json();
    const parts = (data[0] || []).map((seg) => seg[0]).join('').split('\n');

    const map = {};
    keys.forEach((k, i) => { map[k] = parts[i] !== undefined ? parts[i] : texts[i]; });

    ['accident_info', 'diagnosis_summary', 'color', 'seat_color', 'fuel_type', 'transmission', 'memo'].forEach((f) => {
      if (map[f]) translated[f] = map[f];
    });
    if (map.description_ko_translated) translated[descField] = map.description_ko_translated;

    if (translated.panel_diagnosis) {
      if (map.pd_headline) translated.panel_diagnosis.headline = map.pd_headline;
      if (map.pd_frame_status) translated.panel_diagnosis.frame_status = map.pd_frame_status;
      if (map.pd_exterior_status) translated.panel_diagnosis.exterior_status = map.pd_exterior_status;
      (translated.panel_diagnosis.exterior_panels || []).forEach((p, i) => {
        if (map[`pd_ext_l_${i}`]) p.label = map[`pd_ext_l_${i}`];
        if (map[`pd_ext_s_${i}`]) p.status = map[`pd_ext_s_${i}`];
      });
      (translated.panel_diagnosis.frame_groups || []).forEach((p, i) => {
        if (map[`pd_frm_l_${i}`]) p.label = map[`pd_frm_l_${i}`];
        if (map[`pd_frm_s_${i}`]) p.status = map[`pd_frm_s_${i}`];
      });
    }
    if (Array.isArray(translated.options)) {
      translated.options = translated.options.map((o, i) => map[`opt_${i}`] || o);
    }

    translationCache.set(cacheKey, translated);
    return translated;
  }

  function openDetailModal(car, { pushState = true } = {}) {
    const t = KCarI18n.t;
    if (pushState) {
      history.pushState({ carId: car.id }, '', `/car/${car.id}`);
    }
    document.title = `${car.title || 'FROM K CAR'} — FROM K CAR`;
    currentModalCar = car;
    currentModalImages = Array.isArray(car.images) && car.images.length ? car.images : [car.main_image].filter(Boolean);
    currentModalIndex = 0;

    const body = document.getElementById('modal-body');
    body.innerHTML = `
      <div class="gallery-main" id="gallery-main-wrap">
        <img id="gallery-main-img" src="${currentModalImages[0] || ''}" alt="${KCarUtil.escapeHtml(car.title)}"
             onerror="this.src='https://via.placeholder.com/800x500?text=No+Image'">
        ${currentModalImages.length > 1 ? `
          <button class="gallery-nav-btn" style="left:12px" id="gallery-prev"><i class="fa-solid fa-chevron-left"></i></button>
          <button class="gallery-nav-btn" style="right:12px" id="gallery-next"><i class="fa-solid fa-chevron-right"></i></button>
        ` : ''}
        <div class="gallery-counter" id="gallery-counter">1 / ${currentModalImages.length || 1}</div>
      </div>
      <div class="p-5 sm:p-7">
        ${currentModalImages.length > 1 ? `<div class="thumb-strip mb-3" id="thumb-strip">
          ${currentModalImages.map((img, i) => `<img src="${img}" data-idx="${i}" class="${i === 0 ? 'active' : ''}" onerror="this.style.display='none'">`).join('')}
        </div>` : ''}

        <div id="car-info-panel">${buildCarInfoHtml(car, t)}</div>
      </div>
    `;

    const modalEl = document.getElementById('detail-modal');
    modalEl.classList.remove('hidden');
    modalEl.classList.add('flex');
    document.body.style.overflow = 'hidden';

    if (currentModalImages.length > 1) {
      document.getElementById('gallery-prev').addEventListener('click', () => shiftGalleryImage(-1));
      document.getElementById('gallery-next').addEventListener('click', () => shiftGalleryImage(1));
      document.querySelectorAll('#thumb-strip img').forEach(img => {
        img.addEventListener('click', () => setGalleryImage(parseInt(img.dataset.idx, 10)));
      });
    }
  }

  function setGalleryImage(idx) {
    if (!currentModalImages.length) return;
    currentModalIndex = (idx + currentModalImages.length) % currentModalImages.length;
    document.getElementById('gallery-main-img').src = currentModalImages[currentModalIndex];
    document.getElementById('gallery-counter').textContent = `${currentModalIndex + 1} / ${currentModalImages.length}`;
    document.querySelectorAll('#thumb-strip img').forEach((img, i) => img.classList.toggle('active', i === currentModalIndex));
  }
  function shiftGalleryImage(delta) { setGalleryImage(currentModalIndex + delta); }

  function closeModal({ pushState = true } = {}) {
    const modalEl = document.getElementById('detail-modal');
    modalEl.classList.add('hidden');
    modalEl.classList.remove('flex');
    document.body.style.overflow = '';
    document.title = HOME_TITLE;
    if (pushState && getCarIdFromUrl()) {
      history.pushState({}, '', '/');
    }
  }

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('detail-modal').addEventListener('click', (e) => {
    if (e.target.id === 'detail-modal') closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
    if (document.getElementById('detail-modal').classList.contains('hidden')) return;
    if (e.key === 'ArrowLeft') shiftGalleryImage(-1);
    if (e.key === 'ArrowRight') shiftGalleryImage(1);
  });

  document.getElementById('detail-modal').addEventListener('click', async (e) => {
    const btn = e.target.closest('#translate-all-btn');
    if (!btn || !currentModalCar) return;
    btn.disabled = true;
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i>Перевод...';
    try {
      const translated = await translateCarFields(currentModalCar);
      currentModalCar = translated;
      document.getElementById('car-info-panel').innerHTML = buildCarInfoHtml(translated, KCarI18n.t);
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
      KCarUtil.toast('번역에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error');
    }
  });

  gridEl.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-action="open-detail"]');
    if (!trigger) return;
    e.preventDefault();
    const id = trigger.dataset.id;
    const car = allCars.find(c => c.id === id);
    if (car) openDetailModal(car);
  });

  window.addEventListener('popstate', () => {
    const id = getCarIdFromUrl();
    const car = id ? allCars.find(c => c.id === id) : null;
    if (car) {
      openDetailModal(car, { pushState: false });
    } else {
      closeModal({ pushState: false });
    }
  });

  searchInput.addEventListener('input', KCarUtil.debounce(applyFiltersAndRender, 250));
  brandFilter.addEventListener('change', applyFiltersAndRender);
  fuelFilter.addEventListener('change', applyFiltersAndRender);
  sortSelect.addEventListener('change', applyFiltersAndRender);
  window.addEventListener('resize', KCarUtil.debounce(applyFiltersAndRender, 200));

  document.querySelectorAll('.view-toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => setViewMode(btn.dataset.view));
  });
  updateViewToggleUI();

  document.addEventListener('langchange', () => {
    populateFilterOptions(allCars);
    renderHeroBrandStats(allCars);
    applyFiltersAndRender();
    const openCarId = getCarIdFromUrl();
    const openCar = openCarId ? allCars.find(c => c.id === openCarId) : null;
    if (openCar) openDetailModal(openCar, { pushState: false });
  });

  loadCars();
})();
