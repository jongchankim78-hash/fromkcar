/**
 * FROM K CAR — 공통 유틸리티 (토스트, 포맷터 등)
 */
(function (global) {
  function ensureToastContainer() {
    let el = document.getElementById('toast-container');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast-container';
      document.body.appendChild(el);
    }
    return el;
  }

  const ICONS = {
    success: '<i class="fa-solid fa-circle-check" style="color:#16a34a"></i>',
    error: '<i class="fa-solid fa-circle-exclamation" style="color:#e11d48"></i>',
    info: '<i class="fa-solid fa-circle-info" style="color:#3b82f6"></i>'
  };

  function toast(message, type = 'info', duration = 3500) {
    const container = ensureToastContainer();
    const el = document.createElement('div');
    el.className = `fk-toast ${type}`;
    el.innerHTML = `${ICONS[type] || ICONS.info}<div>${message}</div>`;
    container.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .3s ease, transform .3s ease';
      el.style.opacity = '0';
      el.style.transform = 'translateX(20px)';
      setTimeout(() => el.remove(), 300);
    }, duration);
  }

  function formatPrice(won) {
    if (won === null || won === undefined || won === '') return '가격문의';
    const man = Math.round(won / 10000);
    return man.toLocaleString('ko-KR') + '만원';
  }

  function formatMileage(km) {
    if (km === null || km === undefined || km === '') return '-';
    return Number(km).toLocaleString('ko-KR') + 'km';
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function debounce(fn, wait = 300) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  global.KCarUtil = { toast, formatPrice, formatMileage, escapeHtml, debounce };
})(window);
