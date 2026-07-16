/**
 * FROM K CAR — 메인 갤러리 페이지 로직
 */
(function () {
  let allCars = [];
  let currentModalImages = [];
  let currentModalIndex = 0;

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
      '판매중': `<span class="badge badge-green"><i class="fa-solid fa-circle text-[8px]"></i>${t('status_selling')}</span>`,
      '판매완료': `<span class="badge badge-gray"><i class="fa-solid fa-circle text-[8px]"></i>${t('status_sold')}</span>`,
      '확인필요': `<span class="badge badge-red"><i class="fa-solid fa-circle text-[8px]"></i>${t('status_check')}</span>`
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
          <button class="btn-secondary flex-1 !py-2 text-sm" data-action="open-detail" data-id="${car.id}">
            <i class="fa-solid fa-circle-info mr-1.5"></i>${t('detail_btn')}
          </button>
          ${car.source_url ? `<a href="${car.source_url}" target="_blank" rel="noopener" class="btn-secondary !py-2 !px-3 text-sm" title="${t('original_listing_title')}"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ''}
        </div>
      </div>
    </article>`;
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
    gridEl.innerHTML = filtered.map(carCardHtml).join('');
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

  function openDetailModal(car) {
    const t = KCarI18n.t;
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

        <div class="flex flex-wrap items-center gap-2 mt-5 mb-2">
          <span class="badge badge-blue">${KCarUtil.escapeHtml(effectiveBrand(car) || t('brand_fallback'))}</span>
          ${statusBadge(car.status)}
          ${car.car_number ? `<span class="badge badge-gray">${KCarUtil.escapeHtml(car.car_number)}</span>` : ''}
        </div>
        <h2 class="text-2xl font-extrabold text-[var(--fk-gray-800)] mb-2">${KCarUtil.escapeHtml(car.title || t('car_title_fallback'))}</h2>
        <p class="text-3xl font-extrabold text-[var(--fk-navy)] mb-5">${car.price_display || KCarUtil.formatPrice(car.price)}</p>

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

        <div class="mb-6">
          <h3 class="text-sm font-bold text-[var(--fk-gray-800)] mb-3"><i class="fa-solid fa-star mr-1.5 text-[var(--fk-blue)]"></i>${t('options_title')}</h3>
          <div class="flex flex-wrap gap-2">${optionTagsHtml(car.options)}</div>
        </div>

        ${(car.description_ko || car.description_ru) ? `<div class="mb-6 bg-[var(--fk-gray-50)] border border-[var(--fk-gray-200)] rounded-2xl p-4 sm:p-5">
          <h3 class="text-sm font-bold text-[var(--fk-gray-800)] mb-3"><i class="fa-solid fa-align-left mr-1.5 text-[var(--fk-blue)]"></i>${t('desc_title')}</h3>
          ${car.description_ko ? `<p class="text-sm text-[var(--fk-gray-800)] leading-relaxed whitespace-pre-line mb-3">${KCarUtil.escapeHtml(car.description_ko)}</p>` : ''}
          ${car.description_ru ? `<div class="border-t border-[var(--fk-gray-200)] pt-3">
            <p class="text-[11px] font-semibold text-[var(--fk-blue)] uppercase tracking-wide mb-1.5"><i class="fa-solid fa-globe mr-1"></i>На русском</p>
            <p class="text-sm text-[var(--fk-gray-600)] italic leading-relaxed whitespace-pre-line">${KCarUtil.escapeHtml(car.description_ru)}</p>
          </div>` : ''}
        </div>` : ''}

        ${car.memo ? `<div class="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <h3 class="text-sm font-bold text-amber-800 mb-1"><i class="fa-solid fa-note-sticky mr-1.5"></i>${t('memo_title')}</h3>
          <p class="text-sm text-amber-900">${KCarUtil.escapeHtml(car.memo)}</p>
        </div>` : ''}

        <div class="flex gap-3">
          ${car.source_url ? `<a href="${car.source_url}" target="_blank" rel="noopener" class="btn-primary flex-1 text-center">
            <i class="fa-solid fa-arrow-up-right-from-square mr-2"></i>${t('original_listing_btn')}
          </a>` : ''}
        </div>
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

  function closeModal() {
    const modalEl = document.getElementById('detail-modal');
    modalEl.classList.add('hidden');
    modalEl.classList.remove('flex');
    document.body.style.overflow = '';
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

  gridEl.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-action="open-detail"]');
    if (!trigger) return;
    const id = trigger.dataset.id;
    const car = allCars.find(c => c.id === id);
    if (car) openDetailModal(car);
  });

  searchInput.addEventListener('input', KCarUtil.debounce(applyFiltersAndRender, 250));
  brandFilter.addEventListener('change', applyFiltersAndRender);
  fuelFilter.addEventListener('change', applyFiltersAndRender);
  sortSelect.addEventListener('change', applyFiltersAndRender);

  /* ---------------- ADMIN 드롭다운 메뉴 ---------------- */
  const adminMenuBtn = document.getElementById('admin-menu-btn');
  const adminMenuDropdown = document.getElementById('admin-menu-dropdown');
  const adminMenuChevron = document.getElementById('admin-menu-chevron');
  if (adminMenuBtn && adminMenuDropdown) {
    adminMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = adminMenuDropdown.classList.contains('hidden');
      adminMenuDropdown.classList.toggle('hidden', !isHidden);
      adminMenuChevron.classList.toggle('rotate-180', isHidden);
    });
    document.addEventListener('click', (e) => {
      if (!document.getElementById('admin-menu-wrap').contains(e.target)) {
        adminMenuDropdown.classList.add('hidden');
        adminMenuChevron.classList.remove('rotate-180');
      }
    });
  }

  document.addEventListener('langchange', () => {
    populateFilterOptions(allCars);
    renderHeroBrandStats(allCars);
    applyFiltersAndRender();
  });

  loadCars();
})();
