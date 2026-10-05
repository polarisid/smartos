// Service worker leve SÓ para avisos push (registrado à parte do PWA, em /push-sw/): instala em milissegundos,
// sem depender do pré-cache pesado do service worker principal.

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
