import OpenAI from "openai";
import { config } from "../config.js";
import { db, schema } from "../db/index.js";
import { eq, asc } from "drizzle-orm";
import { getCustomerByWaNumber } from "./conversation.js";
import { getStockContext } from "./stock.js";
import { buildOptionsPayload, type InteractiveMessagePayload, type InteractiveOption } from "./interactive.js";
import { logger } from "../utils/logger.js";

let client: OpenAI | null = null;
let lastApiKey = "";
let lastBaseUrl = "";

function getClient(): OpenAI {
  const currentKey = config.ai.apiKey || process.env.AI_API_KEY || "";
  const currentBase = config.ai.baseUrl || process.env.AI_BASE_URL || "https://api.openai.com/v1";

  if (!client || lastApiKey !== currentKey || lastBaseUrl !== currentBase) {
    lastApiKey = currentKey;
    lastBaseUrl = currentBase;
    client = new OpenAI({
      baseURL: currentBase,
      apiKey: currentKey || "none",
      timeout: 25000,
    });
  }
  return client;
}

const DAY_MAP: Record<string, number> = {
  minggu: 0, senin: 1, selasa: 2, rabu: 3, kamis: 4, jumat: 5, sabtu: 6,
};

function parseBusinessHours(
  businessInfo: string
): string {
  const now = new Date();
  const tz = config.timezone;

  const formatter = new Intl.DateTimeFormat("id-ID", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "long",
  });
  const parts = formatter.formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value || "";
  const hours = parts.find((p) => p.type === "hour")?.value || "00";
  const minutes = parts.find((p) => p.type === "minute")?.value || "00";
  const currentMinutes = parseInt(hours, 10) * 60 + parseInt(minutes, 10);
  const currentDayIdx = DAY_MAP[weekday.toLowerCase()] ?? -1;

  const timeStr = `${hours}:${minutes}`;
  let isOpen = false;
  let closingTime = "";

  const blockRegex = /(senin|selasa|rabu|kamis|jumat|sabtu|minggu)(?:-(senin|selasa|rabu|kamis|jumat|sabtu|minggu))?\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/gi;

  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(businessInfo)) !== null) {
    const startDay = DAY_MAP[match[1].toLowerCase()];
    const endDay = match[2] ? DAY_MAP[match[2].toLowerCase()] : startDay;
    const openTime = match[3];
    const closeTime = match[4];

    const [openH, openM] = openTime.split(":").map(Number);
    const [closeH, closeM] = closeTime.split(":").map(Number);
    const openMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;

    let dayInRange = false;
    if (startDay <= endDay) {
      dayInRange = currentDayIdx >= startDay && currentDayIdx <= endDay;
    } else {
      dayInRange = currentDayIdx >= startDay || currentDayIdx <= endDay;
    }

    if (dayInRange) {
      closingTime = closeTime;
      if (currentMinutes >= openMinutes && currentMinutes < closeMinutes) {
        isOpen = true;
      }
    }
  }

  let statusMsg = `Waktu sekarang: ${weekday}, ${timeStr} WIB. Status toko: ${isOpen ? "BUKA" : "TUTUP"}`;
  if (isOpen && closingTime) {
    statusMsg += ` (tutup jam ${closingTime})`;
  }

  return statusMsg;
}

async function getBotConfig(): Promise<{
  personaName: string;
  systemPrompt: string;
  businessInfo: string;
  escalationKeywords: string[];
  isActive: boolean;
} | null> {
  const rows = await db.select().from(schema.botConfig).limit(1);
  if (rows.length === 0) return null;

  const bc = rows[0];
  return {
    personaName: bc.persona_name,
    systemPrompt: bc.system_prompt || "",
    businessInfo: bc.business_info || "",
    escalationKeywords: (bc.escalation_keywords || "")
      .split(",")
      .map((k: string) => k.trim().toLowerCase())
      .filter(Boolean),
    isActive: bc.is_active ?? true,
  };
}

export function detectEscalation(
  message: string,
  keywords: string[]
): boolean {
  const lowerMsg = message.toLowerCase();
  if (lowerMsg.includes("#chatcs")) return true;
  return keywords.some((kw) => lowerMsg.includes(kw));
}

