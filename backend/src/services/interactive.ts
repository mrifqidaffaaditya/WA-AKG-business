/**
 * Interactive WhatsApp messages (Native Flow).
 *
 * Baileys 6.7.x does NOT accept `{ interactiveMessage }` through
 * `sock.sendMessage()` (it falls through to `prepareWAMessageMedia` and throws
 * "Invalid media type"). The reliable path is `generateWAMessageFromContent()`
 * + `sock.relayMessage()` with the Native Flow additional nodes, which is what
 * this module builds.
 *
 * Adapted from the upstream WA-AKG interactive module, trimmed to what this
 * business panel needs: quick replies, URL/call/copy buttons and single-select
 * lists (menus).
 */
import {
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  jidNormalizedUser,
  WASocket,
  WAMessage,
} from "@whiskeysockets/baileys";
import { logger } from "../utils/logger.js";

/* ─────────────────────────────  Types  ───────────────────────────── */

export interface NativeButtonQuickReply {
  type?: "quick_reply";
  name?: "quick_reply";
  displayText?: string;
  id?: string;
  buttonParamsJson?: string;
}

export interface NativeButtonCtaUrl {
  type?: "cta_url";
  name?: "cta_url";
  displayText?: string;
  url?: string;
  merchantUrl?: string;
  buttonParamsJson?: string;
}

export interface NativeButtonCtaCall {
  type?: "cta_call";
  name?: "cta_call";
  displayText?: string;
  phoneNumber?: string;
  buttonParamsJson?: string;
}

export interface NativeButtonCtaCopy {
  type?: "cta_copy";
  name?: "cta_copy";
  displayText?: string;
  copyCode?: string;
  buttonParamsJson?: string;
}

export interface InteractiveRow {
  header?: string;
  title: string;
  description?: string;
  id: string;
}

export interface InteractiveSection {
  title: string;
  highlight_label?: string;
  rows: InteractiveRow[];
}

export interface NativeButtonSingleSelect {
  type?: "single_select";
  name?: "single_select";
  title?: string;
  sections?: InteractiveSection[];
  buttonParamsJson?: string;
}

export type AnyInteractiveButton =
  | NativeButtonQuickReply
  | NativeButtonCtaUrl
  | NativeButtonCtaCall
  | NativeButtonCtaCopy
  | NativeButtonSingleSelect
  | { name: string; buttonParamsJson: string };

export interface InteractiveOption {
  label: string;
  value?: string;
  description?: string;
  type?: "quick_reply" | "cta_url" | "cta_call" | "cta_copy";
  url?: string;
  phoneNumber?: string;
  copyCode?: string;
}

export interface InteractiveMessagePayload {
  /** Header text shown in bold above the body. */
  title?: string;
  body?: string;
  footer?: string;
  /** Optional image header (URL). Falls back to a text header on failure. */
  imageUrl?: string;
  buttons?: AnyInteractiveButton[];
}

/* ─────────────────────────────  Button normalizer  ───────────────────────────── */

/**
 * Convert any supported button shape into WhatsApp Native Flow buttons
 * (`{ name, buttonParamsJson }`).
 */
