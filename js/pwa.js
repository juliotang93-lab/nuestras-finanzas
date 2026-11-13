/* Nuestras Finanzas · Instalación y actualizaciones */
/* Mudanza: si NF_CONFIG.mudanza tiene la nueva dirección, la dirección vieja avisa y ofrece abrir la nueva */
(function () {
  'use strict';
  const nueva = window.NF_CONFIG && window.NF_CONFIG.mudanza;
  if (!nueva) return;
  let destino;
  try { destino = new URL(nueva); } catch (e) { return; }
  if (destino.origin === location.origin) return;
  const show = () => {
    if (document.getElementById('moveBar')) return;
    const bar = document.createElement('div');
    bar.className = 'move-bar'; bar.id = 'moveBar'; bar.setAttribute('role', 'alert');
    bar.innerHTML = '<strong>La app se mudó a una nueva dirección</strong><span>Ábrela allá, entra con Google y agrégala otra vez a la pantalla de inicio. Tus datos son los mismos.</span>';
    const a = document.createElement('a');
    a.href = destino.href; a.textContent = 'Abrir la nueva dirección'; a.rel = 'noopener';
    bar.appendChild(a);
    document.body.appendChild(bar);
  };
  if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
})();

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
