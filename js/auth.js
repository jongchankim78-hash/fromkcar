/**
 * FROM K CAR — 관리자 페이지 비밀번호 게이트
 * 주의: 이 인증은 "클라이언트 측 간단 잠금"입니다. 완전한 보안이 필요하면
 * Hosted 배포 시 Access Rules(접근 제어)로 서버 단에서 경로를 보호하는 것을 권장합니다.
 */
(function () {
  const ADMIN_PASSWORD = '4887asdf';
  const SESSION_KEY = 'fkcar_admin_authed';

  const gate = document.getElementById('admin-login-gate');
  const content = document.getElementById('admin-content');
  const form = document.getElementById('admin-login-form');
  const input = document.getElementById('admin-password-input');
  const errorEl = document.getElementById('admin-login-error');
  const logoutBtn = document.getElementById('admin-logout-btn');

  function showContent() {
    gate.classList.add('hidden');
    content.classList.remove('hidden');
  }

  function showGate() {
    content.classList.add('hidden');
    gate.classList.remove('hidden');
    setTimeout(() => input && input.focus(), 50);
  }

  // 이미 인증된 세션이면 바로 통과
  if (sessionStorage.getItem(SESSION_KEY) === 'true') {
    showContent();
  } else {
    showGate();
  }

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const value = input.value;
      if (value === ADMIN_PASSWORD) {
        sessionStorage.setItem(SESSION_KEY, 'true');
        errorEl.classList.add('hidden');
        input.value = '';
        showContent();
      } else {
        errorEl.classList.remove('hidden');
        input.value = '';
        input.focus();
        input.closest('div').parentElement.classList.add('shake');
        setTimeout(() => input.closest('div').parentElement.classList.remove('shake'), 400);
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      sessionStorage.removeItem(SESSION_KEY);
      showGate();
    });
  }
})();
