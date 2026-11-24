const CACHE_NAME = "wa-akg-static-v1";
const PRECACHE_ASSETS = [
  "/manifest.json",
  "/favicon.ico",
  "/icon.svg",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/icons/icon-maskable-192x192.png",
  "/icons/icon-maskable-512x512.png",
  "/apple-touch-icon.png",
];

// Precache static icon assets on install
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn("Failed to precache some assets:", err);
      });
    })
  );
});

// Clean up old caches on activate
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      ),
    ])
  );
});

// Fetch listener required for PWA installability criteria
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Skip APIs, websockets, and external links
  if (!url.protocol.startsWith("http")) return;
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/socket.io")) return;

  // Serve precached static assets cache-first
  if (PRECACHE_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
});

// Push notification listener
self.addEventListener("push", (event) => {
  if (!event.data) return;

  const data = event.data.json().catch(() => ({
    title: "WA-AKG Business",
    body: event.data?.text() || "Notifikasi baru",
  }));

  data.then((payload) => {
    const options = {
      body: payload.body || "",
      data: payload.data || {},
      tag: payload.tag || "default",
      vibrate: [200, 100, 200],
    };

    event.waitUntil(self.registration.showNotification(payload.title || "WA-AKG Business", options));
  });
});

// Notification click listener
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
