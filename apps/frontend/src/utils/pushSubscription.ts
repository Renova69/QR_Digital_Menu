import api from "../lib/api";

// Helper to convert base64 VAPID key to Uint8Array required by subscribe
function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/** Encode raw applicationServerKey bytes back to unpadded base64url. */
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return window
    .btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * True when an existing subscription was created with the CURRENT VAPID public
 * key. A subscription is bound to the applicationServerKey it was made with, so
 * after a key rotation (or when the old one came from an ephemeral server key)
 * the server can no longer sign pushes for it and delivery silently fails — the
 * caller must drop and re-subscribe.
 */
function subscriptionMatchesKey(
  subscription: PushSubscription,
  vapidPublicKey: string,
): boolean {
  const existing = subscription.options?.applicationServerKey;
  if (!existing) return false;
  return arrayBufferToBase64Url(existing) === vapidPublicKey.replace(/=+$/, "");
}

export async function subscribeToPushNotifications() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    console.warn("Push messaging is not supported in this browser.");
    return;
  }

  try {
    // 1. Request notification permission
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.log("Push notification permission denied.");
      return;
    }

    // 2. Get active service worker registration
    const registration = await navigator.serviceWorker.ready;

    // Public VAPID key from build-time env (must match the backend's private key)
    const vapidPublicKey = import.meta.env.VITE_PUBLIC_VAPID_KEY;
    if (!vapidPublicKey) {
      console.warn("VITE_PUBLIC_VAPID_KEY is not defined in environment.");
      return;
    }

    // 3. Check for an existing subscription, and drop it if it was created with
    // a different VAPID key (rotation / old ephemeral key) — otherwise it stays
    // bound to a key the server can't sign for and pushes never arrive.
    let subscription = await registration.pushManager.getSubscription();
    if (subscription && !subscriptionMatchesKey(subscription, vapidPublicKey)) {
      console.warn(
        "Existing push subscription uses a stale VAPID key — resubscribing.",
      );
      await subscription.unsubscribe();
      subscription = null;
    }

    if (!subscription) {
      const convertedKey = urlBase64ToUint8Array(vapidPublicKey);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey,
      });
    }

    // 4. Send subscription to backend. Serialize explicitly via toJSON() so the
    // wire shape is exactly { endpoint, expirationTime, keys: { p256dh, auth } }
    // — what push.service.createSubscription reads — instead of relying on axios
    // implicitly invoking PushSubscription.toJSON() during JSON.stringify.
    await api.post("/push/subscribe", subscription.toJSON());
    console.log("Successfully subscribed to Push Notifications.");
  } catch (error) {
    console.error("Failed to subscribe to Push Notifications:", error);
  }
}
