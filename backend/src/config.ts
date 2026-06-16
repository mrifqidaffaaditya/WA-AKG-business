import "dotenv/config";

const appSecret = process.env.APP_SECRET || "";
const refreshSecret = process.env.REFRESH_SECRET || "";

// JWT secrets must NEVER be empty in ANY environment. An empty secret means
// tokens are signed with "" and can be trivially forged. The guard previously
// only ran in production, so a missing/unset NODE_ENV left signing wide open.
if (!appSecret) {
  throw new Error("APP_SECRET must be set. Generate a random 32+ byte string.");
}
if (!refreshSecret) {
  throw new Error("REFRESH_SECRET must be set (separate from APP_SECRET). Generate a random 32+ byte string. Do NOT reuse APP_SECRET.");
}
if (appSecret === refreshSecret) {
  throw new Error("REFRESH_SECRET must differ from APP_SECRET.");
}

export const config = {
  port: parseInt(process.env.APP_PORT || "4000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  appSecret,
  refreshSecret,
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:4040",
  corsOrigin: process.env.CORS_ORIGIN || process.env.FRONTEND_URL || "http://localhost:4040",

  dbPath: process.env.DB_PATH || "file:./data/wa_akg.db",

  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
  },

  ai: {
    baseUrl: process.env.AI_BASE_URL || "https://api.openai.com/v1",
    apiKey: process.env.AI_API_KEY || "",
    model: process.env.AI_MODEL || "gpt-4o",
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || "1024", 10),
  },

  wa: {
    sessionPath: process.env.WA_SESSION_PATH || "./sessions",
  },

  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY || "",
    privateKey: process.env.VAPID_PRIVATE_KEY || "",
    subject: process.env.VAPID_SUBJECT || "mailto:admin@yourdomain.com",
  },

  pagination: {
    messagesPageSize: parseInt(process.env.MESSAGES_PAGE_SIZE || "30", 10),
    conversationsPageSize: parseInt(process.env.CONVERSATIONS_PAGE_SIZE || "20", 10),
    messagesSoftCap: parseInt(process.env.MESSAGES_SOFT_CAP || "5000", 10),
  },

  rateLimitEnabled: process.env.RATE_LIMIT_ENABLED !== "false",
  contextExpiryDays: parseInt(process.env.CONTEXT_EXPIRY_DAYS || "90", 10),
  timezone: process.env.TIMEZONE || "Asia/Jakarta",
  notifQueueThreshold: parseInt(process.env.NOTIF_QUEUE_THRESHOLD || "5", 10),
  notifDebounceSeconds: parseInt(process.env.NOTIF_DEBOUNCE_SECONDS || "30", 10),

  jwt: {
    accessExpiresIn: "15m",
    refreshExpiresIn: "7d",
  },
};
