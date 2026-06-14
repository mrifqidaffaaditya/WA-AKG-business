import OpenAI from "openai";
import { config } from "../config.js";
import { db, schema } from "../db/index.js";
import { eq, asc } from "drizzle-orm";
import { getCustomerByWaNumber } from "./conversation.js";
import { getStockContext } from "./stock.js";
import { logger } from "../utils/logger.js";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      baseURL: config.ai.baseUrl,
      apiKey: config.ai.apiKey,
    });
  }
  return client;
}

async function getBotConfig(): Promise<{
  personaName: string;
  systemPrompt: string;
  businessInfo: string;
  escalationKeywords: string[];
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
}> {
  const client = getClient();
  const botConfig = await getBotConfig();

  if (!botConfig) {
    return {
      response: "Maaf, sistem sedang tidak tersedia saat ini.",
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

  const systemPrompt = `${botConfig.systemPrompt}

[INFORMASI BISNIS]
${botConfig.businessInfo}
${stockContext}
${returningContext ? `\n[RIWAYAT PERCAKAPAN SEBELUMNYA (HANYA REFERENSI)]\n${returningContext}\n` : ""}
[HAL PENTING]
- Balas dalam Bahasa Indonesia yang ramah dan profesional.
- Nama Anda adalah ${botConfig.personaName}.
- JANGAN PERNAH menyalin, mengulangi secara mentah, atau membacakan ringkasan riwayat percakapan sebelumnya kepada pelanggan. Gunakan informasi tersebut hanya sebagai latar belakang konteks untuk memahami situasi pelanggan.
- Jika pesan pelanggan sangat singkat, tidak jelas, atau berupa satu karakter/sapaan pendek saja (seperti "p", "halo", "?", "tes"), tanggapi dengan sapaan ramah dan tanyakan bagaimana Anda dapat membantu mereka hari ini. Jangan mengulangi riwayat percakapan sebelumnya.
- Jika pelanggan minta bicara CS atau tampak marah/kecewa, arahkan bahwa CS akan segera menghubungi.
- Jika ditanya stok, gunakan data stok yang tersedia.
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

    const completion = await client.chat.completions.create({
      model: config.ai.model,
      messages: [
        { role: "system", content: systemPrompt },
        ...historyMessages,
        { role: "user", content: customerMessage },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "transfer_to_cs",
            description: "Panggil fungsi ini jika customer secara eksplisit meminta berbicara dengan CS, admin, manusia, atau jika mereka marah/komplain dan masalahnya di luar kemampuan Anda.",
            parameters: {
              type: "object",
              properties: {},
            },
          },
        },
      ],
      max_tokens: config.ai.maxTokens,
      temperature: 0.7,
    });

    const msg = completion.choices[0]?.message;
    
    let aiRequestedEscalation = false;
    let response = msg?.content || "";

    if (msg?.tool_calls && msg.tool_calls.length > 0) {
      for (const call of msg.tool_calls) {
        if (call.type === "function" && call.function.name === "transfer_to_cs") {
          aiRequestedEscalation = true;
        }
      }
      
      // If AI decided to escalate but didn't provide a text response, provide a default one
      if (!response && aiRequestedEscalation) {
        response = "Baik, saya akan menghubungkan Anda dengan Customer Service kami. Mohon tunggu sebentar ya.";
      }
    }

    if (!response) {
      response = "Maaf, saya tidak dapat memproses permintaan Anda saat ini.";
    }

    const finalShouldEscalate = shouldEscalate || aiRequestedEscalation;

    return { response, shouldEscalate: finalShouldEscalate };
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
    const completion = await client.chat.completions.create({
      model: config.ai.model,
      messages: [
        {
          role: "system",
          content:
            "Buat ringkasan singkat (maks 3 kalimat) dalam Bahasa Indonesia dari percakapan customer service berikut. Sertakan: topik utama, masalah yang dibahas, dan hasil akhir.",
        },
        { role: "user", content: transcript },
      ],
      max_tokens: 200,
      temperature: 0.3,
    });

    return (
      completion.choices[0]?.message?.content || "Ringkasan sesi."
    );
  } catch (err) {
    logger.error("[chatbot] Summary generation error:", err);
    return "Ringkasan sesi.";
  }
}
