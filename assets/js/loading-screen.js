/* GATASIA intro splash: shown once per browser tab session, on first entry. */
(function () {
  'use strict';
  try {
    if (sessionStorage.getItem('gatasiaSplashSeen') === '1') return;
    sessionStorage.setItem('gatasiaSplashSeen', '1');
  } catch (_) {}
  const overlay = document.createElement('div');
  overlay.id = 'gatasia-loading-screen';
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-label', 'Memuat GATASIA');
  overlay.innerHTML = '<div class="gls-inner"><div class="gls-emblem" aria-hidden="true">G</div><div class="gls-title">GATASIA</div><div class="gls-subtitle">Explorer Club Nusantara</div><div class="gls-route" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div><div class="gls-caption">Menyiapkan petualangan Nusantara...</div></div>';
  function dismiss() {
    if (!overlay.isConnected) return;
    overlay.classList.add('gatasia-loading-hide');
    window.setTimeout(() => overlay.remove(), 650);
  }
  function start() {
    document.body.appendChild(overlay);
    // Tampilkan minimal 3 detik agar animasi lebih terasa.
    window.setTimeout(dismiss, 3000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
