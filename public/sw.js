const CACHE_VERSION = "tex-electronic-shell-v1";
const APP_SHELL = [
  "/",
  "/staff",
  "/store",
  "/favicon.svg",
  "/icons/shop-192.png",
  "/icons/shop-512.png",
  "/icons/staff-192.png",
  "/icons/staff-512.png",
  "/store.webmanifest",
  "/staff.webmanifest",
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

const isStaticAsset = request => ["style", "script", "image", "font"].includes(request.destination);

self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cachedPage = await caches.match(request);
          if (cachedPage) return cachedPage;
          return caches.match(url.pathname.startsWith("/store") ? "/store" : "/");
        }),
    );
    return;
  }

  if (!isStaticAsset(request)) return;
  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (!response.ok) return response;
      const copy = response.clone();
      caches.open(CACHE_VERSION).then(cache => cache.put(request, copy));
      return response;
    })),
  );
});
