import { api } from "@/lib/api";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function setupPushNotifications(): Promise<void> {
  if (!("Notification" in window)) return;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return;

  if ("serviceWorker" in navigator && "PushManager" in window) {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const vapidResponse = await api<{ public_key: string }>(
        "/api/notifications/vapid-public-key"
      );
      const pk = vapidResponse?.public_key || (vapidResponse as any)?.publicKey;
      if (!pk || !pk.length) {
        console.warn("Push: no VAPID public key, using Notification API fallback");
        return;
      }
      const applicationServerKey = urlBase64ToUint8Array(pk);

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey as BufferSource,
        });
      }

      const sub = subscription.toJSON();
      await api("/api/notifications/subscribe", {
        method: "POST",
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.keys?.p256dh,
            auth: sub.keys?.auth,
          },
          user_agent: navigator.userAgent,
        }),
      });
    } catch (err) {
      console.error("Push subscription failed:", err);
    }
  }
}

export function showBrowserNotification(title: string, body: string, data?: Record<string, unknown>) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") {
    Notification.requestPermission();
    return;
  }

  try {
    const notification = new Notification(title, { body, data, icon: "/icon-192.png" });
    notification.onclick = () => {
      window.focus();
      notification.close();
      if (data?.url) {
        window.location.href = data.url as string;
      }
    };
  } catch (err) {
    console.warn("Failed to show notification:", err);
  }
}
