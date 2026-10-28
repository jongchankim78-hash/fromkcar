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
      pasteTargetId = null;
      showPastePanel('자동으로 가져오지 못했어요. 아래 방법으로 KB차차차 페이지 내용을 붙여넣으면 같은 정보를 채울 수 있어요.');
    } finally {
      fetchStatus.classList.add('hidden');
      fetchStatus.classList.remove('flex');
      fetchBtn.disabled = false;
      fetchBtn.style.opacity = '1';
    }
  });

  /* ---------------- KB차차차 페이지 소스 붙여넣기 ----------------
   * KB차차차가 서버(데이터센터) IP의 자동 접근을 막고 있어서, 서버가 직접 가져오지 못할 때의 대안이다.
   * 관리자가 자기 브라우저로 연 매물 페이지의 소스를 붙여넣으면 서버는 KB에 접속하지 않고 그 내용만 분석한다. */
  const pastePanel = document.getElementById('paste-panel');
  const pasteHtml = document.getElementById('paste-html');
  const pasteNote = document.getElementById('paste-note');
  const pasteParseBtn = document.getElementById('paste-parse-btn');
  let pasteTargetId = null; // "원본에서 다시 불러오기"가 실패해서 붙여넣기로 이어가는 매물 id

  function showPastePanel(note, url) {
    if (url) urlInput.value = url;
    pasteNote.textContent = note || '';
    pasteNote.classList.toggle('hidden', !note);
    pastePanel.open = true;
    pastePanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => pasteHtml.focus(), 400);
  }

  // 매물 수정 화면에서 쓰는 병합 규칙: 관리자가 직접 입력/관리하는 값은 원본 재수집으로 덮어쓰지 않고 유지한다.
  function applyRefetched(car, fresh) {
    const merged = {
      ...fresh,
      id: car.id,
      status: car.status,
      memo: car.memo,
      description_ko: car.description_ko,
      description_ru: car.description_ru,
      description_mn: car.description_mn,
      created_at: car.created_at,
      listing_no: car.listing_no,
      display_order: car.display_order,
      badge_no_accident: car.badge_no_accident,
      badge_no_paint: car.badge_no_paint,
      is_new_car: car.is_new_car,
      title_ko: car.title_ko
    };
    editingId = car.id;
    fillFormFromData(merged);
    submitBtnText.textContent = '수정 내용 저장';
    previewSection.classList.remove('hidden');
    previewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  pasteParseBtn.addEventListener('click', async () => {
    const html = pasteHtml.value;
    if (!html.trim()) {
      KCarUtil.toast('먼저 KB차차차 매물 페이지 내용을 붙여넣어 주세요.', 'error');
      return;
    }
    const target = pasteTargetId ? adminCars.find(c => c.id === pasteTargetId) : null;
    // 다시 불러오기 중이면 그 매물의 원본 주소로 검증해서, 엉뚱한 매물 페이지를 붙여넣어도 걸러낸다.
    const url = target ? target.source_url : urlInput.value.trim();

    pasteParseBtn.disabled = true;
    const original = pasteParseBtn.innerHTML;
    pasteParseBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>분석 중...';
    try {
      const data = await KCarParser.parsePastedHtml(url, html);
      if (target) {
        applyRefetched(target, data);
        KCarUtil.toast('붙여넣은 내용으로 최신 정보를 채웠어요. 확인하고 저장해주세요.', 'success');
      } else {
        editingId = null;
        fillFormFromData(data);
        submitBtnText.textContent = '매물 등록하기';
        previewSection.classList.remove('hidden');
        previewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        KCarUtil.toast('매물 정보를 성공적으로 가져왔어요. 내용을 확인하고 등록해주세요.', 'success');
      }
      pasteHtml.value = '';
      pasteTargetId = null;
      pasteNote.classList.add('hidden');
    } catch (err) {
      KCarUtil.toast(err.message || '붙여넣은 내용을 분석하지 못했습니다.', 'error', 6000);
    } finally {
      pasteParseBtn.disabled = false;
      pasteParseBtn.innerHTML = original;
    }
  });

  document.getElementById('paste-clear-btn').addEventListener('click', () => {
    pasteHtml.value = '';
    pasteTargetId = null;
    pasteNote.classList.add('hidden');
  });

  /* ---------------- 한글 -> 외국어 자동 번역 (초안) ---------------- */
  async function translateKoTo(text, targetLang) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ko&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('번역 요청에 실패했습니다.');
    const data = await res.json();
    return (data[0] || []).map((seg) => seg[0]).join('');
  }

  function wireTranslateBtn(btnId, targetFieldId, targetLang, successLabel) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const koText = document.getElementById('f-description-ko').value.trim();
      if (!koText) {
        KCarUtil.toast('먼저 매물 소개(한글)를 입력해주세요.', 'error');
        return;
      }
      btn.disabled = true;
      const originalHtml = btn.innerHTML;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>번역 중...';
      try {
        const translated = await translateKoTo(koText, targetLang);
        document.getElementById(targetFieldId).value = translated;
        KCarUtil.toast(`${successLabel}로 초안 번역했어요. 내용을 확인 후 저장해주세요.`, 'success');
      } catch (err) {
        KCarUtil.toast('자동 번역에 실패했습니다. 직접 입력해주세요.', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
      }
    });
  }

  wireTranslateBtn('translate-ru-btn', 'f-description-ru', 'ru', '러시아어');
  wireTranslateBtn('translate-mn-btn', 'f-description-mn', 'mn', '몽골어');

  /* ---------------- 폼 채우기 / 읽기 ---------------- */
  function fillFormFromData(data) {
    document.getElementById('f-id').value = data.id || '';
    document.getElementById('f-source-url').value = data.source_url || '';
    document.getElementById('f-source-url-display').value = data.source_url || '';
    document.getElementById('f-car-seq').value = data.car_seq || '';
    document.getElementById('f-title').value = data.title || '';
    document.getElementById('f-brand').value = data.brand || '';
    // 한글 차명: 저장된 값이 있으면 그것을, 없으면 영문 차명에서 자동으로 추정해 채운다 (직접 고치면 더 이상 덮어쓰지 않음)
    const titleKoEl = document.getElementById('f-title-ko');
    titleKoEl.value = data.title_ko || '';
    delete titleKoEl.dataset.manual;
    if (data.title_ko) titleKoEl.dataset.manual = '1';
    syncTitleKo();
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
    document.getElementById('f-description-mn').value = data.description_mn || '';
    document.getElementById('f-options').value = Array.isArray(data.options) ? data.options.join(', ') : (data.options || '');
    document.getElementById('f-memo').value = data.memo || '';
    document.getElementById('f-status').value = data.status || '판매중';

    document.getElementById('f-badge-no-accident').checked = data.badge_no_accident !== undefined && data.badge_no_accident !== null
      ? !!data.badge_no_accident
      : !!(data.accident_info && data.accident_info.startsWith('무사고'));
    document.getElementById('f-badge-no-paint').checked = !!data.badge_no_paint;
    document.getElementById('f-is-new-car').checked = !!data.is_new_car;

    document.getElementById('f-listing-no').value = data.listing_no || '';
    document.getElementById('f-listing-no-wrap').classList.toggle('hidden', !data.id);

    currentExtractedImages = Array.isArray(data.images) ? data.images : (data.main_image ? [data.main_image] : []);
    document.getElementById('f-images').value = JSON.stringify(currentExtractedImages);
    document.getElementById('f-main-image').value = data.main_image || currentExtractedImages[0] || '';
    document.getElementById('f-panel-diagnosis').value = data.panel_diagnosis ? JSON.stringify(data.panel_diagnosis) : '';

    renderPreviewImages();
  }

  // 차량명/브랜드를 고칠 때마다 한글 차명을 다시 추정해 채운다. 관리자가 직접 입력한 경우는 건드리지 않는다.
  function syncTitleKo() {
    const el = document.getElementById('f-title-ko');
    const hint = document.getElementById('f-title-ko-hint');
    const guessed = KCarKo.guess({
      title: document.getElementById('f-title').value,
      brand: document.getElementById('f-brand').value
    });
    if (!el.dataset.manual) el.value = guessed.known ? guessed.full : '';
    if (!el.value && document.getElementById('f-title').value) {
      hint.textContent = '한글 모델명을 찾지 못했어요. 직접 입력하면 블로그 글과 사이트 검색에 쓰입니다. (예: 기아 쏘렌토)';
      hint.style.color = '#b45309';
    } else {
      hint.textContent = el.dataset.manual ? '직접 입력한 이름을 사용합니다.' : (el.value ? '영문 차명에서 자동으로 찾았어요. 틀리면 고쳐 주세요.' : '');
      hint.style.color = '';
    }
  }
  ['f-title', 'f-brand'].forEach((id) => document.getElementById(id).addEventListener('input', syncTitleKo));
  document.getElementById('f-title-ko').addEventListener('input', (e) => {
    if (e.target.value.trim()) e.target.dataset.manual = '1';
    else delete e.target.dataset.manual;
    syncTitleKo();
  });

  function syncImagesField() {
    document.getElementById('f-images').value = JSON.stringify(currentExtractedImages);
  }

  // from 위치의 사진을 to 위치로 옮긴다 (사이 사진들은 한 칸씩 밀림). 대표 사진 지정은 그대로 유지된다.
  function moveImage(from, to) {
    if (from === to || from < 0 || to < 0 || from >= currentExtractedImages.length || to >= currentExtractedImages.length) return;
    const [item] = currentExtractedImages.splice(from, 1);
    currentExtractedImages.splice(to, 0, item);
    syncImagesField();
    renderPreviewImages();
  }

  function renderPreviewImages() {
    const mainImg = document.getElementById('f-main-image').value;
    document.getElementById('preview-main-img').src = mainImg || 'https://via.placeholder.com/480x360?text=No+Image';
    document.getElementById('preview-image-count').textContent = `이미지 ${currentExtractedImages.length}장 확보`;
    const thumbs = document.getElementById('preview-thumbs');
    const arrowCls = 'w-[14px] h-4 flex items-center justify-center text-white text-[9px] hover:bg-[var(--fk-blue)] disabled:opacity-30 disabled:hover:bg-transparent';
    thumbs.innerHTML = currentExtractedImages.map((img, i) => `
      <div class="relative flex-shrink-0 cursor-grab" data-idx="${i}" draggable="true">
        <img src="${img}" draggable="false" title="클릭하면 대표 사진으로 지정 · 끌어서 순서 변경" class="w-16 h-16 rounded-lg object-cover cursor-pointer border-2 ${img === mainImg ? 'border-[var(--fk-blue)]' : 'border-transparent'}"
             onerror="this.style.display='none'">
        <span class="absolute left-1 top-1 rounded bg-black/60 text-white text-[10px] font-bold px-1 leading-4 pointer-events-none">${i + 1}</span>
        ${img === mainImg ? '<span class="absolute left-1 bottom-1 rounded bg-[var(--fk-blue)] text-white text-[10px] font-bold px-1 leading-4 pointer-events-none">대표</span>' : ''}
        <span class="absolute right-1 bottom-1 flex rounded bg-black/60 overflow-hidden">
          <button type="button" data-action="move-left" title="앞으로" class="${arrowCls}" ${i === 0 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i></button>
          <button type="button" data-action="move-right" title="뒤로" class="${arrowCls}" ${i === currentExtractedImages.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-right"></i></button>
        </span>
        <button type="button" data-action="remove-image" class="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] leading-none flex items-center justify-center hover:bg-red-600">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    `).join('');
    thumbs.querySelectorAll('img').forEach((img, i) => {
      img.addEventListener('click', () => {
        document.getElementById('f-main-image').value = currentExtractedImages[i];
        renderPreviewImages();
      });
    });
    thumbs.querySelectorAll('[data-action="move-left"], [data-action="move-right"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.closest('[data-idx]').dataset.idx);
        moveImage(idx, btn.dataset.action === 'move-left' ? idx - 1 : idx + 1);
      });
    });
    // 끌어서 순서 변경 (PC). 휴대폰에서는 위의 ‹ › 버튼을 쓴다.
    let dragFrom = null;
    thumbs.querySelectorAll('[data-idx]').forEach((el) => {
      el.addEventListener('dragstart', (e) => {
        dragFrom = Number(el.dataset.idx);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(dragFrom));
        el.style.opacity = '.4';
      });
      el.addEventListener('dragend', () => { el.style.opacity = ''; });
      el.addEventListener('dragover', (e) => {
        if (dragFrom === null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        if (dragFrom === null) return;
        const to = Number(el.dataset.idx);
        const from = dragFrom;
        dragFrom = null;
        moveImage(from, to);
      });
    });
    thumbs.querySelectorAll('[data-action="remove-image"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.closest('[data-idx]').dataset.idx);
        const removed = currentExtractedImages[idx];
        currentExtractedImages.splice(idx, 1);
        syncImagesField();
        if (document.getElementById('f-main-image').value === removed) {
          document.getElementById('f-main-image').value = currentExtractedImages[0] || '';
        }
        renderPreviewImages();
      });
    });
  }

  /* ---------------- 사진 직접 업로드 ---------------- */
  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
      reader.readAsDataURL(file);
    });
  }

  async function uploadImageFile(file) {
    const dataUrl = await fileToDataUrl(file);
    const token = window.KCarAuth && KCarAuth.getToken();
    const res = await fetch('admin/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Basic ' + token } : {})
      },
      body: JSON.stringify({ dataUrl })
    });
    if (res.status === 401 && window.KCarAuth) {
      KCarAuth.clearToken();
      KCarAuth.showGate();
      throw new Error('인증이 만료되었습니다.');
    }
    if (!res.ok) throw new Error('업로드에 실패했습니다.');
    const data = await res.json();
    return data.url;
  }

  const imageUploadInput = document.getElementById('f-image-upload');
  const uploadStatus = document.getElementById('upload-status');
  if (imageUploadInput) {
    imageUploadInput.addEventListener('change', async () => {
      const files = [...imageUploadInput.files];
      if (files.length === 0) return;
      uploadStatus.classList.remove('hidden');
      let done = 0;
      for (const file of files) {
        uploadStatus.textContent = `업로드 중... (${done + 1}/${files.length})`;
        try {
          const url = await uploadImageFile(file);
          currentExtractedImages.push(url);
          syncImagesField();
          if (!document.getElementById('f-main-image').value) {
            document.getElementById('f-main-image').value = url;
          }
          renderPreviewImages();
        } catch (err) {
          KCarUtil.toast(err.message || '사진 업로드에 실패했습니다.', 'error');
        }
        done++;
      }
      uploadStatus.classList.add('hidden');
      imageUploadInput.value = '';
    });
  }

  function readFormToData() {
    const optionsRaw = document.getElementById('f-options').value.trim();
    // 쉼표로 나누되, "통풍시트 (운전석, 동승석)"처럼 괄호 안의 쉼표는 하나의 옵션으로 유지한다.
    const options = optionsRaw ? optionsRaw.split(/,(?![^()]*\))/).map(s => s.trim()).filter(Boolean) : [];
    let images = [];
    try { images = JSON.parse(document.getElementById('f-images').value || '[]'); } catch (e) { images = []; }
    let panelDiagnosis = null;
    try { panelDiagnosis = JSON.parse(document.getElementById('f-panel-diagnosis').value || 'null'); } catch (e) { panelDiagnosis = null; }

    return {
      source_url: document.getElementById('f-source-url').value || '',
      car_seq: document.getElementById('f-car-seq').value || '',
      title: document.getElementById('f-title').value.trim(),
      title_ko: document.getElementById('f-title-ko').value.trim(),
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
      description_mn: document.getElementById('f-description-mn').value.trim(),
      options: options,
      memo: document.getElementById('f-memo').value.trim(),
      status: document.getElementById('f-status').value,
      badge_no_accident: document.getElementById('f-badge-no-accident').checked,
      badge_no_paint: document.getElementById('f-badge-no-paint').checked,
      is_new_car: document.getElementById('f-is-new-car').checked,
      listing_no: document.getElementById('f-listing-no').value ? Number(document.getElementById('f-listing-no').value) : undefined,
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
    let created = null;
    try {
      if (editingId) {
        await KCarAPI.updateCar(editingId, data);
        KCarUtil.toast('매물 정보를 수정했습니다.', 'success');
      } else {
        created = await KCarAPI.createCar(data);
        KCarUtil.toast('새 매물을 등록했습니다.', 'success');
      }
      resetForm();
      loadAdminList();
      // 새로 등록했다면 네이버 블로그 소개글을 바로 만들어 보여준다.
      if (created) openBlogModal(created);
    } catch (err) {
      KCarUtil.toast(err.message || '저장 중 오류가 발생했습니다.', 'error');
    }
  });

  function resetForm() {
    carForm.reset();
    editingId = null;
    pasteTargetId = null;
    currentExtractedImages = [];
    urlInput.value = '';
    previewSection.classList.add('hidden');
    submitBtnText.textContent = '매물 등록하기';
    document.getElementById('f-listing-no-wrap').classList.add('hidden');
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

  function statusSelectHtml(car) {
    const bg = car.status === '판매완료' ? 'var(--fk-gray-600)' : 'var(--fk-green)';
    return `<select class="text-xs font-bold text-white rounded-full px-2.5 py-1 border-0 cursor-pointer" style="background:${bg};" data-action="quick-status" data-id="${car.id}">
      <option value="판매중" ${car.status === '판매완료' ? '' : 'selected'}>판매중</option>
      <option value="판매완료" ${car.status === '판매완료' ? 'selected' : ''}>판매완료</option>
    </select>`;
  }

  // 블로그 글을 올렸는지 한눈에 보이는 작은 표시. 누르면 작성 완료 ↔ 미작성으로 바뀐다.
  // 판매완료 매물은 아직 안 올렸어도 독촉하지 않는다.
  function blogChipHtml(car) {
    if (car.blog_posted) {
      return `<button type="button" data-action="toggle-blog-posted" data-id="${car.id}" title="눌러서 미작성으로 되돌리기" class="mt-1 text-[10px] font-bold rounded-full px-2 py-0.5 bg-green-100 text-green-800"><i class="fa-solid fa-check mr-0.5"></i>블로그 작성 완료</button>`;
    }
    if (car.status === '판매완료') return '';
    return `<button type="button" data-action="toggle-blog-posted" data-id="${car.id}" title="블로그에 올렸다면 눌러서 완료로 표시" class="mt-1 text-[10px] font-bold rounded-full px-2 py-0.5 bg-amber-100 text-amber-800"><i class="fa-regular fa-clock mr-0.5"></i>블로그 미작성</button>`;
  }

  function renderAdminTable() {
    const tbody = document.getElementById('admin-table-body');
    document.getElementById('admin-total-count').textContent = adminCars.length;
    const unposted = adminCars.filter(c => !c.blog_posted && c.status !== '판매완료').length;
    const unpostedEl = document.getElementById('blog-unposted-count');
    unpostedEl.textContent = `블로그 미작성 ${unposted}건`;
    unpostedEl.classList.toggle('hidden', unposted === 0);
    if (adminCars.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-[var(--fk-gray-600)]">등록된 매물이 없습니다.</td></tr>`;
      return;
    }
    const sorted = [...adminCars].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    tbody.innerHTML = sorted.map((car, i) => `
      <tr class="border-b border-[var(--fk-gray-100)]">
        <td class="py-3 pr-3">
          <button type="button" data-action="pick-thumb" data-id="${car.id}" title="대표(썸네일) 사진 변경" class="relative block rounded-lg overflow-hidden group">
            <img src="${car.main_image || (car.images && car.images[0]) || 'https://via.placeholder.com/80x60?text=No+Img'}"
                 class="w-16 h-12 object-cover" onerror="this.src='https://via.placeholder.com/80x60?text=No+Img'">
            <span class="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[10px] font-bold leading-4 text-center group-hover:bg-[var(--fk-blue)]"><i class="fa-solid fa-image mr-0.5"></i>변경</span>
          </button>
        </td>
        <td class="py-3 pr-3 max-w-[220px]">
          <p class="font-semibold text-[var(--fk-gray-800)] line-clamp-2">${KCarUtil.escapeHtml(car.title || '-')}</p>
          <p class="text-xs text-[var(--fk-gray-600)]">${car.listing_no ? `No.${car.listing_no} · ` : ''}${KCarUtil.escapeHtml(car.car_number || '')}</p>
          ${blogChipHtml(car)}
        </td>
        <td class="py-3 pr-3 font-bold text-[var(--fk-navy)] whitespace-nowrap">${car.price_display || KCarUtil.formatPrice(car.price)}</td>
        <td class="py-3 pr-3 whitespace-nowrap text-xs text-[var(--fk-gray-600)]">
          ${KCarUtil.escapeHtml(car.year_info || '-')}<br>${KCarUtil.formatMileage(car.mileage)}
        </td>
        <td class="py-3 pr-3">${statusSelectHtml(car)}</td>
        <td class="py-3 pr-3 whitespace-nowrap text-xs text-[var(--fk-gray-600)]">${fmtDate(car.created_at)}</td>
        <td class="py-3 pr-3 text-right whitespace-nowrap">
          <button class="btn-secondary !py-1.5 !px-2 text-xs" data-action="move-up" data-id="${car.id}" title="위로" ${i === 0 ? 'disabled style="opacity:.35;cursor:default;"' : ''}><i class="fa-solid fa-arrow-up"></i></button>
          <button class="btn-secondary !py-1.5 !px-2 text-xs mr-1.5" data-action="move-down" data-id="${car.id}" title="아래로" ${i === sorted.length - 1 ? 'disabled style="opacity:.35;cursor:default;"' : ''}><i class="fa-solid fa-arrow-down"></i></button>
          ${car.source_url ? `<button class="btn-secondary !py-1.5 !px-3 text-xs mr-1.5" data-action="refetch" data-id="${car.id}" title="원본에서 다시 불러오기"><i class="fa-solid fa-rotate"></i></button>` : ''}
          <button class="btn-secondary !py-1.5 !px-3 text-xs mr-1.5" data-action="blog" data-id="${car.id}" title="네이버 블로그 글 만들기"><i class="fa-solid fa-pen-nib" style="color:#03c75a"></i></button>
          <button class="btn-secondary !py-1.5 !px-3 text-xs mr-1.5" data-action="edit" data-id="${car.id}"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-danger !py-1.5 !px-3 text-xs" data-action="delete" data-id="${car.id}"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>
    `).join('');
  }

  /* ---------------- 홍보글 만들기 (네이버 블로그 · 인스타그램 · 당근 · 카카오) ---------------- */
  // 글 생성 규칙은 js/blog.js. 여기서는 모달 표시, 복사 버튼, "블로그 작성 완료" 표시만 다룬다.
  const blogModal = document.getElementById('blog-modal');
  const blogTitle = document.getElementById('blog-title');
  const blogPreview = document.getElementById('blog-preview');
  const blogTags = document.getElementById('blog-tags');
  const blogPhotos = document.getElementById('blog-photos');
  const topicListEl = document.getElementById('topic-list');
  const topicDoneBtn = document.getElementById('topic-mark-done');
  const shortText = document.getElementById('short-text');
  const blogCover = document.getElementById('blog-cover');
  const markPostedBtn = document.getElementById('blog-mark-posted');
  let blogMode = 'car'; // 'car'(매물 글) | 'topic'(정보성 글)
  let blogChannel = 'blog';
  let blogCar = null;
  let blogSeed = 0;

  // 정보성 글 주제: 추천 목록(우선순위순)과 "이미 쓴 주제" 기록. 기록은 서버에 저장해 다른 기기에서도 이어진다.
  let topicDone = {};
  let topicId = null;
  let topicSuggestions = [];

  function authHeader() {
    const token = window.KCarAuth && KCarAuth.getToken();
    return token ? { Authorization: 'Basic ' + token } : {};
  }

  async function loadTopicDone() {
    try {
      const res = await fetch('admin/blog-topics', { headers: authHeader() });
      if (res.ok) topicDone = (await res.json()).done || {};
    } catch (e) { /* 기록을 못 읽어도 주제 목록은 보여준다 */ }
  }

  // "새 주제 제안받기"로 받은 주제(이번에 연 동안 목록 맨 위에 둔다)와, 이미 제안한 주제 기록(브라우저에 저장)
  let proposedTopics = [];
  const SEEN_KEY = 'fkcar_topic_seen';
  function loadSeenTopics() {
    try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveSeenTopics(ids) {
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(-200))); } catch (e) { /* 저장 못 해도 동작에는 문제없음 */ }
  }

  const TOPIC_BADGES = {
    new: ['새 제안', 'bg-purple-100 text-purple-800'],
    season: ['이번 계절', 'bg-orange-100 text-orange-800'],
    recent: ['신규 입고', 'bg-red-100 text-red-700'],
    data: ['재고 기반', 'bg-blue-100 text-blue-800'],
    evergreen: ['상시 주제', 'bg-gray-100 text-gray-600']
  };

  function renderTopicList() {
    const now = Date.now();
    const proposed = proposedTopics.map((t) => {
      const at = topicDone[t.id] || 0;
      return { ...t, doneAt: at || null, daysAgo: at ? Math.floor((now - at) / 86400000) : null };
    });
    const proposedIds = new Set(proposed.map(t => t.id));
    topicSuggestions = [...proposed, ...KCarBlog.listTopics(adminCars, topicDone).filter(t => !proposedIds.has(t.id))];
    if (!topicSuggestions.find(t => t.id === topicId)) topicId = topicSuggestions[0] && topicSuggestions[0].id;
    topicListEl.innerHTML = topicSuggestions.map((t, i) => {
      const [badgeText, badgeCls] = TOPIC_BADGES[t.kind] || TOPIC_BADGES.evergreen;
      const doneMark = t.doneAt
        ? `<span class="topic-chip bg-green-100 text-green-800"><i class="fa-solid fa-check mr-0.5"></i>${t.daysAgo === 0 ? '오늘' : t.daysAgo + '일 전'} 작성</span>`
        : '';
      const rec = i < 3 && !t.doneAt ? '<span class="topic-chip bg-[#03c75a] text-white">추천</span>' : '';
      return `<button type="button" data-topic="${KCarUtil.escapeHtml(t.id)}" class="topic-item ${t.id === topicId ? 'active' : ''} ${t.doneAt && t.daysAgo < 45 ? 'done' : ''}">
        ${rec}<span class="topic-chip ${badgeCls}">${badgeText}</span><span class="min-w-0 flex-1">${KCarUtil.escapeHtml(t.label)}</span>${doneMark}
      </button>`;
    }).join('');
    updateTopicDoneButton();
  }

  function updateTopicDoneButton() {
    const done = !!topicDone[topicId];
    topicDoneBtn.querySelector('span').textContent = done ? '작성 완료 (눌러서 취소)' : '이 주제 작성 완료로 표시';
    topicDoneBtn.querySelector('i').className = done ? 'fa-solid fa-square-check mr-1.5 text-[var(--fk-green)]' : 'fa-regular fa-square-check mr-1.5';
  }

  function onSaleCars() {
    return adminCars.filter(c => c.status !== '판매완료');
  }

  // 현재 모드/채널에 맞는 요소만 보이게 한다.
  function applyBlogLayout() {
    const isCar = blogMode === 'car';
    blogModal.querySelectorAll('.car-only').forEach((el) => el.classList.toggle('hidden', !isCar));
    blogModal.querySelectorAll('.topic-only').forEach((el) => el.classList.toggle('hidden', isCar));
    const isBlog = blogChannel === 'blog';
    document.getElementById('blog-pane-blog').classList.toggle('hidden', !isBlog);
    document.getElementById('blog-pane-short').classList.toggle('hidden', isBlog);
    blogModal.querySelectorAll('[data-show]').forEach((el) => {
      el.classList.toggle('hidden', el.dataset.show !== (isBlog ? 'blog' : 'short'));
    });
    blogModal.querySelectorAll('#blog-channel-tabs .blog-pane-tab').forEach((b) => {
      b.classList.toggle('active', b.dataset.channel === blogChannel);
    });
  }

  function updateMarkPostedButton() {
    if (!blogCar) return;
    const posted = !!blogCar.blog_posted;
    markPostedBtn.querySelector('span').textContent = posted ? '블로그 작성 완료 (눌러서 취소)' : '블로그 작성 완료로 표시';
    markPostedBtn.querySelector('i').className = posted ? 'fa-solid fa-square-check mr-1.5 text-[var(--fk-green)]' : 'fa-regular fa-square-check mr-1.5';
  }

  async function renderCoverImage() {
    const note = document.getElementById('blog-cover-note');
    try {
      await KCarBlog.renderCover(blogCar, blogCover);
      note.textContent = '대표 사진 위에 뱃지·차량명·가격을 얹은 정사각형 이미지예요. 블로그 첫 사진이나 썸네일로 쓰세요.';
      blogCover.dataset.ready = '1';
    } catch (e) {
      delete blogCover.dataset.ready;
      blogCover.getContext('2d').clearRect(0, 0, blogCover.width, blogCover.height);
      note.textContent = `${e.message} 사진이 우리 서버에 저장되는 중일 수 있어요. 잠시 후 다시 열어 주세요.`;
    }
  }

  // 글을 만들거나 고칠 때마다 검색 노출 기준(제목·키워드·분량·링크 등)을 점검해 보여준다.
  function renderSeoPanel() {
    if (blogChannel !== 'blog') return;
    const checks = KCarBlog.seoCheck({
      mode: blogMode,
      car: blogCar,
      title: blogTitle.value,
      bodyText: blogPreview.innerText,
      tags: blogTags.value,
      photoCount: blogCar && Array.isArray(blogCar.images) ? blogCar.images.length : 0
    });
    const icon = { ok: ['fa-circle-check', '#16a34a'], warn: ['fa-triangle-exclamation', '#d97706'], bad: ['fa-circle-xmark', '#dc2626'] };
    document.getElementById('seo-list').innerHTML = checks.map((c) => `
      <li class="flex gap-2 items-start"><i class="fa-solid ${icon[c.level][0]} mt-0.5" style="color:${icon[c.level][1]}"></i>
        <span><b class="text-[var(--fk-gray-800)]">${KCarUtil.escapeHtml(c.label)}</b> <span class="text-[var(--fk-gray-600)]">${KCarUtil.escapeHtml(c.detail)}</span></span></li>`).join('');
    const ok = checks.filter(c => c.level === 'ok').length;
    const sum = document.getElementById('seo-summary');
    sum.textContent = `${ok}/${checks.length} 통과`;
    sum.style.color = ok === checks.length ? '#16a34a' : (checks.some(c => c.level === 'bad') ? '#dc2626' : '#d97706');
  }
  const seoDebounced = KCarUtil.debounce(renderSeoPanel, 300);

  function renderBlog() {
    if (blogMode === 'topic') {
      const post = KCarBlog.generateTopic(topicId, { seed: blogSeed, cars: onSaleCars() });
      blogTitle.value = post.title;
      blogPreview.innerHTML = post.html;
      blogTags.value = post.tags;
    } else if (blogChannel === 'blog') {
      if (!blogCar) return;
      const post = KCarBlog.generate(blogCar, { seed: blogSeed, photos: blogPhotos.checked, cars: adminCars });
      blogTitle.value = post.title;
      blogPreview.innerHTML = post.html;
      blogTags.value = post.tags;
    } else {
      if (!blogCar) return;
      const short = KCarBlog.generateShort(blogCar, blogChannel);
      shortText.value = short.text;
      document.getElementById('short-note').textContent = short.note;
      return;
    }
    const chars = blogPreview.innerText.replace(/\s+/g, '').length;
    document.getElementById('blog-length').textContent = `· 약 ${chars.toLocaleString('ko-KR')}자`;
    renderSeoPanel();
  }

  function showBlogModal() {
    blogModal.classList.remove('hidden');
    blogModal.classList.add('flex');
    blogPreview.scrollTop = 0;
  }

  async function openBlogModal(car) {
    blogMode = 'car';
    blogChannel = 'blog';
    blogCar = car;
    blogSeed = 0;
    blogPhotos.checked = false;
    delete blogPreview.dataset.edited;
    document.getElementById('blog-modal-heading').textContent = '홍보글 만들기';
    document.getElementById('blog-modal-sub').textContent = `${car.title || ''}${car.listing_no ? ` (No.${car.listing_no})` : ''}`;
    document.getElementById('blog-zip').href = `/car/${car.id}/images.zip`;
    applyBlogLayout();
    updateMarkPostedButton();
    renderBlog();
    showBlogModal();
    renderCoverImage();
    // 방금 등록한 매물은 사진이 서버에 저장되는 중일 수 있으니, 최신 정보로 한 번 더 만든다.
    try {
      const fresh = await KCarAPI.getCar(car.id);
      if (blogMode === 'car' && blogCar && blogCar.id === fresh.id) {
        blogCar = { ...blogCar, ...fresh };
        if (!blogPreview.dataset.edited) renderBlog();
        updateMarkPostedButton();
        renderCoverImage();
      }
    } catch (e) { /* 처음 받은 정보로 계속 */ }
  }

  async function openTopicModal() {
    blogMode = 'topic';
    blogChannel = 'blog';
    blogCar = null;
    blogSeed = 0;
    topicId = null;
    delete blogPreview.dataset.edited;
    document.getElementById('blog-modal-heading').textContent = '정보성 블로그 글';
    document.getElementById('blog-modal-sub').textContent = '지금 쓰기 좋은 주제를 추천해 드려요. 글 아래에 판매중인 매물 링크가 자동으로 들어갑니다.';
    applyBlogLayout();
    renderTopicList();
    renderBlog();
    showBlogModal();
    // 작성 기록을 불러온 뒤 추천 순서를 다시 매긴다 (이미 쓴 주제는 뒤로)
    await loadTopicDone();
    if (blogMode === 'topic' && !blogPreview.dataset.edited) {
      topicId = null;
      renderTopicList();
      renderBlog();
    }
  }

  function closeBlogModal() {
    blogModal.classList.add('hidden');
    blogModal.classList.remove('flex');
    blogCar = null;
    delete blogPreview.dataset.edited;
  }

  async function copyPlain(text, okMessage) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      if (!ok) { KCarUtil.toast('복사하지 못했습니다. 직접 선택해서 복사해 주세요.', 'error'); return; }
    }
    KCarUtil.toast(okMessage, 'success');
  }

  // 서식(굵은 글씨, 제목 크기, 링크)을 그대로 가져가도록 HTML 형태로 클립보드에 넣는다.
  async function copyRichBody() {
    const html = blogPreview.innerHTML;
    const text = blogPreview.innerText;
    try {
      if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' })
        })]);
      } else {
        const range = document.createRange();
        range.selectNodeContents(blogPreview);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        if (!document.execCommand('copy')) throw new Error('copy failed');
        sel.removeAllRanges();
      }
      KCarUtil.toast('본문을 복사했습니다. 네이버 블로그 본문에 붙여넣기(Ctrl+V) 하세요.', 'success', 4000);
    } catch (e) {
      KCarUtil.toast('복사하지 못했습니다. 본문을 직접 선택해서 복사해 주세요.', 'error');
    }
  }

  function confirmDiscardEdits() {
    return !blogPreview.dataset.edited || confirm('직접 고친 내용이 사라집니다. 다시 만들까요?');
  }

  document.getElementById('blog-close').addEventListener('click', closeBlogModal);
  blogModal.addEventListener('click', (e) => { if (e.target === blogModal) closeBlogModal(); });
  document.getElementById('blog-copy-title').addEventListener('click', () => copyPlain(blogTitle.value, '제목을 복사했습니다.'));
  document.getElementById('blog-copy-tags').addEventListener('click', () => copyPlain(blogTags.value, '태그를 복사했습니다.'));
  document.getElementById('blog-copy-text').addEventListener('click', () => copyPlain(blogPreview.innerText, '텍스트를 복사했습니다.'));
  document.getElementById('blog-copy-body').addEventListener('click', copyRichBody);
  document.getElementById('short-copy').addEventListener('click', () => copyPlain(shortText.value, '복사했습니다. 붙여넣기(Ctrl+V) 하세요.'));
  document.getElementById('blog-regenerate').addEventListener('click', () => {
    if (!confirmDiscardEdits()) return;
    delete blogPreview.dataset.edited;
    blogSeed += 1;
    renderBlog();
  });
  blogPhotos.addEventListener('change', () => {
    if (!confirmDiscardEdits()) {
      blogPhotos.checked = !blogPhotos.checked;
      return;
    }
    delete blogPreview.dataset.edited;
    renderBlog();
  });
  topicListEl.addEventListener('click', (e) => {
    const item = e.target.closest('[data-topic]');
    if (!item || item.dataset.topic === topicId) return;
    if (!confirmDiscardEdits()) return;
    delete blogPreview.dataset.edited;
    topicId = item.dataset.topic;
    blogSeed = 0;
    renderTopicList();
    renderBlog();
  });

  document.getElementById('topic-suggest-new').addEventListener('click', () => {
    if (!confirmDiscardEdits()) return;
    let seen = loadSeenTopics();
    const result = KCarBlog.suggestNew(adminCars, { seen, done: topicDone, count: 3 });
    if (!result.topics.length) {
      KCarUtil.toast('지금은 제안할 새 주제가 없어요. 매물이 늘어나면 새로운 제안이 생깁니다.', 'error', 4000);
      return;
    }
    if (result.cycled) {
      seen = [];
      KCarUtil.toast('준비된 주제를 한 바퀴 다 보여드렸어요. 처음부터 다시 제안합니다.', 'success', 4000);
    } else {
      KCarUtil.toast(`새 주제 ${result.topics.length}개를 제안했어요. 목록 맨 위를 확인해 보세요.`, 'success');
    }
    const newIds = result.topics.map(t => t.id);
    saveSeenTopics([...seen, ...newIds]);
    // 이전에 받은 제안 중 아직 안 쓴 것은 이번 제안 아래에 이어서 보여준다 (최대 9개)
    proposedTopics = [...result.topics, ...proposedTopics.filter(t => !newIds.includes(t.id) && !topicDone[t.id])].slice(0, 9);
    delete blogPreview.dataset.edited;
    topicId = newIds[0];
    blogSeed = 0;
    renderTopicList();
    renderBlog();
    topicListEl.scrollTop = 0;
  });

  topicDoneBtn.addEventListener('click', async () => {
    if (!topicId) return;
    const markDone = !topicDone[topicId];
    try {
      const res = await fetch('admin/blog-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ id: topicId, done: markDone })
      });
      if (!res.ok) throw new Error('save failed');
      topicDone = (await res.json()).done || {};
      renderTopicList();
      KCarUtil.toast(markDone ? '작성 완료로 표시했습니다. 다음 추천 주제를 확인해 보세요.' : '작성 완료 표시를 취소했습니다.', 'success');
    } catch (e) {
      KCarUtil.toast('저장하지 못했습니다.', 'error');
    }
  });
  blogPreview.addEventListener('input', () => { blogPreview.dataset.edited = '1'; seoDebounced(); });
  blogTitle.addEventListener('input', seoDebounced);
  blogTags.addEventListener('input', seoDebounced);

  blogModal.querySelector('#blog-channel-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-channel]');
    if (!tab || !blogCar) return;
    blogChannel = tab.dataset.channel;
    applyBlogLayout();
    renderBlog();
  });

  document.getElementById('blog-cover-save').addEventListener('click', () => {
    if (!blogCover.dataset.ready) {
      KCarUtil.toast('대표 이미지를 만들지 못했어요. 사진이 저장된 뒤 다시 시도해 주세요.', 'error');
      return;
    }
    blogCover.toBlob((blob) => {
      if (!blob) { KCarUtil.toast('이미지를 저장하지 못했습니다.', 'error'); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `fromkcar_${blogCar && blogCar.listing_no ? 'no' + blogCar.listing_no : 'cover'}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
  });

  // 블로그 작성 여부는 매물 데이터에 저장해, 목록에서 아직 안 올린 매물을 한눈에 보게 한다.
  async function setBlogPosted(car, posted) {
    await KCarAPI.updateCar(car.id, { blog_posted: posted, blog_posted_at: posted ? Date.now() : null });
    car.blog_posted = posted;
    car.blog_posted_at = posted ? Date.now() : null;
    if (blogCar && blogCar.id === car.id) {
      blogCar.blog_posted = posted;
      updateMarkPostedButton();
    }
    renderAdminTable();
  }

  markPostedBtn.addEventListener('click', async () => {
    if (!blogCar) return;
    const car = adminCars.find(c => c.id === blogCar.id) || blogCar;
    try {
      await setBlogPosted(car, !car.blog_posted);
      KCarUtil.toast(car.blog_posted ? '블로그 작성 완료로 표시했습니다.' : '작성 완료 표시를 취소했습니다.', 'success');
    } catch (e) {
      KCarUtil.toast('저장하지 못했습니다.', 'error');
    }
  });

  document.getElementById('topic-blog-btn').addEventListener('click', openTopicModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !blogModal.classList.contains('hidden')) closeBlogModal();
  });

  /* ---------------- 대표(썸네일) 사진 선택 ---------------- */
  // 첫 번째 사진이 실내 사진이라 카드 썸네일이 어색할 때, 목록에서 바로 대표 사진을 골라 저장한다.
  const thumbPicker = document.getElementById('thumb-picker');
  const thumbPickerGrid = document.getElementById('thumb-picker-grid');
  let thumbPickerCarId = null;

  function closeThumbPicker() {
    thumbPicker.classList.add('hidden');
    thumbPicker.classList.remove('flex');
    thumbPickerCarId = null;
  }

  function openThumbPicker(car) {
    const images = Array.isArray(car.images) && car.images.length ? car.images : [car.main_image].filter(Boolean);
    if (!images.length) {
      KCarUtil.toast('등록된 사진이 없습니다.', 'error');
      return;
    }
    thumbPickerCarId = car.id;
    document.getElementById('thumb-picker-title').textContent = `${car.title || ''}${car.listing_no ? ` (No.${car.listing_no})` : ''}`;
    const current = car.main_image || images[0];
    thumbPickerGrid.innerHTML = images.map((url, i) => `
      <button type="button" data-idx="${i}" class="relative aspect-[4/3] rounded-xl overflow-hidden bg-[var(--fk-gray-100)] border-[3px] ${url === current ? 'border-[var(--fk-blue)]' : 'border-transparent hover:border-[var(--fk-gray-400)]'}">
        <img src="${KCarUtil.escapeHtml(url)}" loading="lazy" class="w-full h-full object-cover" onerror="this.style.display='none'">
        <span class="absolute left-1 top-1 rounded bg-black/60 text-white text-[10px] font-bold px-1.5 leading-4">${i + 1}</span>
        ${url === current ? '<span class="absolute right-1 bottom-1 rounded bg-[var(--fk-blue)] text-white text-[10px] font-bold px-1.5 leading-4">현재 대표</span>' : ''}
      </button>
    `).join('');
    thumbPicker.classList.remove('hidden');
    thumbPicker.classList.add('flex');
  }

  thumbPickerGrid.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-idx]');
    const car = adminCars.find(c => c.id === thumbPickerCarId);
    if (!btn || !car) return;
    const images = Array.isArray(car.images) && car.images.length ? car.images : [car.main_image].filter(Boolean);
    const url = images[Number(btn.dataset.idx)];
    if (!url) return;
    if (url === (car.main_image || images[0])) {
      closeThumbPicker();
      return;
    }
    thumbPickerGrid.style.opacity = '.5';
    thumbPickerGrid.style.pointerEvents = 'none';
    try {
      await KCarAPI.updateCar(car.id, { main_image: url });
      car.main_image = url;
      // 같은 매물을 수정 폼에서 열어 두었다면 폼의 대표 사진도 맞춰, 저장할 때 예전 값으로 되돌아가지 않게 한다.
      if (editingId === car.id) {
        document.getElementById('f-main-image').value = url;
        renderPreviewImages();
      }
      renderAdminTable();
      closeThumbPicker();
      KCarUtil.toast('대표 사진을 변경했습니다.', 'success');
    } catch (err) {
      KCarUtil.toast('대표 사진 변경에 실패했습니다.', 'error');
    } finally {
      thumbPickerGrid.style.opacity = '';
      thumbPickerGrid.style.pointerEvents = '';
    }
  });

  document.getElementById('thumb-picker-close').addEventListener('click', closeThumbPicker);
  thumbPicker.addEventListener('click', (e) => {
    if (e.target === thumbPicker) closeThumbPicker();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !thumbPicker.classList.contains('hidden')) closeThumbPicker();
  });

  document.getElementById('admin-table-body').addEventListener('change', async (e) => {
    const select = e.target.closest('[data-action="quick-status"]');
    if (!select) return;
    const car = adminCars.find(c => c.id === select.dataset.id);
    if (!car) return;
    const newStatus = select.value;
    const prevStatus = car.status;
    select.disabled = true;
    try {
      await KCarAPI.updateCar(car.id, { status: newStatus });
      car.status = newStatus;
      select.style.background = newStatus === '판매완료' ? 'var(--fk-gray-600)' : 'var(--fk-green)';
      KCarUtil.toast('상태를 변경했습니다.', 'success');
    } catch (err) {
      select.value = prevStatus;
      KCarUtil.toast('상태 변경에 실패했습니다.', 'error');
    } finally {
      select.disabled = false;
    }
  });

  document.getElementById('admin-table-body').addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-action="edit"]');
    const delBtn = e.target.closest('[data-action="delete"]');
    const refetchBtn = e.target.closest('[data-action="refetch"]');
    const upBtn = e.target.closest('[data-action="move-up"]');
    const downBtn = e.target.closest('[data-action="move-down"]');
    const pickBtn = e.target.closest('[data-action="pick-thumb"]');
    const blogBtn = e.target.closest('[data-action="blog"]');
    const blogChip = e.target.closest('[data-action="toggle-blog-posted"]');
    if (blogChip) {
      const car = adminCars.find(c => c.id === blogChip.dataset.id);
      if (car) {
        try {
          await setBlogPosted(car, !car.blog_posted);
        } catch (err) {
          KCarUtil.toast('저장하지 못했습니다.', 'error');
        }
      }
      return;
    }
    if (blogBtn) {
      const car = adminCars.find(c => c.id === blogBtn.dataset.id);
      if (car) openBlogModal(car);
      return;
    }
    if (pickBtn) {
      const car = adminCars.find(c => c.id === pickBtn.dataset.id);
      if (car) openThumbPicker(car);
      return;
    }
    if (upBtn || downBtn) {
      const moveBtn = upBtn || downBtn;
      const sorted = [...adminCars].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
      const idx = sorted.findIndex(c => c.id === moveBtn.dataset.id);
      const swapIdx = upBtn ? idx - 1 : idx + 1;
      if (idx === -1 || swapIdx < 0 || swapIdx >= sorted.length) return;
      const a = sorted[idx];
      const b = sorted[swapIdx];
      const aOrder = a.display_order ?? 0;
      const bOrder = b.display_order ?? 0;
      moveBtn.disabled = true;
      try {
        await Promise.all([
          KCarAPI.updateCar(a.id, { display_order: bOrder }),
          KCarAPI.updateCar(b.id, { display_order: aOrder })
        ]);
        a.display_order = bOrder;
        b.display_order = aOrder;
        renderAdminTable();
      } catch (err) {
        KCarUtil.toast('순서 변경에 실패했습니다.', 'error');
        moveBtn.disabled = false;
      }
      return;
    }
    if (refetchBtn) {
      const car = adminCars.find(c => c.id === refetchBtn.dataset.id);
      if (!car || !car.source_url) return;
      const icon = refetchBtn.querySelector('i');
      refetchBtn.disabled = true;
      icon.classList.add('fa-spin');
      try {
        const fresh = await KCarParser.fetchAndParse(car.source_url);
        applyRefetched(car, fresh);
        KCarUtil.toast('원본에서 최신 정보를 다시 가져왔어요. 내용을 확인하고 저장해주세요.', 'success');
      } catch (err) {
        KCarUtil.toast(err.message || '원본 정보를 다시 가져오지 못했습니다.', 'error', 5000);
        // 서버가 KB차차차에 접속하지 못하면, 사장님 브라우저로 연 페이지를 붙여넣는 방식으로 이어서 진행한다.
        pasteTargetId = car.id;
        showPastePanel(`"${car.title || '이 매물'}"의 원본 정보를 다시 불러오려면 아래 방법으로 KB차차차 페이지 내용을 붙여넣어 주세요.`, car.source_url);
      } finally {
        refetchBtn.disabled = false;
        icon.classList.remove('fa-spin');
      }
    }
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
