// سرویس‌ورکر ساده: پوسته‌ی برنامه را نگه می‌دارد تا باز شدن سریع‌تر شود
const CACHE = 'payk-shell-v1';
const SHELL = ['/', '/style.css', '/app.js', '/theme-boot.js', '/icon.svg', '/fonts/Vazirmatn.woff2'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/files') || url.pathname.startsWith('/ws')) return;
  // ابتدا شبکه، در صورت قطع بودن نسخه‌ی ذخیره‌شده
  e.respondWith(
    fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match('/')))
  );
});