export function formatNativeButtons(buttons: AnyInteractiveButton[]): {
  name: string;
  buttonParamsJson: string;
}[] {
  if (!Array.isArray(buttons)) return [];

  return buttons
    .map((btn) => {
      if (!btn || typeof btn !== "object") return null;

      const anyBtn = btn as Record<string, any>;

      // Already in canonical form.
      if (anyBtn.name && typeof anyBtn.buttonParamsJson === "string") {
        return { name: anyBtn.name, buttonParamsJson: anyBtn.buttonParamsJson };
      }
      if (anyBtn.name && anyBtn.buttonParamsJson && typeof anyBtn.buttonParamsJson === "object") {
        return { name: anyBtn.name, buttonParamsJson: JSON.stringify(anyBtn.buttonParamsJson) };
      }

      const type = anyBtn.type || anyBtn.name;

      if (type === "quick_reply") {
        const displayText = anyBtn.displayText || anyBtn.display_text || anyBtn.text || "";
        const id = anyBtn.id || displayText;
        return {
          name: "quick_reply",
          buttonParamsJson: JSON.stringify({ display_text: displayText, id }),
        };
      }

      if (type === "cta_url") {
        const displayText = anyBtn.displayText || anyBtn.display_text || "";
        const url = anyBtn.url || "";
        return {
          name: "cta_url",
          buttonParamsJson: JSON.stringify({
            display_text: displayText,
            url,
            merchant_url: anyBtn.merchantUrl || anyBtn.merchant_url || url,
          }),
        };
      }

      if (type === "cta_call") {
        const displayText = anyBtn.displayText || anyBtn.display_text || "";
        return {
          name: "cta_call",
          buttonParamsJson: JSON.stringify({
            display_text: displayText,
            phone_number: anyBtn.phoneNumber || anyBtn.phone_number || "",
          }),
        };
      }

      if (type === "cta_copy") {
        const displayText = anyBtn.displayText || anyBtn.display_text || "Salin";
        return {
          name: "cta_copy",
          buttonParamsJson: JSON.stringify({
            display_text: displayText,
            copy_code: anyBtn.copyCode || anyBtn.copy_code || "",
          }),
        };
      }

      if (type === "single_select") {
        const sections = (anyBtn.sections || []).map((sec: any) => ({
          title: sec.title || "",
          highlight_label: sec.highlight_label || "",
          rows: (sec.rows || []).map((row: any) => ({
            header: row.header || "",
            title: row.title || "",
            description: row.description || "",
            id: row.id || row.title || "",
          })),
        }));
        return {
          name: "single_select",
          buttonParamsJson: JSON.stringify({
            title: anyBtn.title || "Pilih Opsi",
            sections,
          }),
        };
      }

      // Unknown shape — keep it but make it serialisable.
      return {
        name: anyBtn.name || "quick_reply",
        buttonParamsJson: JSON.stringify(anyBtn),
      };
    })
    .filter((b): b is { name: string; buttonParamsJson: string } => Boolean(b));
}

/* ─────────────────────────────  Friendly payload normalization  ───────────────────────────── */

function optionLabel(option: InteractiveOption): string {
  return option?.label || "";
}

function optionToButton(option: InteractiveOption): AnyInteractiveButton | null {
  const label = optionLabel(option);
  if (!label) return null;

  if (option.type === "cta_url" || option.url) {
    return { type: "cta_url", displayText: label, url: option.url || option.value || "" };
  }
  if (option.type === "cta_call" || option.phoneNumber) {
    return { type: "cta_call", displayText: label, phoneNumber: option.phoneNumber || option.value || "" };
  }
  if (option.type === "cta_copy" || option.copyCode) {
    return { type: "cta_copy", displayText: label, copyCode: option.copyCode || option.value || "" };
  }
  return { type: "quick_reply", displayText: label, id: option.value || label };
}

/**
 * Turn a flat list of options into quick replies (≤3) or a single-select list
 * (>3). This is what the AI tool and the CS presets use.
 */
export function optionsToButtons(
  options: InteractiveOption[],
  listTitle = "Lihat Pilihan"
): AnyInteractiveButton[] {
  const clean = (Array.isArray(options) ? options : []).filter((o) => o && optionLabel(o)).slice(0, 10);

  if (clean.length === 0) return [];
  if (clean.length <= 3) {
    return clean.map(optionToButton).filter(Boolean) as AnyInteractiveButton[];
  }

  return [
    {
      type: "single_select",
      title: listTitle,
      sections: [
        {
          title: "Pilihan",
          rows: clean.map((o) => ({
            id: o.value || o.label,
            title: o.label,
            description: o.description || "",
          })),
        },
      ],
    },
  ];
}

/**
 * Accept the many payload shapes the UI/API may send and normalize them into
 * one canonical interactive payload.
 */
export function normalizeInteractivePayload(input: any): InteractiveMessagePayload {
  if (!input || typeof input !== "object") return { body: "" };

  const title = typeof input.title === "string" ? input.title : "";
  const header = typeof input.header === "string" ? input.header : title;
  const body =
    typeof input.body === "string"
      ? input.body
      : typeof input.body?.text === "string"
      ? input.body.text
      : typeof input.message === "string"
      ? input.message
      : "";
  const footer =
    typeof input.footer === "string"
      ? input.footer
      : typeof input.footer?.text === "string"
      ? input.footer.text
      : "";

  let buttons: AnyInteractiveButton[] = [];

  if (Array.isArray(input.buttons) && input.buttons.length > 0) {
    buttons = input.buttons;
  } else if (input.list && Array.isArray(input.list.sections)) {
    buttons = [
      {
        type: "single_select",
        title: input.list.buttonText || input.list.title || "Lihat Pilihan",
        sections: input.list.sections,
      },
    ];
  } else if (Array.isArray(input.sections)) {
    buttons = [
      {
        type: "single_select",
        title: input.listButtonText || "Lihat Pilihan",
        sections: input.sections,
      },
    ];
  } else if (Array.isArray(input.options)) {
    buttons = optionsToButtons(input.options, input.listTitle || "Lihat Pilihan");
  }

  return {
    title,
    body,
    footer,
    imageUrl: input.imageUrl || input.image_url || undefined,
    buttons,
  };
}

