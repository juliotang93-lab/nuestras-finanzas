/* Nuestras Finanzas · Instalación y actualizaciones */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator) || !(location.protocol === 'https:' || location.hostname === 'localhost')) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    const offer = worker => {
      if (document.getElementById('updateBar')) return;
      const bar = document.createElement('div');
      bar.className = 'update-bar'; bar.id = 'updateBar';
      bar.innerHTML = '<span>Hay una versión nueva</span><button type="button">Actualizar</button>';
      bar.querySelector('button').addEventListener('click', () => worker.postMessage('activar'));
      document.body.appendChild(bar);
    };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w && w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
      });
    });
    // Busca actualizaciones cada vez que se vuelve a la app
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(() => {});
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
})();
