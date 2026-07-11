import api from '../lib/api';

// Helper to convert base64 VAPID key to Uint8Array required by subscribe
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function subscribeToPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push messaging is not supported in this browser.');
    return;
  }

  try {
    // 1. Request notification permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('Push notification permission denied.');
      return;
    }

    // 2. Get active service worker registration
    const registration = await navigator.serviceWorker.ready;

    // 3. Check for existing subscription
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      // Get public VAPID key from environment variables
      const vapidPublicKey = import.meta.env.VITE_PUBLIC_VAPID_KEY;
      if (!vapidPublicKey) {
        console.warn('VITE_PUBLIC_VAPID_KEY is not defined in environment.');
        return;
      }

      // Subscribe user
      const convertedKey = urlBase64ToUint8Array(vapidPublicKey);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey,
      });
    }

    // 4. Send subscription to backend
    await api.post('/push/subscribe', subscription);
    console.log('Successfully subscribed to Push Notifications.');
  } catch (error) {
    console.error('Failed to subscribe to Push Notifications:', error);
  }
}
