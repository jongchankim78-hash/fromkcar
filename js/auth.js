/**
 * FROM K CAR — 관리자 페이지 로그인 게이트
 * 아이디+비번을 /admin/verify로 검증한 뒤, 통과하면 Basic Auth 토큰을 세션에 저장해
 * 이후 매물 등록/수정/삭제 요청에 KCarAuth.getToken()으로 실어 보낸다.
 * (서버는 WWW-Authenticate를 보내지 않으므로 브라우저 네이티브 로그인 창은 뜨지 않는다.)
 */
(function () {
  const SESSION_KEY = 'fkcar_admin_token';

  const gate = document.getElementById('admin-login-gate');
  const content = document.getElementById('admin-content');
  const card = document.getElementById('admin-login-card');
  const form = document.getElementById('admin-login-form');
  const userInput = document.getElementById('admin-username-input');
  const passInput = document.getElementById('admin-password-input');
  const errorEl = document.getElementById('admin-login-error');
  const submitBtn = document.getElementById('admin-login-submit');
  const logoutBtn = document.getElementById('admin-logout-btn');

  function showContent() {
    gate.classList.add('hidden');
    content.classList.remove('hidden');
  }

  function showGate() {
    content.classList.add('hidden');
    gate.classList.remove('hidden');
    setTimeout(() => userInput && userInput.focus(), 50);
  }

  function getToken() {
    return sessionStorage.getItem(SESSION_KEY);
  }

  function clearToken() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  if (getToken()) {
    showContent();
  } else {
    showGate();
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = userInput.value;
      const password = passInput.value;
      submitBtn.disabled = true;
      try {
        const res = await fetch('admin/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json().catch(() => ({ ok: false }));
        if (!res.ok || !data.ok) throw new Error('invalid credentials');

        sessionStorage.setItem(SESSION_KEY, btoa(`${username}:${password}`));
        errorEl.classList.add('hidden');
        userInput.value = '';
        passInput.value = '';
        showContent();
      } catch (err) {
        errorEl.classList.remove('hidden');
        passInput.value = '';
        passInput.focus();
        if (card) {
          card.classList.add('shake');
          setTimeout(() => card.classList.remove('shake'), 400);
        }
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      clearToken();
      showGate();
    });
  }

  window.KCarAuth = { getToken, clearToken, showGate };
})();
