export function timeAgo(date: string | Date | null | undefined): string {
  if (!date) return "Baru";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "Baru";

  const now = Date.now();
  const diff = now - d.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "Baru";
  if (minutes < 60) return minutes + "m";
  if (hours < 24) return hours + "j";
  if (days < 7) return days + "h";

  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

export function formatPhone(phone: string): string {
  let cleaned = phone.replace(/[^0-9+]/g, "");
  if (cleaned.startsWith("0")) {
    cleaned = "+62" + cleaned.slice(1);
  }
  if (cleaned.startsWith("62") && !cleaned.startsWith("+")) {
    cleaned = "+" + cleaned;
  }
  if (!cleaned.startsWith("+")) {
    cleaned = "+" + cleaned;
  }

  const withoutPlus = cleaned.slice(1);
  if (withoutPlus.length <= 3) return cleaned;

  const prefix = withoutPlus.slice(0, 3);
  let rest = withoutPlus.slice(3);

  if (rest.length <= 4) {
    return "+" + prefix + " " + rest;
  }
  if (rest.length <= 8) {
    return "+" + prefix + " " + rest.slice(0, 4) + "-" + rest.slice(4);
  }

  return "+" + prefix + " " + rest.slice(0, 4) + "-" + rest.slice(4, 8) + "-" + rest.slice(8);
}

let audioCtx: AudioContext | null = null;

export function playBeep(): void {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.frequency.value = 880;
    oscillator.type = "sine";
    gainNode.gain.value = 0.1;
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.15);
  } catch {
    // Audio not supported
  }
}
