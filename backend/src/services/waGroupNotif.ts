import { getCsConfig } from "./csConfig.js";
import { sendWaMessage } from "./waGateway.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

function timestamp(): string {
  return new Date().toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

async function sendWaGroupNotif(message: string): Promise<void> {
  try {
    const csConfig = await getCsConfig();
    if (!csConfig.waGroupNotifEnabled || !csConfig.waGroupJid) return;
    await sendWaMessage(csConfig.waGroupJid, { text: message });
  } catch (err) {
    logger.error("[waGroupNotif] Failed to send group notification:", err);
  }
}

function fmtPhone(waNumber: string): string {
  return waNumber.startsWith("+") ? waNumber : "+" + waNumber;
}

export async function notifyNewCustomer(name: string, waNumber: string): Promise<void> {
  const msg = `[${timestamp()}] 🆕 *Pelanggan Baru*\n👤 Nama: ${name}\n📱 No: ${fmtPhone(waNumber)}`;
  await sendWaGroupNotif(msg);
}

export async function notifyEscalation(name: string, waNumber: string, convId: string): Promise<void> {
  const url = `${config.frontendUrl}/cs?tab=all&chatId=${convId}`;
  const msg = `[${timestamp()}] ⏳ *Request CS*\n👤 Nama: ${name}\n📱 No: ${fmtPhone(waNumber)}\n🔗 ${url}`;
  await sendWaGroupNotif(msg);
}

export async function notifyClaim(customerName: string, csName: string, convId: string): Promise<void> {
  const url = `${config.frontendUrl}/cs?tab=all&chatId=${convId}`;
  const msg = `[${timestamp()}] ✅ *Chat Diklaim*\n👤 Pelanggan: ${customerName}\n🧑‍💼 CS: ${csName}\n🔗 ${url}`;
  await sendWaGroupNotif(msg);
}

export async function notifyResolve(customerName: string, csName: string, rating: number | null | undefined, convId: string): Promise<void> {
  const url = `${config.frontendUrl}/cs?tab=all&chatId=${convId}`;
  const ratingStr = rating ? `⭐ ${rating}/5` : "⭐ Belum di-rating";
  const msg = `[${timestamp()}] ✅ *Chat Diselesaikan*\n👤 Pelanggan: ${customerName}\n🧑‍💼 CS: ${csName}\n${ratingStr}\n🔗 ${url}`;
  await sendWaGroupNotif(msg);
}
