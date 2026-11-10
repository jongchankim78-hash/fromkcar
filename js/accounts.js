/**
 * FROM K CAR — 관리자 "계정·보안" 탭.
 *  - 모두: 내 로그인 정보, 비밀번호 변경(직원 계정), 백업 코드 남은 개수
 *  - 대표 계정: 직원 계정 만들기, 비밀번호·2차 인증 초기화(휴대폰을 바꾸거나 잃어버렸을 때), 삭제
 */
(function () {
  const root = document.getElementById('tab-accounts');
  if (!root || !window.KCarAuth) return;

  const esc = (s) => KCarUtil.escapeHtml(String(s ?? ''));
  const fmtTime = (ts) => new Date(ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const inputCls = 'fk-input !py-2 text-sm';

  async function api(method, path, body) {
    const token = KCarAuth.getToken();
    const res = await fetch(path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    if (res.status === 401) { KCarAuth.clearToken(); KCarAuth.showGate(); throw new Error('로그인이 필요합니다.'); }
    const data = res.status === 204 ? null : await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data && data.error) || '요청에 실패했습니다.');
    return data;
  }

  // 헷갈리는 글자(0/O, 1/l/I)를 뺀 임시 비밀번호 12자
  function randomPassword() {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    return Array.from(bytes, (b) => chars[b % chars.length]).join('');
  }

  async function render() {
    const me = KCarAuth.info();
    if (!me) return;
    let session = {};
    let accounts = [];
    try {
      session = await api('GET', 'admin/session');
      if (me.role === 'owner') accounts = (await api('GET', 'admin/accounts')).data || [];
    } catch (e) {
      root.innerHTML = `<p class="text-sm text-[var(--fk-red)] py-6">${esc(e.message)}</p>`;
      return;
    }
    const owner = me.role === 'owner';
    root.innerHTML = `
      <section class="bg-white rounded-3xl shadow-sm border border-[var(--fk-gray-200)] p-6 sm:p-8 mb-6">
        <div class="flex items-center gap-3 mb-4"><div class="step-num"><i class="fa-solid fa-shield-halved text-sm"></i></div>
          <div><h2 class="text-lg font-bold text-[var(--fk-gray-800)]">내 계정</h2><p class="text-xs text-[var(--fk-gray-600)]">로그인은 ${fmtTime(session.expires_at)}까지 유지돼요 (최대 12시간).</p></div></div>
        <div class="grid sm:grid-cols-3 gap-3 text-sm">
          <div class="rounded-2xl border border-[var(--fk-gray-200)] bg-[var(--fk-gray-100)]/60 px-4 py-3"><p class="text-[11px] font-semibold text-[var(--fk-gray-600)]">아이디</p><p class="font-extrabold text-[var(--fk-navy)]">${esc(me.username)} <span class="text-xs font-bold text-[var(--fk-gray-600)]">${owner ? '(대표)' : '(직원)'}</span></p></div>
          <div class="rounded-2xl border border-[var(--fk-gray-200)] bg-[var(--fk-gray-100)]/60 px-4 py-3"><p class="text-[11px] font-semibold text-[var(--fk-gray-600)]">2차 인증</p><p class="font-extrabold text-green-700">사용 중</p></div>
          <div class="rounded-2xl border border-[var(--fk-gray-200)] bg-[var(--fk-gray-100)]/60 px-4 py-3"><p class="text-[11px] font-semibold text-[var(--fk-gray-600)]">남은 백업 코드</p><p class="font-extrabold ${session.backup_left <= 2 ? 'text-[var(--fk-red)]' : 'text-[var(--fk-navy)]'}">${session.backup_left}개</p>${session.backup_left <= 2 ? '<p class="text-[11px] text-[var(--fk-red)]">거의 다 썼어요. 대표에게 초기화를 요청해 새로 받으세요.</p>' : ''}</div>
        </div>
        ${owner ? '<p class="text-xs text-[var(--fk-gray-600)] mt-3">대표 비밀번호는 Render의 <b>ADMIN_PASSWORD</b> 환경변수에서 바꿔요.</p>' : `
        <form id="acc-pw-form" class="grid sm:grid-cols-4 gap-2 mt-4 items-end">
          <label class="text-xs font-semibold">현재 비밀번호<input name="op" type="password" autocomplete="current-password" required class="${inputCls} mt-1"></label>
          <label class="text-xs font-semibold">새 비밀번호 (10자 이상)<input name="np" type="password" autocomplete="new-password" minlength="10" required class="${inputCls} mt-1"></label>
          <label class="text-xs font-semibold">새 비밀번호 확인<input name="np2" type="password" autocomplete="new-password" minlength="10" required class="${inputCls} mt-1"></label>
          <button class="btn-secondary text-sm">비밀번호 변경</button></form>`}
      </section>
      ${owner ? `<section class="bg-white rounded-3xl shadow-sm border border-[var(--fk-gray-200)] p-6 sm:p-8">
        <h2 class="text-lg font-bold text-[var(--fk-gray-800)] mb-1">계정 관리</h2>
        <p class="text-xs text-[var(--fk-gray-600)] mb-4">직원 계정을 만들고 임시 비밀번호를 알려 주세요. 직원은 처음 로그인할 때 비밀번호를 바꾸고, 자기 휴대폰의 인증 앱에 등록합니다.</p>
        <div class="overflow-x-auto mb-5"><table class="w-full text-sm admin-table">
          <thead><tr class="text-left border-b border-[var(--fk-gray-200)]"><th class="py-2 pr-3">아이디</th><th class="py-2 pr-3">구분</th><th class="py-2 pr-3">2차 인증</th><th class="py-2 pr-3">상태</th><th class="py-2"></th></tr></thead>
          <tbody>${accounts.map((a) => `<tr class="border-b border-[var(--fk-gray-100)]">
            <td class="py-2.5 pr-3 font-bold">${esc(a.username)}</td><td class="py-2.5 pr-3">${a.role === 'owner' ? '대표' : '직원'}</td>
            <td class="py-2.5 pr-3">${a.totp_enabled ? '<span class="text-green-700 font-bold">등록됨</span>' : '<span class="text-amber-700 font-bold">아직 등록 안 함</span>'}</td>
            <td class="py-2.5 pr-3 text-xs text-[var(--fk-gray-600)]">${a.must_change_pw ? '비밀번호 변경 대기' : ''}</td>
            <td class="py-2.5 text-right whitespace-nowrap">${a.role === 'owner' ? '' : `<button type="button" data-acc-reset="${esc(a.username)}" class="btn-secondary !py-1.5 !px-3 text-xs mr-1.5">비밀번호·2차 인증 초기화</button><button type="button" data-acc-del="${esc(a.username)}" class="btn-danger !py-1.5 !px-3 text-xs"><i class="fa-solid fa-trash"></i></button>`}</td></tr>`).join('')}</tbody></table></div>
        <form id="acc-new-form" class="grid sm:grid-cols-4 gap-2 items-end">
          <label class="text-xs font-semibold">새 직원 아이디 (영문·숫자 3~24자)<input name="u" required pattern="[A-Za-z0-9_.\\-]{3,24}" class="${inputCls} mt-1" autocomplete="off"></label>
          <label class="text-xs font-semibold sm:col-span-2">임시 비밀번호 (10자 이상)<input name="p" required minlength="10" value="${randomPassword()}" class="${inputCls} mt-1 font-mono" autocomplete="off"></label>
          <button class="btn-primary text-sm"><i class="fa-solid fa-user-plus mr-1.5"></i>직원 계정 만들기</button></form>
      </section>` : ''}`;
  }

  root.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      if (f.id === 'acc-pw-form') {
        if (f.np.value !== f.np2.value) return KCarUtil.toast('새 비밀번호가 서로 달라요.', 'error');
        const r = await api('POST', 'admin/password', { old_password: f.op.value, new_password: f.np.value });
        KCarAuth.setToken(r.token);
        KCarUtil.toast('비밀번호를 바꿨어요. 다른 곳에 로그인된 기기는 로그아웃됩니다.', 'success', 5000);
        f.reset();
      } else if (f.id === 'acc-new-form') {
        const pw = f.p.value;
        await api('POST', 'admin/accounts', { username: f.u.value.trim(), password: pw });
        alert(`직원 계정을 만들었어요.\n\n아이디: ${f.u.value.trim()}\n임시 비밀번호: ${pw}\n\n이 비밀번호를 직원에게 안전하게 전달해 주세요. (이 창을 닫으면 다시 볼 수 없어요)`);
        render();
      }
    } catch (err) {
      KCarUtil.toast(err.message, 'error');
    }
  });

  root.addEventListener('click', async (e) => {
    const reset = e.target.closest('[data-acc-reset]');
    const del = e.target.closest('[data-acc-del]');
    try {
      if (reset) {
        const name = reset.dataset.accReset;
        const pw = prompt(`"${name}"의 비밀번호와 2차 인증을 초기화합니다.\n새 임시 비밀번호를 정해 주세요 (10자 이상).`, randomPassword());
        if (!pw) return;
        await api('POST', `admin/accounts/${encodeURIComponent(name)}/reset`, { password: pw });
        alert(`초기화했어요.\n\n아이디: ${name}\n임시 비밀번호: ${pw}\n\n다음 로그인 때 비밀번호를 바꾸고 인증 앱을 다시 등록하게 됩니다. 기존에 로그인된 기기는 로그아웃돼요.`);
        render();
      } else if (del) {
        const name = del.dataset.accDel;
        if (!confirm(`"${name}" 계정을 삭제할까요? 이 계정은 더 이상 로그인할 수 없습니다.`)) return;
        await api('DELETE', `admin/accounts/${encodeURIComponent(name)}`);
        KCarUtil.toast('계정을 삭제했어요.', 'success');
        render();
      }
    } catch (err) {
      KCarUtil.toast(err.message, 'error');
    }
  });

  // 탭을 열 때마다 새로 그린다
  document.querySelector('.admin-tab[data-tab="accounts"]').addEventListener('click', render);
  if (location.hash === '#accounts') render();
})();