/* ─────────────────────────────  Presets / builders  ───────────────────────────── */

export function buildOptionsPayload(params: {
  title?: string;
  body: string;
  footer?: string;
  options: InteractiveOption[];
  listTitle?: string;
}): InteractiveMessagePayload {
  return {
    title: params.title,
    body: params.body,
    footer: params.footer,
    buttons: optionsToButtons(params.options, params.listTitle || "Lihat Pilihan"),
  };
}

export function buildConfirmationPayload(params: {
  customerName?: string;
  body?: string;
  footer?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  askCsLabel?: string;
}): InteractiveMessagePayload {
  const name = params.customerName ? ` ${params.customerName}` : "";
  return {
    title: "Konfirmasi",
    body:
      params.body ||
      `Halo${name}, apakah Anda ingin melanjutkan pesanan ini?`,
    footer: params.footer || "Pilih salah satu tombol di bawah",
    buttons: [
      { type: "quick_reply", displayText: params.confirmLabel || "✅ Ya, Lanjutkan", id: "confirm_yes" },
      { type: "quick_reply", displayText: params.cancelLabel || "❌ Batalkan", id: "confirm_no" },
      { type: "quick_reply", displayText: params.askCsLabel || "💬 Tanya CS", id: "ask_cs" },
    ],
  };
}

export function buildOfferPayload(params: {
  title?: string;
  body?: string;
  footer?: string;
  ctaUrl?: string;
  ctaLabel?: string;
  promoCode?: string;
  phoneNumber?: string;
}): InteractiveMessagePayload {
  const buttons: AnyInteractiveButton[] = [];
  if (params.ctaUrl) {
    buttons.push({
      type: "cta_url",
      displayText: params.ctaLabel || "🌐 Lihat Penawaran",
      url: params.ctaUrl,
    });
  }
  if (params.promoCode) {
    buttons.push({
      type: "cta_copy",
      displayText: `📋 Salin Kode: ${params.promoCode}`,
      copyCode: params.promoCode,
    });
  }
  if (params.phoneNumber) {
    buttons.push({ type: "cta_call", displayText: "📞 Hubungi Kami", phoneNumber: params.phoneNumber });
  }
  if (buttons.length === 0) {
    buttons.push({ type: "quick_reply", displayText: "💬 Saya Tertarik", id: "offer_interested" });
    buttons.push({ type: "quick_reply", displayText: "Tanya Detail", id: "offer_detail" });
  }

  return {
    title: params.title || "Penawaran Spesial 🎉",
    body:
      params.body ||
      "Ada penawaran spesial untuk Anda hari ini. Tekan tombol di bawah untuk melihat detailnya.",
    footer: params.footer || "Penawaran terbatas",
    buttons,
  };
}

export function buildMenuPayload(params: {
  title?: string;
  body?: string;
  footer?: string;
  listTitle?: string;
  sections: InteractiveSection[];
}): InteractiveMessagePayload {
  return {
    title: params.title || "Menu Kami",
    body: params.body || "Silakan pilih menu yang ingin Anda lihat:",
    footer: params.footer || "Pilih dari daftar",
    buttons: [
      {
        type: "single_select",
        title: params.listTitle || "📋 Buka Menu",
        sections: params.sections,
      },
    ],
  };
}

/* ─────────────────────────────  Content builder  ───────────────────────────── */

/**
 * Checks if the message content is an interactive type
 */
export function isInteractiveContent(content: any): boolean {
  if (!content || typeof content !== "object") return false;
  return Boolean(
    content.interactiveMessage ||
    content.buttonsMessage ||
    content.listMessage ||
    content.templateMessage
  );
}

/**
 * Normalizes any phone number or JID into standard WhatsApp format
 */
export function normalizeTargetJid(jid: string): string {
  if (!jid) return jid;
  if (jid.endsWith("@g.us") || jid.endsWith("@newsletter")) return jid;
  const clean = jid.replace(/[^0-9]/g, "");
  if (jid.includes("@s.whatsapp.net")) {
    return jidNormalizedUser(jid);
  }
  if (clean) {
    return `${clean}@s.whatsapp.net`;
  }
  return jid;
}

/**
 * Build the proto content object for an interactive message. Media headers are
 * best-effort: if the image cannot be prepared we keep the text header so the
 * message is never lost.
 */
