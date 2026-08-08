/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { ExpirationPlugin } from "workbox-expiration";
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";

import { SPA_NAVIGATION_DENYLIST } from "./serviceWorkerRoutes";

declare const self: ServiceWorkerGlobalScope;

clientsClaim();
self.skipWaiting();
cleanupOutdatedCaches();

// Precache and route the versioned application shell.
precacheAndRoute(self.__WB_MANIFEST || []);

// Keep client-side routes such as /staff/pos available when the device starts
// offline. API and socket requests must never fall back to index.html.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    denylist: SPA_NAVIGATION_DENYLIST,
  }),
);

// Public menu data is safe to cache. Authenticated table/session/order APIs are
// intentionally excluded and use the POS IndexedDB snapshots/outbox instead.
registerRoute(
  ({ request, url }) =>
    request.method === "GET" &&
    url.origin === self.location.origin &&
    url.pathname.startsWith("/api/v1/menu/public/"),
  new NetworkFirst({
    cacheName: "pos-public-menu-v1",
    networkTimeoutSeconds: 4,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 80,
        maxAgeSeconds: 7 * 24 * 60 * 60,
        purgeOnQuotaError: true,
      }),
    ],
  }),
);

// Listen to incoming push events
self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;

  try {
    const data = event.data.json();

    event.waitUntil(
      self.registration.showNotification(data.title || "New Order Received!", {
        body: data.body || "Open the dashboard to view.",
        icon: "/logo192.png",
        badge: "/logo192.png",
        tag: "new-order",
        requireInteraction: true,
        // Use the URL the server sent (push.service sends { title, body, url });
        // clicking the notification should open THAT route, not a hardcoded one.
        data: { url: data.url || "/orders" },
      }),
    );
  } catch (err) {
    console.error("Error handling push event:", err);
  }
});

// Handle notification clicks
self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes(targetUrl) && "focus" in client) {
            return (client as WindowClient).focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      }),
  );
});
