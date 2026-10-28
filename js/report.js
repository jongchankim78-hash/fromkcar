/**
 * FROM K CAR — 관리자 "사이트 리포트" 탭.
 * /admin/report가 돌려주는 매물 현황 + 방문/조회/문의 집계를 화면에 그린다.
 */
(function () {
  const esc = (s) => KCarUtil.escapeHtml(String(s == null ? '' : s));
  const num = (n) => Number(n || 0).toLocaleString('ko-KR');

  const LANG_LABEL = { ko: '한국어', ru: '러시아어', mn: '몽골어', en: '영어' };
  const DEVICE_LABEL = { mobile: '모바일', desktop: 'PC' };
  const CHANNEL_LABEL = {
    whatsapp: 'WhatsApp', telegram: '텔레그램 문의', telegram_channel: '텔레그램 채널',
    instagram: '인스타그램', kakao: '카카오톡', phone: '전화', email: '이메일'
  };

  // 링크에 붙인 ?src=꼬리표(예: 블로그 글)는 알아보기 쉬운 이름으로 보여준다.
  const SRC_LABEL = { naver_blog: '네이버 블로그 링크' };
  function refLabel(name) {
    if (name === 'direct') return '직접 / 알 수 없음';
    if (name.startsWith('src:')) return SRC_LABEL[name.slice(4)] || `링크 꼬리표: ${name.slice(4)}`;
    return name;
  }

  const tabButtons = document.querySelectorAll('.admin-tab');
  const listingsTab = document.getElementById('tab-listings');
  const reportTab = document.getElementById('tab-report');
  const bodyEl = document.getElementById('report-body');
  const sinceEl = document.getElementById('report-since');
  const rangeEl = document.getElementById('report-range');
  const refreshBtn = document.getElementById('report-refresh');
  if (!reportTab) return;

  function showTab(name) {
    const isReport = name === 'report';
    listingsTab.classList.toggle('hidden', isReport);
    reportTab.classList.toggle('hidden', !isReport);
    tabButtons.forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    history.replaceState(null, '', isReport ? '#report' : location.pathname + location.search);
    if (isReport) loadReport();
  }

  tabButtons.forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  rangeEl.addEventListener('change', loadReport);
  refreshBtn.addEventListener('click', loadReport);

  function kpi(label, value, sub) {
    return `<div class="rp-card"><div class="rp-kpi-label">${esc(label)}</div><div class="rp-kpi-value">${value}</div>${sub ? `<div class="rp-kpi-sub">${esc(sub)}</div>` : ''}</div>`;
  }

  function bars(list, labelOf) {
    if (!list.length) return '<p class="rp-empty">아직 기록이 없습니다.</p>';
    const max = Math.max(...list.map((i) => i.count), 1);
    return list.map((i) => `
      <div class="rp-bar-row">
        <div class="rp-bar-name" title="${esc(labelOf(i.name))}">${esc(labelOf(i.name))}</div>
        <div class="rp-bar-track"><div class="rp-bar-fill" style="width:${Math.max(3, Math.round(i.count / max * 100))}%"></div></div>
        <div class="rp-bar-num">${num(i.count)}</div>
      </div>`).join('');
  }

  function dailyChart(daily) {
    const max = Math.max(...daily.map((d) => d.visits), 1);
    const cols = daily.map((d) => {
      const h = d.visits ? Math.max(2, Math.round(d.visits / max * 100)) : 0;
      const tip = `${d.date}  방문 ${d.visits} · 순방문자 ${d.visitors} · 조회 ${d.views} · 문의 ${d.contacts}`;
      return `<div class="rp-chart-col" title="${esc(tip)}"><div class="rp-chart-bar" style="height:${h}%"></div></div>`;
    }).join('');
    const first = daily[0].date.slice(5);
    const last = daily[daily.length - 1].date.slice(5);
    return `<div class="rp-chart">${cols}</div><div class="rp-chart-axis"><span>${first}</span><span>일별 방문 (막대에 마우스를 올리면 상세)</span><span>${last}</span></div>`;
  }

  function carsTable(list) {
    if (!list.length) return '<p class="rp-empty">아직 기록이 없습니다.</p>';
    const rows = list.map((c) => {
      const title = c.title
        ? `<a href="/car/${encodeURIComponent(c.id)}" target="_blank" rel="noopener" class="hover:underline text-[var(--fk-blue)] font-semibold">${esc(c.title)}</a>`
        : '<span class="text-[var(--fk-gray-400)]">(삭제된 매물)</span>';
      const no = c.listing_no ? `<span class="text-[var(--fk-gray-400)] mr-1">No.${c.listing_no}</span>` : '';
      return `<tr class="border-b border-[var(--fk-gray-100)]">
        <td class="py-2 pr-3">${no}${title}${c.status === '판매완료' ? ' <span class="text-[11px] text-[var(--fk-gray-400)]">(판매완료)</span>' : ''}</td>
        <td class="py-2 pr-3 text-right font-bold">${num(c.views)}</td>
        <td class="py-2 text-right font-bold">${num(c.contacts)}</td>
      </tr>`;
    }).join('');
    return `<div class="overflow-x-auto"><table class="w-full text-sm">
      <thead><tr class="text-left text-xs text-[var(--fk-gray-600)] border-b border-[var(--fk-gray-200)]">
        <th class="py-2 pr-3">매물</th><th class="py-2 pr-3 text-right">상세 조회</th><th class="py-2 text-right">문의 클릭</th>
      </tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function recentList(list) {
    if (!list.length) return '<p class="rp-empty">등록된 매물이 없습니다.</p>';
    return list.map((c) => {
      const d = c.created_at ? new Date(c.created_at).toLocaleDateString('ko-KR') : '-';
      return `<div class="flex justify-between gap-3 text-sm py-1.5 border-b border-[var(--fk-gray-100)] last:border-0">
        <span class="truncate">${esc(c.title)}</span><span class="text-[var(--fk-gray-400)] flex-shrink-0">${d}</span></div>`;
    }).join('');
  }

  function render(data) {
    const L = data.listings;
    const T = data.traffic;
    const pct = (n) => (L.on_sale ? Math.round(n / L.on_sale * 100) + '%' : '-');
    const avg = L.avg_price_man ? num(L.avg_price_man) + '만원' : '-';
    const days = T.range_days;

    sinceEl.textContent = T.tracking_since
      ? `방문 기록 시작일: ${T.tracking_since} (한국 시간 기준 · 관리자 접속은 제외)`
      : '방문 기록이 아직 없습니다. 이번 배포 이후부터 쌓이기 시작합니다.';

    bodyEl.innerHTML = `
      <h2 class="rp-title !text-base">최근 ${days}일 방문 현황</h2>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        ${kpi('방문 수', num(T.totals.visits), '탭을 열 때마다 1회')}
        ${kpi('순방문자', num(T.totals.visitors), '같은 브라우저는 1명')}
        ${kpi('매물 상세 조회', num(T.totals.views), '매물을 열어본 횟수')}
        ${kpi('문의 클릭', num(T.totals.contacts), '전화·카톡·텔레그램 등')}
      </div>
      <div class="rp-card mb-4">
        <div class="rp-title">일별 방문 추이</div>
        ${dailyChart(T.daily)}
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <div class="rp-card"><div class="rp-title">언어별 방문</div>${bars(T.langs, (n) => LANG_LABEL[n] || n)}</div>
        <div class="rp-card"><div class="rp-title">유입 경로</div>${bars(T.refs, refLabel)}</div>
        <div class="rp-card"><div class="rp-title">기기</div>${bars(T.devices, (n) => DEVICE_LABEL[n] || n)}</div>
      </div>

      <h2 class="rp-title !text-base">문의 · 인기 매물 (최근 ${days}일)</h2>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <div class="rp-card"><div class="rp-title">문의 채널별 클릭</div>${bars(T.contacts, (n) => CHANNEL_LABEL[n] || n)}</div>
        <div class="rp-card lg:col-span-2"><div class="rp-title">인기 매물 TOP 10</div>${carsTable(T.top_cars)}</div>
      </div>

      <h2 class="rp-title !text-base">매물 현황 (현재)</h2>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        ${kpi('전체 매물', num(L.total))}
        ${kpi('판매중', num(L.on_sale), `판매완료 ${num(L.sold)}건`)}
        ${kpi('판매중 평균 가격', avg)}
        ${kpi('무사고 / 무도색', `${pct(L.no_accident)} / ${pct(L.no_paint)}`, '판매중 매물 기준')}
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="rp-card"><div class="rp-title">브랜드별 매물</div>${bars(L.brands, (n) => n)}</div>
        <div class="rp-card"><div class="rp-title">최근 등록</div>${recentList(L.recent)}
          ${L.no_photo ? `<p class="text-xs text-[var(--fk-red)] mt-3">사진이 없는 매물 ${L.no_photo}건</p>` : ''}</div>
      </div>`;
  }

  async function loadReport() {
    const token = window.KCarAuth && KCarAuth.getToken();
    if (!token) return;
    bodyEl.innerHTML = '<p class="rp-empty py-10 text-center">불러오는 중…</p>';
    try {
      const res = await fetch(`admin/report?days=${encodeURIComponent(rangeEl.value)}`, {
        headers: { Authorization: 'Basic ' + token }
      });
      if (res.status === 401) {
        KCarAuth.clearToken();
        KCarAuth.showGate();
        return;
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      render(await res.json());
    } catch (e) {
      bodyEl.innerHTML = `<p class="rp-empty py-10 text-center">리포트를 불러오지 못했습니다. (${esc(e.message)})</p>`;
    }
  }

  if (location.hash === '#report') showTab('report');
})();