export async function buildInteractiveContent(
  sock: WASocket,
  payload: InteractiveMessagePayload
): Promise<any> {
  const normalized = normalizeInteractivePayload(payload);
  const headerText = normalized.title || "";
  let headerMedia: any = null;

  if (normalized.imageUrl) {
    try {
      headerMedia = await prepareWAMessageMedia(
        { image: { url: normalized.imageUrl } },
        { upload: (sock as any).waUploadToServer }
      );
    } catch (err) {
      logger.warn("[interactive] Failed to prepare image header, using text header:", err);
    }
  }

  const interactiveHeader: any = headerMedia
    ? {
        title: headerText || "",
        hasMediaAttachment: true,
        subtitle: "",
        ...headerMedia,
      }
    : headerText
    ? {
        title: headerText,
        hasMediaAttachment: false,
        subtitle: "",
      }
    : undefined;

  const buttons = formatNativeButtons(normalized.buttons || []);

  const interactiveMessage: any = {
    body: { text: normalized.body || "" },
    footer: normalized.footer ? { text: normalized.footer } : undefined,
    header: interactiveHeader,
    nativeFlowMessage: {
      buttons,
      messageParamsJson: "",
      messageVersion: 1,
    },
  };

  return { interactiveMessage };
}

/**
 * Additional binary nodes WhatsApp expects for Native Flow rendering.
 */
export function buildNativeFlowAdditionalNodes(_targetJid: string, buttonName = "mixed"): any[] {
  return [
    {
      tag: "biz",
      attrs: {
        actual_actors: "2",
        host_storage: "2",
        privacy_mode_ts: String(Math.floor(Date.now() / 1000)),
      },
      content: [
        {
          tag: "interactive",
          attrs: { type: "native_flow", v: "1" },
          content: [
            {
              tag: "native_flow",
              attrs: { name: buttonName || "mixed", v: "9" },
            },
          ],
        },
        {
          tag: "quality_control",
          attrs: { source_type: "third_party" },
        },
      ],
    },
  ];
}

/**
 * Send an interactive message. Returns the generated WAMessage.
 */
export async function relayInteractiveMessage(
  sock: WASocket,
  rawTargetJid: string,
  payload: InteractiveMessagePayload,
  options: { quoted?: WAMessage } = {}
): Promise<WAMessage> {
  const targetJid = normalizeTargetJid(rawTargetJid);
  const content = await buildInteractiveContent(sock, payload);
  const normalized = normalizeInteractivePayload(payload);
  const buttons = formatNativeButtons(normalized.buttons || []);
  const buttonName = buttons.length === 1 && buttons[0].name ? buttons[0].name : "mixed";
  const additionalNodes = buildNativeFlowAdditionalNodes(targetJid, buttonName);

  const userJid = (sock as any).user?.id
    ? jidNormalizedUser((sock as any).user.id)
    : undefined;

  const msg = generateWAMessageFromContent(targetJid, content, {
    ...(userJid ? { userJid } : {}),
    ...(options.quoted ? { quoted: options.quoted } : {}),
  } as any);

  await sock.relayMessage(targetJid, msg.message!, {
    messageId: msg.key.id!,
    additionalNodes,
  } as any);

  try {
    sock.ev.emit("messages.upsert", {
      messages: [msg],
      type: "append",
    });
  } catch (e) {
    logger.warn("[interactive] Failed to emit messages.upsert for interactive message:", e);
  }

  return msg;
}

/* ─────────────────────────────  Plain-text description  ───────────────────────────── */

/**
 * Human-readable text stored in the database (chat history + AI context) so an
 * interactive message is not just a blank bubble.
 */
export function describeInteractivePayload(payload: InteractiveMessagePayload): string {
  const normalized = normalizeInteractivePayload(payload);
  const lines: string[] = [];

  if (normalized.body) lines.push(normalized.body);

  const buttons = formatNativeButtons(normalized.buttons || []);
  const choices: string[] = [];

  for (const button of buttons) {
    let params: any = {};
    try {
      params = JSON.parse(button.buttonParamsJson);
    } catch {
      continue;
    }

    if (button.name === "single_select") {
      for (const section of params.sections || []) {
        for (const row of section.rows || []) {
          const desc = row.description ? ` — ${row.description}` : "";
          choices.push(`• ${row.title}${desc}`);
        }
      }
    } else if (params.display_text) {
      choices.push(`• ${params.display_text}`);
    }
  }

  if (choices.length > 0) {
    lines.push("");
    lines.push(...choices);
  }

  return lines.join("\n").trim();
}
