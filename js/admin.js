/**
 * FROM K CAR — 관리자 페이지 로직
 * URL 자동수집 -> 미리보기/수정 -> 등록, 목록관리(수정/삭제)
 */
(function () {
  let adminCars = [];
  let currentExtractedImages = [];
  let editingId = null; // null이면 신규 등록

  const fetchForm = document.getElementById('fetch-form');
  const urlInput = document.getElementById('url-input');
  const fetchStatus = document.getElementById('fetch-status');
  const fetchBtn = document.getElementById('fetch-btn');
  const previewSection = document.getElementById('preview-section');
  const carForm = document.getElementById('car-form');
  const submitBtnText = document.getElementById('submit-btn-text');
  const cancelEditBtn = document.getElementById('cancel-edit-btn');
  const manualAddBtn = document.getElementById('manual-add-btn');

  /* ---------------- STEP 1: URL 자동수집 ---------------- */
  fetchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = urlInput.value.trim();
    if (!url) return;

    fetchStatus.classList.remove('hidden');
    fetchStatus.classList.add('flex');
    fetchBtn.disabled = true;
    fetchBtn.style.opacity = '0.6';

    try {
      const data = await KCarParser.fetchAndParse(url);
      editingId = null;
      fillFormFromData(data);
      submitBtnText.textContent = '매물 등록하기';
      previewSection.classList.remove('hidden');
      previewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      KCarUtil.toast('매물 정보를 성공적으로 가져왔어요. 내용을 확인하고 등록해주세요.', 'success');
    } catch (err) {
      KCarUtil.toast(err.message || '매물 정보를 가져오지 못했습니다.', 'error', 5000);
    } finally {
      fetchStatus.classList.add('hidden');
      fetchStatus.classList.remove('flex');
      fetchBtn.disabled = false;
      fetchBtn.style.opacity = '1';
    }
  });

  /* ---------------- 폼 채우기 / 읽기 ---------------- */
  function fillFormFromData(data) {
    document.getElementById('f-id').value = data.id || '';
    document.getElementById('f-source-url').value = data.source_url || '';
    document.getElementById('f-source-url-display').value = data.source_url || '';
    document.getElementById('f-car-seq').value = data.car_seq || '';
    document.getElementById('f-title').value = data.title || '';
    document.getElementById('f-brand').value = data.brand || '';
    document.getElementById('f-car-number').value = data.car_number || '';
    document.getElementById('f-price').value = data.price ?? '';
    document.getElementById('f-price-display').value = data.price_display || '';
    document.getElementById('f-year').value = data.year_info || '';
    document.getElementById('f-mileage').value = data.mileage ?? '';
    document.getElementById('f-fuel').value = data.fuel_type || '';
    document.getElementById('f-transmission').value = data.transmission || '';
    document.getElementById('f-displacement').value = data.displacement || '';
    document.getElementById('f-region').value = data.region || '';
    document.getElementById('f-color').value = data.color || '';
    document.getElementById('f-seat-color').value = data.seat_color || '';
    document.getElementById('f-accident').value = data.accident_info || '';
    document.getElementById('f-diagnosis').value = data.diagnosis_summary || '';
    document.getElementById('f-description-ko').value = data.description_ko || '';
    document.getElementById('f-description-ru').value = data.description_ru || '';
    document.getElementById('f-options').value = Array.isArray(data.options) ? data.options.join(', ') : (data.options || '');
    document.getElementById('f-memo').value = data.memo || '';
    document.getElementById('f-status').value = data.status || '판매중';

    currentExtractedImages = Array.isArray(data.images) ? data.images : (data.main_image ? [data.main_image] : []);
    document.getElementById('f-images').value = JSON.stringify(currentExtractedImages);
    document.getElementById('f-main-image').value = data.main_image || currentExtractedImages[0] || '';
    document.getElementById('f-panel-diagnosis').value = data.panel_diagnosis ? JSON.stringify(data.panel_diagnosis) : '';

    renderPreviewImages();
  }

  function renderPreviewImages() {
    const mainImg = document.getElementById('f-main-image').value;
    document.getElementById('preview-main-img').src = mainImg || 'https://via.placeholder.com/480x360?text=No+Image';
    document.getElementById('preview-image-count').textContent = `이미지 ${currentExtractedImages.length}장 확보`;
    const thumbs = document.getElementById('preview-thumbs');
    thumbs.innerHTML = currentExtractedImages.slice(0, 20).map((img, i) => `
      <img src="${img}" data-idx="${i}" class="w-14 h-14 rounded-lg object-cover cursor-pointer flex-shrink-0 border-2 ${img === mainImg ? 'border-[var(--fk-blue)]' : 'border-transparent'}"
           onerror="this.style.display='none'">
    `).join('');
    thumbs.querySelectorAll('img').forEach(img => {
      img.addEventListener('click', () => {
        document.getElementById('f-main-image').value = img.src;
        renderPreviewImages();
      });
    });
  }

  function readFormToData() {
    const optionsRaw = document.getElementById('f-options').value.trim();
    const options = optionsRaw ? optionsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
    let images = [];
    try { images = JSON.parse(document.getElementById('f-images').value || '[]'); } catch (e) { images = []; }
    let panelDiagnosis = null;
    try { panelDiagnosis = JSON.parse(document.getElementById('f-panel-diagnosis').value || 'null'); } catch (e) { panelDiagnosis = null; }

    return {
      source_url: document.getElementById('f-source-url').value || '',
      car_seq: document.getElementById('f-car-seq').value || '',
      title: document.getElementById('f-title').value.trim(),
      brand: document.getElementById('f-brand').value.trim(),
      car_number: document.getElementById('f-car-number').value.trim(),
      price: document.getElementById('f-price').value ? Number(document.getElementById('f-price').value) : null,
      price_display: document.getElementById('f-price-display').value.trim(),
      year_info: document.getElementById('f-year').value.trim(),
      mileage: document.getElementById('f-mileage').value ? Number(document.getElementById('f-mileage').value) : null,
      fuel_type: document.getElementById('f-fuel').value.trim(),
      transmission: document.getElementById('f-transmission').value.trim(),
      displacement: document.getElementById('f-displacement').value.trim(),
      region: document.getElementById('f-region').value.trim(),
      color: document.getElementById('f-color').value.trim(),
      seat_color: document.getElementById('f-seat-color').value.trim(),
      accident_info: document.getElementById('f-accident').value.trim(),
      diagnosis_summary: document.getElementById('f-diagnosis').value.trim(),
      description_ko: document.getElementById('f-description-ko').value.trim(),
      description_ru: document.getElementById('f-description-ru').value.trim(),
      options: options,
      memo: document.getElementById('f-memo').value.trim(),
      status: document.getElementById('f-status').value,
      main_image: document.getElementById('f-main-image').value || (images[0] || ''),
      images: images,
      panel_diagnosis: panelDiagnosis
    };
  }

  /* ---------------- STEP 2: 등록/수정 제출 ---------------- */
  carForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = readFormToData();
    if (!data.title) {
      KCarUtil.toast('차량명을 입력해주세요.', 'error');
      return;
    }
    try {
      if (editingId) {
        await KCarAPI.updateCar(editingId, data);
        KCarUtil.toast('매물 정보를 수정했습니다.', 'success');
      } else {
        await KCarAPI.createCar(data);
        KCarUtil.toast('새 매물을 등록했습니다.', 'success');
      }
      resetForm();
      loadAdminList();
    } catch (err) {
      KCarUtil.toast(err.message || '저장 중 오류가 발생했습니다.', 'error');
    }
  });

  function resetForm() {
    carForm.reset();
    editingId = null;
    currentExtractedImages = [];
    urlInput.value = '';
    previewSection.classList.add('hidden');
    submitBtnText.textContent = '매물 등록하기';
  }

  cancelEditBtn.addEventListener('click', resetForm);

  manualAddBtn.addEventListener('click', () => {
    resetForm();
    fillFormFromData({});
    previewSection.classList.remove('hidden');
    previewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /* ---------------- STEP 3: 목록 관리 ---------------- */
  function fmtDate(ts) {
    if (!ts) return '-';
    const d = new Date(ts);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  }

  function statusPill(status) {
    const map = {
      '판매중': '<span class="badge badge-green">판매중</span>',
      '판매완료': '<span class="badge badge-gray">판매완료</span>',
      '확인필요': '<span class="badge badge-red">확인필요</span>'
    };
    return map[status] || map['판매중'];
  }

  function renderAdminTable() {
    const tbody = document.getElementById('admin-table-body');
    document.getElementById('admin-total-count').textContent = adminCars.length;
    if (adminCars.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-[var(--fk-gray-600)]">등록된 매물이 없습니다.</td></tr>`;
      return;
    }
    const sorted = [...adminCars].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    tbody.innerHTML = sorted.map(car => `
      <tr class="border-b border-[var(--fk-gray-100)]">
        <td class="py-3 pr-3">
          <img src="${car.main_image || (car.images && car.images[0]) || 'https://via.placeholder.com/80x60?text=No+Img'}"
               class="w-16 h-12 object-cover rounded-lg" onerror="this.src='https://via.placeholder.com/80x60?text=No+Img'">
        </td>
        <td class="py-3 pr-3 max-w-[220px]">
          <p class="font-semibold text-[var(--fk-gray-800)] line-clamp-2">${KCarUtil.escapeHtml(car.title || '-')}</p>
          <p class="text-xs text-[var(--fk-gray-600)]">${KCarUtil.escapeHtml(car.car_number || '')}</p>
        </td>
        <td class="py-3 pr-3 font-bold text-[var(--fk-navy)] whitespace-nowrap">${car.price_display || KCarUtil.formatPrice(car.price)}</td>
        <td class="py-3 pr-3 whitespace-nowrap text-xs text-[var(--fk-gray-600)]">
          ${KCarUtil.escapeHtml(car.year_info || '-')}<br>${KCarUtil.formatMileage(car.mileage)}
        </td>
        <td class="py-3 pr-3">${statusPill(car.status)}</td>
        <td class="py-3 pr-3 whitespace-nowrap text-xs text-[var(--fk-gray-600)]">${fmtDate(car.created_at)}</td>
        <td class="py-3 pr-3 text-right whitespace-nowrap">
          <button class="btn-secondary !py-1.5 !px-3 text-xs mr-1.5" data-action="edit" data-id="${car.id}"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-danger !py-1.5 !px-3 text-xs" data-action="delete" data-id="${car.id}"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>
    `).join('');
  }

  document.getElementById('admin-table-body').addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-action="edit"]');
    const delBtn = e.target.closest('[data-action="delete"]');
    if (editBtn) {
      const car = adminCars.find(c => c.id === editBtn.dataset.id);
      if (!car) return;
      editingId = car.id;
      fillFormFromData(car);
      submitBtnText.textContent = '수정 내용 저장';
      previewSection.classList.remove('hidden');
      previewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (delBtn) {
      const car = adminCars.find(c => c.id === delBtn.dataset.id);
      if (!car) return;
      if (!confirm(`"${car.title || '이 매물'}"을 삭제할까요?`)) return;
      try {
        await KCarAPI.deleteCar(car.id);
        KCarUtil.toast('매물을 삭제했습니다.', 'success');
        loadAdminList();
      } catch (err) {
        KCarUtil.toast('삭제 중 오류가 발생했습니다.', 'error');
      }
    }
  });

  async function loadAdminList() {
    try {
      const res = await KCarAPI.listCars({ limit: 200 });
      adminCars = (res.data || []).filter(c => !c.deleted);
      renderAdminTable();
    } catch (e) {
      document.getElementById('admin-table-body').innerHTML =
        `<tr><td colspan="7" class="text-center py-10 text-[var(--fk-red)]">목록을 불러오지 못했습니다.</td></tr>`;
    }
  }

  loadAdminList();
})();
