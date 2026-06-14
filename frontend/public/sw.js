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

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("install", () => {
  self.skipWaiting();
});
