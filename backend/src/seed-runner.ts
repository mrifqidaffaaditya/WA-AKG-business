import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import crypto from "crypto";
import { db, schema } from "./db/index.js";
import { generateId } from "./utils/id.js";
import { hashPassword } from "./services/auth.js";
import { eq } from "drizzle-orm";

async function seed() {
  const now = new Date().toISOString();

  const superAdminEmail = process.env.SEED_SUPER_ADMIN_EMAIL || "aditya@aikeigroup.net";
  const superAdminPassword = process.env.SEED_SUPER_ADMIN_PASSWORD || "aditya123";

  const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@aikeigroup.net";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "admin123";

  const csEmail = process.env.SEED_CS_EMAIL || "contact@aikeigroup.net";
  const csPassword = process.env.SEED_CS_PASSWORD || "cs123";

  const targetUsers = [
    {
      name: "Aditya (Super Admin)",
      email: superAdminEmail,
      role: "super_admin" as const,
      password: superAdminPassword,
    },
    {
      name: "Admin AIKEI",
      email: adminEmail,
      role: "admin" as const,
      password: adminPassword,
    },
    {
      name: "CS AIKEI",
      email: csEmail,
      role: "cs" as const,
      password: csPassword,
    },
  ];

  let firstUserId = "";

  for (const u of targetUsers) {
    const existing = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, u.email))
      .limit(1);

    if (existing.length === 0) {
      const id = generateId();
      if (!firstUserId && u.role === "super_admin") firstUserId = id;

      await db.insert(schema.users).values({
        id,
        name: u.name,
        email: u.email,
        password_hash: await hashPassword(u.password),
        role: u.role,
        is_active: true,
        created_at: now,
      });

      console.log(`[seed] Created user ${u.role}: ${u.email} / ${u.password}`);
    } else {
      if (!firstUserId && u.role === "super_admin") firstUserId = existing[0].id;
      console.log(`[seed] User ${u.email} already exists.`);

      // Update password to match configured seed password
      await db.update(schema.users).set({
        password_hash: await hashPassword(u.password),
        is_active: true,
      }).where(eq(schema.users.email, u.email));
      console.log(`[seed] Updated password for ${u.email}`);
    }
  }

  // Ensure Bot Config exists
  const existingBot = await db.select().from(schema.botConfig).limit(1);
  if (existingBot.length === 0) {
    await db.insert(schema.botConfig).values({
      id: generateId(),
      persona_name: "Bot AKG",
      system_prompt:
        "Anda adalah asisten customer service yang ramah dan membantu. Jawab pertanyaan customer dengan sopan dan profesional dalam Bahasa Indonesia. Jika Anda tidak tahu jawabannya, sampaikan dengan jujur dan tawarkan untuk menghubungkan ke CS.",
      business_info:
        "Jam operasional: Senin-Jumat 09:00-17:00 WIB. Sabtu 09:00-14:00 WIB.",
      escalation_keywords: "#chatcs,manager,supervisor,komplain,ngamuk,kecewa",
      session_timeout_mins: 30,
      session_timeout_warning_mins: 5,
      auto_close_enabled: false,
      updated_by: firstUserId || null,
      updated_at: now,
    });
    console.log("[seed] Created default bot config.");
  }

  // Ensure Stock Config exists
  const existingStock = await db.select().from(schema.stockConfig).limit(1);
  if (existingStock.length === 0) {
    await db.insert(schema.stockConfig).values({
      id: generateId(),
      source_type: null,
      config_json: null,
      is_active: false,
      updated_at: now,
    });
    console.log("[seed] Created default stock config.");
  }
}

seed()
  .then(() => {
    console.log("[seed] Done.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[seed] Error:", err);
    process.exit(1);
  });
