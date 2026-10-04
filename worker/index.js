// Código extra do service worker (next-pwa `customWorkerDir`): avisos push com o app fechado.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "SmartOS", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "SmartOS";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon-512.svg",
      badge: "/icon-512.svg",
      tag: data.tag || data.id || undefined,
      data: { url: data.url || "/routes" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/routes";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
