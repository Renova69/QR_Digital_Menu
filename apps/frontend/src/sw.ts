/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

// Precache and route built assets
precacheAndRoute(self.__WB_MANIFEST || []);

// Listen to incoming push events
self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return;

  try {
    const data = event.data.json();

    event.waitUntil(
      self.registration.showNotification(data.title || 'New Order Received!', {
        body: data.body || 'Open the dashboard to view.',
        icon: '/logo192.png',
        badge: '/logo192.png',
        tag: 'new-order',
        requireInteraction: true,
        data: { url: '/orders' }
      })
    );
  } catch (err) {
    console.error('Error handling push event:', err);
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return (client as WindowClient).focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
