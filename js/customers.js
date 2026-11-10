/**
 * FROM K CAR — 관리자 "고객 관리".
 * 고객 정보는 서버의 /admin/customers(관리자 인증 필요)에만 저장되고, 사이트 방문자에게는 나가지 않는다.
 *  - 고객 카드(국가·채널·유입 경로·메모), 상담 상태, 상담 이력, 다음 연락일, 수출 진행 단계, 거래 내역
 *  - 관심 차량 연결(고객 ↔ 매물 양쪽에서 보기), 가격 인하·신규 입고 때 연락할 고객 추천
 *  - 유입 경로 집계, CSV 내려받기 / JSON 백업
 * 매물 목록은 admin.js가 불러온 것을 KCarAdminData.cars()로 가져다 쓴다.
 */
(function () {
  const root = document.getElementById('customers-section');
  if (!root) return;

  const STATUSES = ['문의', '상담중', '견적', '계약', '판매완료', '보류'];
  const CHANNELS = ['카카오톡', '텔레그램', 'WhatsApp', '전화', '문자', '이메일', '기타'];
  const SOURCES = ['인스타그램', '네이버 블로그', '텔레그램', '지인 소개', '사이트', '당근', '기타'];
  const EXPORT_STAGES = ['계약금', '서류', '선적', '입항', '완료'];
  const STATUS_COLOR = { 문의: '#64748b', 상담중: '#2563eb', 견적: '#7c3aed', 계약: '#d97706', 판매완료: '#16a34a', 보류: '#94a3b8' };
  const DAY_MS = 86400000;

  const esc = (s) => KCarUtil.escapeHtml(String(s ?? ''));
  const cars = () => (window.KCarAdminData ? KCarAdminData.cars() : []);
  const carById = (id) => cars().find((c) => c.id === id);
  const todayStr = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD (로컬 날짜)
  const isActive = (c) => c.status !== '판매완료' && c.status !== '보류';
  const manOf = (won) => Math.round((Number(won) || 0) / 10000);
  const fmtMan = (man) => `${Number(man).toLocaleString('en-US')}만원`;
  const fmtDate = (ts) => (ts ? new Date(ts).toLocaleDateString('sv-SE') : '');

  let customers = [];
  let loaded = false;
  const filter = { q: '', status: '', source: '', country: '', due: false, exporting: false, car: '' };

  /* ---------------- 서버 통신 ---------------- */
  async function api(method, path, body) {
    const token = window.KCarAuth && KCarAuth.getToken();
    const res = await fetch(path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    if (res.status === 401) { if (window.KCarAuth) { KCarAuth.clearToken(); KCarAuth.showGate(); } throw new Error('로그인이 필요합니다.'); }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '요청에 실패했습니다.');
    }
    return res.status === 204 ? null : res.json();
  }

  async function load() {
    if (!(window.KCarAuth && KCarAuth.getToken())) return;
    try {
      customers = (await api('GET', 'admin/customers')).data || [];
      loaded = true;
      render();
      document.dispatchEvent(new CustomEvent('customersloaded'));
    } catch (e) {
      root.querySelector('#cust-body').innerHTML = `<p class="text-sm text-[var(--fk-red)] py-6 text-center">고객 목록을 불러오지 못했습니다. ${esc(e.message)}</p>`;
    }
  }

  async function patchCustomer(c, changes, okMsg) {
    const before = { ...c };
    Object.assign(c, changes);
    try {
      const saved = await api('PATCH', `admin/customers/${c.id}`, changes);
      Object.assign(c, saved);
      if (okMsg) KCarUtil.toast(okMsg, 'success');
    } catch (e) {
      Object.assign(c, before);
      KCarUtil.toast(e.message || '저장에 실패했습니다.', 'error');
    }
    render();
    document.dispatchEvent(new CustomEvent('customersloaded'));
  }

  /* ---------------- 계산 ---------------- */
  const dueList = () => customers.filter((c) => isActive(c) && c.next_contact && c.next_contact <= todayStr())
    .sort((a, b) => a.next_contact.localeCompare(b.next_contact));
  const isExporting = (c) => !!c.export_stage && c.export_stage !== '완료';
  const dealTotal = (c) => (c.deals || []).reduce((a, d) => a + (d.price || 0), 0);

  // 이 매물에 관심 있는 고객(보류 제외)
  const interestedIn = (carId) => customers.filter((c) => c.status !== '보류' && (c.interested_car_ids || []).includes(carId));

  // 고객이 적어 둔 희망 조건(브랜드·예산)에 맞는 판매중 매물인가
  function fitsPrefs(c, car) {
    if (car.status === '판매완료') return false;
    const hasPref = c.pref_brand || c.pref_budget_min != null || c.pref_budget_max != null;
    if (!hasPref) return false;
    const man = manOf(car.price);
    const hay = `${car.title || ''} ${car.title_ko || ''} ${car.brand || ''}`.toLowerCase();
    if (c.pref_brand && !hay.includes(String(c.pref_brand).toLowerCase())) return false;
    if (c.pref_budget_min != null && man < c.pref_budget_min) return false;
    if (c.pref_budget_max != null && man > c.pref_budget_max) return false;
    return true;
  }

  // 최근 14일 안에 가격이 내려간 매물
  function recentDrops() {
    const since = Date.now() - 14 * DAY_MS;
    return cars().filter((car) => car.status !== '판매완료').map((car) => {
      const hs = (car.price_history || []).filter((h) => h.at >= since && h.from > 0 && h.to > 0);
      if (!hs.length) return null;
      const first = hs[0], last = hs[hs.length - 1];
      return last.to < first.from ? { car, from: first.from, to: last.to } : null;
    }).filter(Boolean);
  }

  const newArrivals = () => cars().filter((car) => car.status !== '판매완료' && Date.now() - (car.created_at || 0) <= 14 * DAY_MS);

  /* ---------------- 화면 ---------------- */
  function chip(c) {
    return `<button type="button" data-cust-open="${c.id}" class="inline-flex items-center gap-1 text-xs font-bold rounded-full px-2.5 py-1 bg-white border border-[var(--fk-gray-200)] hover:border-[var(--fk-blue)]">${esc(c.name)}${c.country ? `<span class="font-normal text-[var(--fk-gray-600)]">· ${esc(c.country)}</span>` : ''}</button>`;
  }

  function summaryHtml() {
    const monthKey = todayStr().slice(0, 7);
    const dealsThisMonth = customers.reduce((a, c) => a + (c.deals || []).filter((d) => (d.date || '').startsWith(monthKey)).length, 0);
    const card = (label, value, sub, action) => `<${action ? 'button type="button" data-cust-quick="' + action + '"' : 'div'} class="text-left rounded-2xl border border-[var(--fk-gray-200)] bg-[var(--fk-gray-100)]/60 px-4 py-3 ${action ? 'hover:border-[var(--fk-blue)]' : ''}">
      <p class="text-[11px] font-semibold text-[var(--fk-gray-600)]">${label}</p>
      <p class="text-xl font-extrabold text-[var(--fk-navy)] leading-tight mt-0.5">${value}</p>
      <p class="text-[11px] mt-0.5 text-[var(--fk-gray-600)]">${sub || '&nbsp;'}</p></${action ? 'button' : 'div'}>`;
    const due = dueList().length;
    return `<div class="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
      ${card('전체 고객', `${customers.length}명`, `진행중 ${customers.filter(isActive).length}명`)}
      ${card('오늘 연락할 고객', `<span class="${due ? 'text-[var(--fk-red)]' : ''}">${due}명</span>`, due ? '눌러서 보기' : '연락 예정 없음', 'due')}
      ${card('상담 · 견적 진행', `${customers.filter((c) => c.status === '상담중' || c.status === '견적').length}명`, `계약 단계 ${customers.filter((c) => c.status === '계약').length}명`)}
      ${card('수출 진행중', `${customers.filter(isExporting).length}명`, '눌러서 보기', 'exporting')}
      ${card('이번 달 거래', `${dealsThisMonth}건`, `누적 거래 ${customers.reduce((a, c) => a + (c.deals || []).length, 0)}건`)}
    </div>`;
  }

  function panelsHtml() {
    const due = dueList();
    const drops = recentDrops();
    const arrivals = newArrivals().map((car) => ({ car, list: customers.filter((c) => isActive(c) && !(c.interested_car_ids || []).includes(car.id) && fitsPrefs(c, car)) })).filter((x) => x.list.length);
    const box = (title, hint, inner, empty) => `<div class="rounded-2xl border border-[var(--fk-gray-200)] px-4 py-3">
      <p class="text-sm font-bold text-[var(--fk-gray-800)]">${title}</p><p class="text-[11px] text-[var(--fk-gray-600)] mb-2">${hint}</p>
      ${inner || `<p class="text-xs text-[var(--fk-gray-600)] py-2">${empty}</p>`}</div>`;

    const dueInner = due.slice(0, 8).map((c) => {
      const late = Math.round((new Date(todayStr()) - new Date(c.next_contact)) / DAY_MS);
      return `<div class="flex items-center justify-between gap-2 py-1.5 border-b border-[var(--fk-gray-100)] last:border-0">
        <div class="min-w-0">${chip(c)} <span class="text-[11px] ${late > 0 ? 'text-[var(--fk-red)] font-bold' : 'text-[var(--fk-gray-600)]'}">${late > 0 ? `${late}일 지남` : '오늘'}</span></div>
        <span class="text-[11px] text-[var(--fk-gray-600)] truncate">${esc(c.phone)}</span></div>`;
    }).join('');

    const dropInner = drops.map(({ car, from, to }) => {
      const who = interestedIn(car.id).filter(isActive);
      return `<div class="py-1.5 border-b border-[var(--fk-gray-100)] last:border-0">
        <p class="text-xs font-semibold text-[var(--fk-gray-800)]">${esc(car.title)} <span class="text-[var(--fk-red)]">${fmtMan(manOf(from))} → ${fmtMan(manOf(to))}</span></p>
        <div class="flex flex-wrap gap-1 mt-1">${who.length ? who.map(chip).join('') : '<span class="text-[11px] text-[var(--fk-gray-600)]">관심 고객이 아직 없어요</span>'}</div></div>`;
    }).join('');

    const arrInner = arrivals.slice(0, 6).map(({ car, list }) => `<div class="py-1.5 border-b border-[var(--fk-gray-100)] last:border-0">
        <p class="text-xs font-semibold text-[var(--fk-gray-800)]">${esc(car.title)} <span class="text-[var(--fk-gray-600)]">${fmtMan(manOf(car.price))}</span></p>
        <div class="flex flex-wrap gap-1 mt-1">${list.map(chip).join('')}</div></div>`).join('');

    // 유입 경로별 고객 수와 계약·판매 전환
    const rows = SOURCES.map((s) => {
      const list = customers.filter((c) => (c.source || '기타') === s);
      return { s, n: list.length, won: list.filter((c) => c.status === '계약' || c.status === '판매완료' || (c.deals || []).length).length };
    }).filter((r) => r.n).sort((a, b) => b.n - a.n);
    const maxN = Math.max(1, ...rows.map((r) => r.n));
    const srcInner = rows.map((r) => `<div class="flex items-center gap-2 py-1 text-xs">
      <span class="w-20 shrink-0 font-semibold text-[var(--fk-gray-800)]">${esc(r.s)}</span>
      <div class="flex-1 h-3 rounded bg-[var(--fk-gray-100)] overflow-hidden"><div class="h-full rounded" style="width:${(r.n / maxN) * 100}%;background:var(--fk-blue)"></div></div>
      <span class="w-24 shrink-0 text-right text-[var(--fk-gray-600)]">${r.n}명 · 계약 ${r.won}</span></div>`).join('');

    return `<div class="grid lg:grid-cols-2 gap-3 mb-4">
      ${box('📞 오늘 연락할 고객', '다음 연락일이 오늘이거나 지난 고객', dueInner, '오늘 연락할 고객이 없어요.')}
      ${box('💰 가격을 내린 매물 → 연락할 고객', '최근 14일 안에 가격이 내려간 매물과 그 매물에 관심 있는 고객', dropInner, '최근 가격을 내린 매물이 없어요.')}
      ${box('🆕 신규 입고 매물 → 어울리는 고객', '최근 14일 안에 등록된 매물 중, 고객의 희망 브랜드·예산에 맞는 경우', arrInner, '맞는 고객이 없어요. 고객 카드에 희망 브랜드·예산을 적어 두면 추천돼요.')}
      ${box('📊 유입 경로 분석', '어디서 온 고객이 계약까지 이어지는지', srcInner, '고객을 등록하면 유입 경로별로 집계돼요.')}
    </div>`;
  }

  function filteredList() {
    const q = filter.q.trim().toLowerCase();
    const dueIds = new Set(dueList().map((c) => c.id));
    return customers.filter((c) => {
      if (filter.status && c.status !== filter.status) return false;
      if (filter.source && c.source !== filter.source) return false;
      if (filter.country && c.country !== filter.country) return false;
      if (filter.due && !dueIds.has(c.id)) return false;
      if (filter.exporting && !isExporting(c)) return false;
      if (filter.car && !(c.interested_car_ids || []).includes(filter.car)) return false;
      if (q && !`${c.name} ${c.phone} ${c.country} ${c.memo} ${c.referred_by}`.toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
  }

  function selectHtml(attrs, options, value, extraCls, emptyLabel) {
    return `<select ${attrs} class="fk-input !py-1 !px-2 !w-auto text-xs font-semibold ${extraCls || ''}">${options.map((o) => `<option value="${esc(o)}" ${o === value ? 'selected' : ''}>${esc(o || emptyLabel || '-')}</option>`).join('')}</select>`;
  }

  function rowHtml(c) {
    const interested = (c.interested_car_ids || []).map(carById).filter(Boolean);
    const overdue = c.next_contact && c.next_contact < todayStr() && isActive(c);
    const repeat = (c.deals || []).length >= 2;
    const showExport = c.status === '계약' || c.status === '판매완료' || c.export_stage;
    return `<tr class="border-b border-[var(--fk-gray-100)] align-top">
      <td class="py-3 pr-3 min-w-[130px]">
        <button type="button" data-cust-open="${c.id}" class="font-bold text-[var(--fk-gray-800)] hover:text-[var(--fk-blue)] text-left">${esc(c.name)}</button>
        <p class="text-xs text-[var(--fk-gray-600)]">${esc(c.country || '')}</p>
        <div class="flex flex-wrap gap-1 mt-0.5">${repeat ? '<span class="text-[10px] font-bold rounded-full px-1.5 py-0.5 bg-amber-100 text-amber-800">재구매</span>' : ''}${c.referred_by ? `<span class="text-[10px] font-bold rounded-full px-1.5 py-0.5 bg-pink-100 text-pink-800">소개 ${esc(c.referred_by)}</span>` : ''}</div>
      </td>
      <td class="py-3 pr-3 text-xs whitespace-nowrap"><p class="font-semibold text-[var(--fk-gray-800)]">${esc(c.phone || '-')}</p><p class="text-[var(--fk-gray-600)]">${esc(c.channel || '')}</p></td>
      <td class="py-3 pr-3">${selectHtml(`data-cust-status="${c.id}"`, STATUSES, c.status, '')}</td>
      <td class="py-3 pr-3"><input type="date" data-cust-next="${c.id}" value="${esc(c.next_contact || '')}" class="fk-input !py-1 !px-2 !w-[132px] text-xs ${overdue ? '!border-[var(--fk-red)] text-[var(--fk-red)] font-bold' : ''}"></td>
      <td class="py-3 pr-3 text-xs max-w-[190px]">${interested.length ? `<p class="font-semibold text-[var(--fk-gray-800)] truncate">${esc(interested[0].title)}</p>${interested.length > 1 ? `<p class="text-[var(--fk-gray-600)]">외 ${interested.length - 1}대</p>` : ''}` : '<span class="text-[var(--fk-gray-600)]">-</span>'}</td>
      <td class="py-3 pr-3">${showExport ? selectHtml(`data-cust-export="${c.id}"`, ['', ...EXPORT_STAGES], c.export_stage || '', '') : '<span class="text-xs text-[var(--fk-gray-600)]">-</span>'}</td>
      <td class="py-3 pr-3 text-xs whitespace-nowrap text-[var(--fk-gray-600)]">${esc(c.source || '')}</td>
      <td class="py-3 text-right"><button type="button" data-cust-open="${c.id}" class="btn-secondary !py-1.5 !px-3 text-xs"><i class="fa-solid fa-pen"></i></button></td>
    </tr>`;
  }

  function render() {
    const body = root.querySelector('#cust-body');
    if (!body) return;
    // 입력 중이던 검색창은 다시 그리지 않는다 (포커스를 잃지 않도록 목록 영역만 갱신)
    const countries = [...new Set(customers.map((c) => c.country).filter(Boolean))].sort();
    const list = filteredList();
    const carFilter = filter.car ? carById(filter.car) : null;
    body.innerHTML = `${summaryHtml()}${panelsHtml()}
      <div class="flex items-center gap-2 flex-wrap mb-3">
        <input id="cust-q" type="search" value="${esc(filter.q)}" placeholder="이름·연락처·국가·메모 검색" class="fk-input !py-2 !w-[220px] text-sm">
        ${selectHtml('id="cust-f-status"', ['', ...STATUSES], filter.status, '', '전체 상태')}
        ${selectHtml('id="cust-f-source"', ['', ...SOURCES], filter.source, '', '전체 경로')}
        ${selectHtml('id="cust-f-country"', ['', ...countries], filter.country, '', '전체 국가')}
        ${filter.due ? '<button type="button" data-cust-clear="due" class="text-xs font-bold rounded-full px-3 py-1.5 bg-red-100 text-red-800">오늘 연락 ✕</button>' : ''}
        ${filter.exporting ? '<button type="button" data-cust-clear="exporting" class="text-xs font-bold rounded-full px-3 py-1.5 bg-sky-100 text-sky-800">수출 진행중 ✕</button>' : ''}
        ${carFilter ? `<button type="button" data-cust-clear="car" class="text-xs font-bold rounded-full px-3 py-1.5 bg-sky-100 text-sky-800">${esc(carFilter.title)} 관심 고객 ✕</button>` : ''}
        <span class="text-xs text-[var(--fk-gray-600)] ml-auto">${list.length}명 표시</span>
      </div>
      <div class="overflow-x-auto"><table class="w-full text-sm admin-table">
        <thead><tr class="text-left border-b border-[var(--fk-gray-200)]"><th class="py-3 pr-3">고객</th><th class="py-3 pr-3">연락처</th><th class="py-3 pr-3">상태</th><th class="py-3 pr-3">다음 연락일</th><th class="py-3 pr-3">관심 차량</th><th class="py-3 pr-3">수출 진행</th><th class="py-3 pr-3">유입 경로</th><th class="py-3"></th></tr></thead>
        <tbody>${list.length ? list.map(rowHtml).join('') : `<tr><td colspan="8" class="text-center py-10 text-[var(--fk-gray-600)]">${customers.length ? '조건에 맞는 고객이 없어요.' : '등록된 고객이 없어요. "고객 추가"로 첫 고객을 등록해 보세요.'}</td></tr>`}</tbody>
      </table></div>`;
    const q = body.querySelector('#cust-q');
    if (document.activeElement && document.activeElement.id === 'cust-q') { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  }

  /* ---------------- 고객 편집 창 ---------------- */
  const modal = document.createElement('div');
  modal.id = 'customer-modal';
  modal.className = 'fixed inset-0 z-[120] hidden items-start justify-center p-3 sm:p-6 bg-black/55 overflow-y-auto';
  document.body.appendChild(modal);
  let editing = null; // { id|null, notes, deals, interested }

  function field(label, inner, cls) {
    return `<label class="text-sm ${cls || ''}"><span class="block font-semibold text-[var(--fk-gray-800)] mb-1">${label}</span>${inner}</label>`;
  }
  const input = (id, value, attrs) => `<input id="${id}" value="${esc(value ?? '')}" class="fk-input" ${attrs || ''}>`;
  const opts = (list, value) => list.map((o) => `<option value="${esc(o)}" ${o === value ? 'selected' : ''}>${esc(o || '-')}</option>`).join('');

  function openModal(id) {
    const c = id ? customers.find((x) => x.id === id) : null;
    editing = {
      id: c ? c.id : null,
      notes: JSON.parse(JSON.stringify((c && c.notes) || [])),
      deals: JSON.parse(JSON.stringify((c && c.deals) || [])),
      interested: [...((c && c.interested_car_ids) || [])]
    };
    const v = c || { status: '문의', channel: '카카오톡', source: '기타', export_stage: '' };
    modal.innerHTML = `<div class="bg-white rounded-3xl shadow-2xl w-full max-w-3xl my-auto">
      <div class="flex items-center justify-between px-6 py-4 border-b border-[var(--fk-gray-200)]">
        <h3 class="text-lg font-bold text-[var(--fk-gray-800)]">${c ? esc(c.name) + ' 고객' : '새 고객 등록'}</h3>
        <button type="button" data-cm-close class="w-9 h-9 rounded-full hover:bg-[var(--fk-gray-100)]"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="px-6 py-5 space-y-5">
        <div class="grid sm:grid-cols-3 gap-3">
          ${field('이름 *', input('cm-name', v.name, 'maxlength="60"'))}
          ${field('연락처', input('cm-phone', v.phone, 'maxlength="40" placeholder="+7 / +976 / 010-…"'))}
          ${field('국가', input('cm-country', v.country, 'maxlength="40" placeholder="러시아, 몽골, 한국…"'))}
          ${field('선호 채널', `<select id="cm-channel" class="fk-input">${opts(CHANNELS, v.channel)}</select>`)}
          ${field('유입 경로', `<select id="cm-source" class="fk-input">${opts(SOURCES, v.source)}</select>`)}
          ${field('소개해 준 사람', input('cm-referred', v.referred_by, 'maxlength="100" placeholder="지인 소개일 때"'))}
          ${field('상담 상태', `<select id="cm-status" class="fk-input">${opts(STATUSES, v.status)}</select>`)}
          ${field('다음 연락일', input('cm-next', v.next_contact, 'type="date"'))}
          ${field('수출 진행 단계', `<select id="cm-export" class="fk-input">${opts(['', ...EXPORT_STAGES], v.export_stage || '')}</select>`)}
        </div>
        <div class="grid sm:grid-cols-3 gap-3 rounded-2xl bg-[var(--fk-gray-100)]/70 border border-[var(--fk-gray-200)] p-3">
          ${field('희망 브랜드', input('cm-pref-brand', v.pref_brand, 'maxlength="100" placeholder="예: BMW"'))}
          ${field('예산 최소 (만원)', input('cm-bmin', v.pref_budget_min ?? '', 'type="number" min="0"'))}
          ${field('예산 최대 (만원)', input('cm-bmax', v.pref_budget_max ?? '', 'type="number" min="0"'))}
          <div id="cm-suggest" class="sm:col-span-3"></div>
        </div>
        ${field('메모', `<textarea id="cm-memo" rows="2" maxlength="2000" class="fk-input">${esc(v.memo || '')}</textarea>`)}

        <div>
          <p class="text-sm font-semibold text-[var(--fk-gray-800)] mb-1">관심 차량 <span id="cm-int-count" class="font-normal text-xs text-[var(--fk-gray-600)]"></span></p>
          <input id="cm-car-q" type="search" placeholder="차량명으로 찾기" class="fk-input !py-2 text-sm mb-2">
          <div id="cm-cars" class="max-h-44 overflow-y-auto rounded-xl border border-[var(--fk-gray-200)] divide-y divide-[var(--fk-gray-100)]"></div>
        </div>

        <div>
          <p class="text-sm font-semibold text-[var(--fk-gray-800)] mb-1">상담 이력</p>
          <div class="flex gap-2 mb-2"><input id="cm-note-text" maxlength="1000" placeholder="통화·메시지 내용을 적고 추가를 누르세요" class="fk-input text-sm"><button type="button" data-cm-add-note class="btn-secondary text-sm whitespace-nowrap">추가</button></div>
          <div id="cm-notes" class="space-y-1.5"></div>
        </div>

        <div>
          <p class="text-sm font-semibold text-[var(--fk-gray-800)] mb-1">거래 내역 <span id="cm-deal-total" class="font-normal text-xs text-[var(--fk-gray-600)]"></span></p>
          <div class="flex gap-2 flex-wrap mb-2">
            <select id="cm-deal-car" class="fk-input text-sm !w-auto flex-1 min-w-[160px]"></select>
            <input id="cm-deal-price" type="number" min="0" placeholder="거래가 (만원)" class="fk-input text-sm !w-[130px]">
            <input id="cm-deal-date" type="date" value="${todayStr()}" class="fk-input text-sm !w-[150px]">
            <button type="button" data-cm-add-deal class="btn-secondary text-sm whitespace-nowrap">추가</button>
          </div>
          <div id="cm-deals" class="space-y-1.5"></div>
        </div>
      </div>
      <div class="flex items-center justify-between gap-2 px-6 py-4 border-t border-[var(--fk-gray-200)]">
        <div>${c ? '<button type="button" data-cm-delete class="btn-danger text-sm"><i class="fa-solid fa-trash mr-1.5"></i>삭제</button>' : ''}</div>
        <div class="flex gap-2"><button type="button" data-cm-close class="btn-secondary text-sm">닫기</button><button type="button" data-cm-save class="btn-primary text-sm"><i class="fa-solid fa-check mr-1.5"></i>저장</button></div>
      </div></div>`;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.style.overflow = 'hidden';
    renderCarPicker();
    renderNotes();
    renderDeals();
    renderSuggest();
    modal.querySelector(c ? '#cm-note-text' : '#cm-name').focus();
  }

  function closeModal() {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.body.style.overflow = '';
    editing = null;
  }

  const $m = (sel) => modal.querySelector(sel);

  function renderCarPicker() {
    const q = ($m('#cm-car-q').value || '').trim().toLowerCase();
    const list = cars().filter((c) => !q || `${c.title} ${c.title_ko || ''} ${c.car_number || ''}`.toLowerCase().includes(q))
      .sort((a, b) => (editing.interested.includes(b.id) - editing.interested.includes(a.id)) || ((a.status === '판매완료') - (b.status === '판매완료')));
    $m('#cm-cars').innerHTML = list.length ? list.map((c) => `<label class="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-[var(--fk-gray-100)]">
      <input type="checkbox" data-cm-car="${c.id}" ${editing.interested.includes(c.id) ? 'checked' : ''}>
      <span class="flex-1 truncate">${esc(c.title)}</span>
      <span class="text-xs text-[var(--fk-gray-600)] whitespace-nowrap">${c.status === '판매완료' ? '판매완료' : fmtMan(manOf(c.price))}</span></label>`).join('')
      : '<p class="text-xs text-[var(--fk-gray-600)] p-3">매물이 없어요.</p>';
    $m('#cm-int-count').textContent = editing.interested.length ? `(${editing.interested.length}대 선택)` : '';
    // 거래 내역에 쓸 차량 목록
    const sel = $m('#cm-deal-car');
    if (!sel.dataset.filled) {
      sel.innerHTML = `<option value="">차량 선택(선택 사항)</option>${cars().map((c) => `<option value="${c.id}">${esc(c.title)}</option>`).join('')}`;
      sel.dataset.filled = '1';
    }
  }

  function renderNotes() {
    const list = [...editing.notes].map((n, i) => ({ n, i })).reverse();
    $m('#cm-notes').innerHTML = list.length ? list.map(({ n, i }) => `<div class="flex items-start gap-2 rounded-xl bg-[var(--fk-gray-100)]/70 px-3 py-2 text-sm">
      <span class="text-[11px] font-bold text-[var(--fk-gray-600)] whitespace-nowrap pt-0.5">${fmtDate(n.at)}</span><span class="flex-1 whitespace-pre-wrap">${esc(n.text)}</span>
      <button type="button" data-cm-del-note="${i}" class="text-[var(--fk-gray-600)] hover:text-[var(--fk-red)]" title="삭제"><i class="fa-solid fa-xmark"></i></button></div>`).join('')
      : '<p class="text-xs text-[var(--fk-gray-600)]">아직 기록이 없어요.</p>';
  }

  function renderDeals() {
    const total = editing.deals.reduce((a, d) => a + (d.price || 0), 0);
    $m('#cm-deal-total').textContent = editing.deals.length ? `(${editing.deals.length}건 · 합계 ${fmtMan(manOf(total))}${editing.deals.length >= 2 ? ' · 재구매 고객' : ''})` : '';
    $m('#cm-deals').innerHTML = editing.deals.length ? editing.deals.map((d, i) => `<div class="flex items-center gap-2 rounded-xl bg-[var(--fk-gray-100)]/70 px-3 py-2 text-sm">
      <span class="text-[11px] font-bold text-[var(--fk-gray-600)] whitespace-nowrap">${esc(d.date || '')}</span><span class="flex-1 truncate">${esc(d.title || '(차량 미지정)')}</span>
      <span class="font-bold text-[var(--fk-navy)] whitespace-nowrap">${d.price ? fmtMan(manOf(d.price)) : ''}</span>
      <button type="button" data-cm-del-deal="${i}" class="text-[var(--fk-gray-600)] hover:text-[var(--fk-red)]" title="삭제"><i class="fa-solid fa-xmark"></i></button></div>`).join('')
      : '<p class="text-xs text-[var(--fk-gray-600)]">거래 내역이 없어요.</p>';
  }

  // 지금 입력한 희망 조건에 맞는 판매중 매물 (아직 관심 차량이 아닌 것만) → "+ 추가"로 바로 연결
  function renderSuggest() {
    const tmp = {
      pref_brand: $m('#cm-pref-brand').value.trim(),
      pref_budget_min: $m('#cm-bmin').value === '' ? null : Number($m('#cm-bmin').value),
      pref_budget_max: $m('#cm-bmax').value === '' ? null : Number($m('#cm-bmax').value)
    };
    const hits = cars().filter((car) => !editing.interested.includes(car.id) && fitsPrefs(tmp, car)).slice(0, 6);
    $m('#cm-suggest').innerHTML = hits.length
      ? `<p class="text-xs font-bold text-[var(--fk-gray-800)] mb-1">이 조건에 맞는 판매중 매물</p><div class="flex flex-wrap gap-1.5">${hits.map((c) => `<button type="button" data-cm-suggest="${c.id}" class="text-xs rounded-full px-2.5 py-1 bg-white border border-[var(--fk-gray-200)] hover:border-[var(--fk-blue)]">+ ${esc(c.title)} <b>${fmtMan(manOf(c.price))}</b></button>`).join('')}</div>`
      : '<p class="text-[11px] text-[var(--fk-gray-600)]">희망 브랜드·예산을 적으면 맞는 매물을 추천해 드려요.</p>';
  }

  function collect() {
    const num = (sel) => ($m(sel).value === '' ? null : Number($m(sel).value));
    return {
      name: $m('#cm-name').value.trim(), phone: $m('#cm-phone').value.trim(), country: $m('#cm-country').value.trim(),
      channel: $m('#cm-channel').value, source: $m('#cm-source').value, referred_by: $m('#cm-referred').value.trim(),
      status: $m('#cm-status').value, next_contact: $m('#cm-next').value, export_stage: $m('#cm-export').value,
      pref_brand: $m('#cm-pref-brand').value.trim(), pref_budget_min: num('#cm-bmin'), pref_budget_max: num('#cm-bmax'),
      memo: $m('#cm-memo').value.trim(), interested_car_ids: editing.interested, notes: editing.notes, deals: editing.deals
    };
  }

  async function saveModal() {
    const data = collect();
    if (!data.name) { KCarUtil.toast('이름을 입력해 주세요.', 'error'); $m('#cm-name').focus(); return; }
    const btn = $m('[data-cm-save]');
    btn.disabled = true;
    try {
      if (editing.id) {
        const saved = await api('PATCH', `admin/customers/${editing.id}`, data);
        const i = customers.findIndex((c) => c.id === editing.id);
        if (i >= 0) customers[i] = saved;
      } else {
        customers.push(await api('POST', 'admin/customers', data));
      }
      KCarUtil.toast('고객 정보를 저장했습니다.', 'success');
      closeModal();
      render();
      document.dispatchEvent(new CustomEvent('customersloaded'));
    } catch (e) {
      KCarUtil.toast(e.message || '저장에 실패했습니다.', 'error');
      btn.disabled = false;
    }
  }

  async function deleteCustomer() {
    const c = customers.find((x) => x.id === editing.id);
    if (!c || !confirm(`"${c.name}" 고객을 삭제할까요? 상담 이력과 거래 내역도 함께 사라지며 되돌릴 수 없습니다.`)) return;
    try {
      await api('DELETE', `admin/customers/${c.id}`);
      customers = customers.filter((x) => x.id !== c.id);
      KCarUtil.toast('고객을 삭제했습니다.', 'success');
      closeModal();
      render();
      document.dispatchEvent(new CustomEvent('customersloaded'));
    } catch (e) {
      KCarUtil.toast(e.message || '삭제에 실패했습니다.', 'error');
    }
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.closest('[data-cm-close]')) return closeModal();
    if (!editing) return;
    if (e.target.closest('[data-cm-save]')) return saveModal();
    if (e.target.closest('[data-cm-delete]')) return deleteCustomer();
    const del = e.target.closest('[data-cm-del-note]');
    if (del) { editing.notes.splice(Number(del.dataset.cmDelNote), 1); return renderNotes(); }
    if (e.target.closest('[data-cm-add-note]')) {
      const t = $m('#cm-note-text');
      if (t.value.trim()) { editing.notes.push({ at: Date.now(), text: t.value.trim() }); t.value = ''; renderNotes(); }
      return;
    }
    const delDeal = e.target.closest('[data-cm-del-deal]');
    if (delDeal) { editing.deals.splice(Number(delDeal.dataset.cmDelDeal), 1); return renderDeals(); }
    if (e.target.closest('[data-cm-add-deal]')) {
      const car = carById($m('#cm-deal-car').value);
      const priceMan = $m('#cm-deal-price').value;
      if (!car && !priceMan) { KCarUtil.toast('차량이나 거래가를 입력해 주세요.', 'error'); return; }
      const price = priceMan !== '' ? Number(priceMan) * 10000 : (car && car.sold_price) || (car && car.price) || null;
      editing.deals.push({ car_id: car ? car.id : '', title: car ? car.title : '', price, date: $m('#cm-deal-date').value || todayStr() });
      $m('#cm-deal-price').value = '';
      return renderDeals();
    }
    const sug = e.target.closest('[data-cm-suggest]');
    if (sug) { editing.interested.push(sug.dataset.cmSuggest); renderCarPicker(); return renderSuggest(); }
  });
  modal.addEventListener('change', (e) => {
    if (!editing) return;
    const cb = e.target.closest('[data-cm-car]');
    if (cb) {
      const id = cb.dataset.cmCar;
      editing.interested = cb.checked ? [...new Set([...editing.interested, id])] : editing.interested.filter((x) => x !== id);
      $m('#cm-int-count').textContent = editing.interested.length ? `(${editing.interested.length}대 선택)` : '';
      renderSuggest();
    }
  });
  modal.addEventListener('input', (e) => {
    if (!editing) return;
    if (e.target.id === 'cm-car-q') renderCarPicker();
    if (['cm-pref-brand', 'cm-bmin', 'cm-bmax'].includes(e.target.id)) renderSuggest();
  });
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'cm-note-text') { e.preventDefault(); $m('[data-cm-add-note]').click(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
  });

  /* ---------------- 목록 화면 이벤트 ---------------- */
  root.addEventListener('click', (e) => {
    const open = e.target.closest('[data-cust-open]');
    if (open) return openModal(open.dataset.custOpen);
    if (e.target.closest('#cust-add')) return openModal(null);
    if (e.target.closest('#cust-csv')) return download('csv');
    if (e.target.closest('#cust-backup')) return download('json');
    const quick = e.target.closest('[data-cust-quick]');
    if (quick) { filter[quick.dataset.custQuick] = !filter[quick.dataset.custQuick]; return render(); }
    const clr = e.target.closest('[data-cust-clear]');
    if (clr) { filter[clr.dataset.custClear] = clr.dataset.custClear === 'car' ? '' : false; render(); }
  });
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'cust-f-status') { filter.status = t.value; return render(); }
    if (t.id === 'cust-f-source') { filter.source = t.value; return render(); }
    if (t.id === 'cust-f-country') { filter.country = t.value; return render(); }
    const find = (key) => customers.find((c) => c.id === t.dataset[key]);
    if (t.dataset.custStatus) { const c = find('custStatus'); if (c) patchCustomer(c, { status: t.value }, `상태를 "${t.value}"로 바꿨습니다.`); }
    if (t.dataset.custNext) { const c = find('custNext'); if (c) patchCustomer(c, { next_contact: t.value }, t.value ? '다음 연락일을 저장했습니다.' : '다음 연락일을 지웠습니다.'); }
    if (t.dataset.custExport) { const c = find('custExport'); if (c) patchCustomer(c, { export_stage: t.value }, '수출 진행 단계를 저장했습니다.'); }
  });
  root.addEventListener('input', (e) => {
    if (e.target.id === 'cust-q') { filter.q = e.target.value; render(); }
  });

  // 매물 목록의 "관심 고객 N" 표시를 누르면 그 매물에 관심 있는 고객만 걸러서 보여준다
  document.addEventListener('click', (e) => {
    const chipBtn = e.target.closest('[data-interest-car]');
    if (!chipBtn) return;
    filter.car = chipBtn.dataset.interestCar;
    const tab = document.querySelector('.admin-tab[data-tab="customers"]');
    if (tab) tab.click(); // 고객 관리 탭으로 이동
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  async function download(kind) {
    try {
      let blob, name;
      const stamp = todayStr().replace(/-/g, '');
      if (kind === 'csv') {
        const token = KCarAuth.getToken();
        const res = await fetch('admin/customers.csv', { headers: { Authorization: 'Bearer ' + token } });
        if (!res.ok) throw new Error('내려받지 못했습니다.');
        blob = await res.blob();
        name = `fromkcar_customers_${stamp}.csv`;
      } else {
        blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), customers }, null, 2)], { type: 'application/json' });
        name = `fromkcar_customers_backup_${stamp}.json`;
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (err) {
      KCarUtil.toast(err.message || '내려받지 못했습니다.', 'error');
    }
  }

  window.KCarCustomers = { countFor: (carId) => interestedIn(carId).length, interestedIn };

  // 매물 목록이 준비되거나 로그인하면 고객 목록도 불러온다
  document.addEventListener('adminlistloaded', () => { if (loaded) render(); else load(); });
  document.addEventListener('adminlogin', load);
  load();
})();