export async function generateBotResponse(
  conversationId: string,
  waNumber: string,
  customerMessage: string
): Promise<{
  response: string;
  shouldEscalate: boolean;
  interactive?: InteractiveMessagePayload;
}> {
  const client = getClient();
  const botConfig = await getBotConfig();

  if (!botConfig) {
    return {
      response: "Maaf, sistem sedang tidak tersedia saat ini.",
      shouldEscalate: true,
    };
  }

  if (!botConfig.isActive) {
    return {
      response: "Halo! Pesan Anda sudah kami terima. Tim Customer Service kami akan segera membalas pesan Anda.",
      shouldEscalate: true,
    };
  }

  if (!config.ai.apiKey) {
    return {
      response:
        "Halo! Pesan Anda sudah kami terima. Tim CS kami akan segera membalas.",
      shouldEscalate: true,
    };
  }

  const shouldEscalate = detectEscalation(
    customerMessage,
    botConfig.escalationKeywords
  );

  let stockContext = "";
  try { stockContext = await getStockContext(); } catch (err) { logger.debug("[chatbot] Stock context unavailable:", err); }
  const customer = await getCustomerByWaNumber(waNumber);

  let returningContext = "";
  if (customer && customer.last_summary && customer.last_active_at) {
    const lastActive = new Date(customer.last_active_at);
    const daysSince = Math.floor(
      (Date.now() - lastActive.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSince < config.contextExpiryDays) {
      returningContext = `Pelanggan: ${customer.display_name || waNumber}
Ringkasan Sesi Lalu: ${customer.last_summary}
Waktu Sesi Lalu: ${customer.last_active_at}
Total Sesi Sebelumnya: ${customer.total_sessions}`;
    }
  }

  const realtimeStatus = parseBusinessHours(botConfig.businessInfo);

  const systemPrompt = `${botConfig.systemPrompt}

[INFORMASI BISNIS]
${botConfig.businessInfo}
${realtimeStatus}
${stockContext}
${returningContext ? `\n[RIWAYAT PERCAKAPAN SEBELUMNYA (HANYA REFERENSI)]\n${returningContext}\n` : ""}
[HAL PENTING]
- Balas dalam Bahasa Indonesia yang ramah dan profesional.
- Nama Anda adalah ${botConfig.personaName}.
- JANGAN PERNAH menyalin, mengulangi secara mentah, atau membacakan ringkasan riwayat percakapan sebelumnya kepada pelanggan. Gunakan informasi tersebut hanya sebagai latar belakang konteks untuk memahami situasi pelanggan.
- Jika pesan pelanggan sangat singkat, tidak jelas, atau berupa satu karakter/sapaan pendek saja (seperti "p", "halo", "?", "tes"), tanggapi dengan sapaan ramah dan tanyakan bagaimana Anda dapat membantu mereka hari ini. Jangan mengulangi riwayat percakapan sebelumnya.
- Jika pelanggan minta bicara CS atau tampak marah/kecewa, arahkan bahwa CS akan segera menghubungi.
- Jika ditanya stok, gunakan data stok yang tersedia.
- Gunakan fungsi kirim_pilihan_interaktif ketika pelanggan perlu memilih menu/katalog, mengonfirmasi pesanan, atau menerima penawaran. Sertakan 2-10 opsi yang jelas dan singkat. Jangan gunakan tombol untuk obrolan biasa.
- Balasan singkat dan jelas, tidak bertele-tele.`;

  try {
    // Fetch conversation history for context
    let historyMessages: { role: "user" | "assistant"; content: string }[] = [];
    try {
      const priorMessages = await db
        .select({ sender: schema.messages.sender, content: schema.messages.content })
        .from(schema.messages)
        .where(eq(schema.messages.conversation_id, conversationId))
        .orderBy(asc(schema.messages.created_at))
        .limit(50);
      historyMessages = priorMessages
        .filter((m) => m.content)
        .map((m) => ({
          role: m.sender === "customer" ? "user" as const : "assistant" as const,
          content: m.content || "",
        }));
    } catch (err) { logger.debug("[chatbot] History fetch error:", err); }

    const aiMessages = [
      { role: "system" as const, content: systemPrompt },
      ...historyMessages,
      { role: "user" as const, content: customerMessage },
    ];

    const aiTools = [
      {
        type: "function" as const,
        function: {
          name: "transfer_to_cs",
          description: "Panggil fungsi ini jika customer secara eksplisit meminta berbicara dengan CS, admin, manusia, atau jika mereka marah/komplain dan masalahnya di luar kemampuan Anda.",
          parameters: {
            type: "object",
            properties: {},
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "kirim_pilihan_interaktif",
          description:
            "Kirim pesan WhatsApp interaktif dengan tombol atau daftar pilihan. Gunakan untuk menu/katalog, konfirmasi pesanan, atau penawaran. Jangan gunakan untuk obrolan biasa.",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string", description: "Judul singkat pesan (opsional)" },
              body: { type: "string", description: "Isi pesan utama yang akan dibaca pelanggan" },
              footer: { type: "string", description: "Catatan kaki kecil (opsional)" },
              options: {
                type: "array",
                description: "Daftar 2-10 pilihan untuk pelanggan",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string", description: "Teks tombol/pilihan" },
                    value: { type: "string", description: "Nilai unik pilihan (opsional)" },
                    description: { type: "string", description: "Deskripsi singkat (opsional, untuk daftar)" },
                  },
                  required: ["label"],
                },
              },
            },
            required: ["body", "options"],
          },
        },
      },
    ];

    let completion;
    try {
      completion = await client.chat.completions.create({
        model: config.ai.model,
        messages: aiMessages,
        tools: aiTools,
        max_tokens: config.ai.maxTokens,
        temperature: 0.7,
      });
    } catch (primaryErr) {
      if (config.ai.model !== "sp/gemini/gemini-3.5-flash") {
        logger.warn(
          `[chatbot] Primary model ${config.ai.model} failed, attempting automatic fallback to sp/gemini/gemini-3.5-flash:`,
          primaryErr
        );
        completion = await client.chat.completions.create({
          model: "sp/gemini/gemini-3.5-flash",
          messages: aiMessages,
          tools: aiTools,
          max_tokens: config.ai.maxTokens,
          temperature: 0.7,
        });
      } else {
        throw primaryErr;
      }
    }

    const msg = completion.choices[0]?.message;

    let aiRequestedEscalation = false;
    let response = msg?.content || "";
    let interactive: InteractiveMessagePayload | undefined;

    if (msg?.tool_calls && msg.tool_calls.length > 0) {
      for (const call of msg.tool_calls) {
        if (call.type !== "function") continue;

        if (call.function.name === "transfer_to_cs") {
          aiRequestedEscalation = true;
        }

        if (call.function.name === "kirim_pilihan_interaktif") {
          try {
            const args = JSON.parse(call.function.arguments || "{}");
            const options: InteractiveOption[] = Array.isArray(args.options)
              ? args.options
                  .filter((o: any) => o && typeof o.label === "string" && o.label.trim())
                  .slice(0, 10)
                  .map((o: any) => ({
                    label: o.label.trim(),
                    value: typeof o.value === "string" ? o.value : undefined,
                    description: typeof o.description === "string" ? o.description : undefined,
                  }))
              : [];

            if (options.length > 0) {
              interactive = buildOptionsPayload({
                title: typeof args.title === "string" && args.title.trim() ? args.title : undefined,
                body:
                  typeof args.body === "string" && args.body.trim()
                    ? args.body
                    : "Silakan pilih salah satu opsi berikut:",
                footer: typeof args.footer === "string" && args.footer.trim() ? args.footer : undefined,
                options,
              });
              // The interactive body is the visible message, so use it for the
              // stored history and as the fallback text.
              response = interactive.body || response;
            }
          } catch (err) {
            logger.warn("[chatbot] Invalid interactive tool arguments:", err);
          }
        }
      }

      // If AI decided to escalate but didn't provide a text response, provide a default one
      if (!response && aiRequestedEscalation) {
        response = "Baik, saya akan menghubungkan Anda dengan Customer Service kami. Mohon tunggu sebentar ya.";
      }
    }

    if (!response && interactive) {
      response = interactive.body || "Silakan pilih salah satu opsi berikut:";
    }

    if (!response) {
      response = "Maaf, saya tidak dapat memproses permintaan Anda saat ini.";
    }

    const finalShouldEscalate = shouldEscalate || aiRequestedEscalation;

    return { response, shouldEscalate: finalShouldEscalate, interactive };
  } catch (err) {
    logger.error("[chatbot] AI error:", err);
    return {
      response:
        "Maaf, sistem kami sedang mengalami gangguan. Tim CS akan segera menghubungi Anda.",
      shouldEscalate: true,
    };
  }
}

