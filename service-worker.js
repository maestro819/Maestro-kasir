// Service worker Maestro Pay
// Cache "app shell" biar bisa dibuka offline. Data transaksi/produk tetap
// disimpan aplikasi sendiri di localStorage (sudah ada di kode aslinya),
// jadi kasir tetap bisa jualan walau internet mati, lalu sinkron lagi
// begitu online.

const CACHE_NAME = 'maestro-pay-shell-v5';

// File dari domain sendiri
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];

// Library CDN eksternal yang WAJIB ada supaya tampilan & fitur app jalan
// normal walau offline (Tailwind, Google Fonts, Supabase JS client, QR
// scanner). Ini beda dari request DATA ke Supabase (misal ambil transaksi),
// itu tetap harus online karena datanya dinamis.
const EXTERNAL_SHELL_FILES = [
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;700;800&family=Inter:wght@400;500;600;700;800&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
];

// Install: simpan file utama + library eksternal ke cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(SHELL_FILES);
      // Tambah satu-satu supaya kalau salah satu CDN gagal (mis. lagi
      // down), file lain tetap kesimpan, gak bikin instalasi SW gagal total
      await Promise.all(
        EXTERNAL_SHELL_FILES.map((url) =>
          fetch(url, { mode: 'cors' })
            .then((res) => {
              if (res && res.ok) return cache.put(url, res);
            })
            .catch(() => {})
        )
      );
    })
  );
  self.skipWaiting();
});

// Activate: buang cache versi lama
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Daftar host CDN yang file-nya kita anggap "app shell" (statis, boleh
// cache-first). Host lain (misal project Supabase buat data toko) TIDAK
// masuk sini supaya datanya tetap real-time saat online.
const SHELL_CDN_HOSTS = [
  'cdn.tailwindcss.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net',
  'unpkg.com'
];

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') {
    return;
  }

  const isOwnDomain = url.origin === self.location.origin;
  const isShellCdn = SHELL_CDN_HOSTS.includes(url.hostname);

  if (!isOwnDomain && !isShellCdn) {
    // Request ke luar yang BUKAN shell CDN (misal Supabase API data toko)
    // -> biarkan lewat langsung ke network, jangan diintervensi
    return;
  }

  // Domain sendiri ATAU shell CDN -> cache-first, update cache di belakang
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request, isShellCdn ? { mode: 'cors' } : undefined)
        .then((response) => {
          if (response && (response.status === 200 || response.type === 'opaque')) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});
