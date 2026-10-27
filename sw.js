/* Nuestras Finanzas · Service worker
   Guarda la app en el teléfono para que abra al instante y sin internet.
   Nunca guarda datos financieros: las consultas a Supabase siempre van a la red. */
const VERSION = 'nf-2.2.5';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/styles.css',
  'js/config.js', 'js/data.js', 'js/gate.js', 'js/insights.js', 'js/app.js', 'js/modules.js', 'js/pwa.js',
  'js/vendor/supabase.js', 'js/vendor/chart.umd.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k.startsWith('nf-')).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'activar') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Archivos de la app: primero la copia local, y se actualiza en segundo plano
  if (url.origin === location.origin) {
    if (url.search.includes('code=')) return; // regreso del inicio de sesión: siempre a la red
    // La página principal: primero internet (para recibir siempre la versión publicada), sin conexión la copia
    if (req.mode === 'navigate') {
      e.respondWith(caches.open(VERSION).then(cache =>
        fetch(req).then(res => { if (res.ok) cache.put('index.html', res.clone()); return res; })
          .catch(() => cache.match('index.html'))));
      return;
    }
    e.respondWith(caches.open(VERSION).then(async cache => {
      const hit = await cache.match(req);
      const net = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  // Tipografía: se guarda la primera vez
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(VERSION + '-fonts').then(async cache => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    }));
  }
  // Todo lo demás (Supabase, facturas) va directo a la red y no se guarda
});

/* Notificaciones en el teléfono (llegan aunque la app esté cerrada) */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Nuestras Finanzas', {
    body: d.body || '', tag: d.tag || undefined, renotify: !!d.tag,
    icon: 'icons/icon-192.png', badge: 'icons/favicon-32.png',
    data: { url: d.url || './' }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) {
      if (c.url.startsWith(self.registration.scope) && 'focus' in c) { if ('navigate' in c && c.url !== target) c.navigate(target).catch(() => {}); return c.focus(); }
    }
    return self.clients.openWindow(target);
  }));
});