export async function generateSummary(
  messages: { sender: string; content: string | null }[]
): Promise<string> {
  if (!config.ai.apiKey) return "Ringkasan sesi.";

  const client = getClient();
  const transcript = messages
    .filter((m) => m.content)
    .map((m) => `${m.sender}: ${m.content}`)
    .join("\n");

  try {
    let completion;
    const summaryMessages = [
      {
        role: "system" as const,
        content:
          "Buat ringkasan singkat (maks 3 kalimat) dalam Bahasa Indonesia dari percakapan customer service berikut. Sertakan: topik utama, masalah yang dibahas, dan hasil akhir.",
      },
      { role: "user" as const, content: transcript },
    ];
    try {
      completion = await client.chat.completions.create({
        model: config.ai.model,
        messages: summaryMessages,
        max_tokens: 200,
        temperature: 0.3,
      });
    } catch (err) {
      if (config.ai.model !== "sp/gemini/gemini-3.5-flash") {
        completion = await client.chat.completions.create({
          model: "sp/gemini/gemini-3.5-flash",
          messages: summaryMessages,
          max_tokens: 200,
          temperature: 0.3,
        });
      } else {
        throw err;
      }
    }

    return (
      completion.choices[0]?.message?.content || "Ringkasan sesi."
    );
  } catch (err) {
    logger.error("[chatbot] Summary generation error:", err);
    return "Ringkasan sesi.";
  }
}
