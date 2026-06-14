import { db, schema } from "./db/index.js";
import { generateId } from "./utils/id.js";
import { hashPassword } from "./services/auth.js";
import { eq } from "drizzle-orm";

async function seed() {
  const existing = await db
    .select({ count: schema.users.id })
    .from(schema.users)
    .limit(1);

  if (existing.length > 0) {
    console.log("[seed] Users already exist, skipping seed.");
    return;
  }

  const now = new Date().toISOString();

  const users = [
    {
      id: generateId(),
      name: "Super Admin",
      email: "superadmin@wa-akg.local",
      password_hash: await hashPassword("admin123"),
      role: "super_admin" as const,
      is_active: true,
      created_at: now,
    },
    {
      id: generateId(),
      name: "Admin",
      email: "admin@wa-akg.local",
      password_hash: await hashPassword("admin123"),
      role: "admin" as const,
      is_active: true,
      created_at: now,
    },
    {
      id: generateId(),
      name: "CS User",
      email: "cs@wa-akg.local",
      password_hash: await hashPassword("cs123"),
      role: "cs" as const,
      is_active: true,
      created_at: now,
    },
  ];

  for (const u of users) {
    await db.insert(schema.users).values(u);
  }

  console.log("[seed] Created 3 default users.");

  await db.insert(schema.botConfig).values({
    id: generateId(),
    persona_name: "Bot AKG",
    system_prompt:
      "Anda adalah asisten customer service yang ramah dan membantu. Jawab pertanyaan customer dengan sopan dan profesional dalam Bahasa Indonesia. Jika Anda tidak tahu jawabannya, sampaikan dengan jujur dan tawarkan untuk menghubungkan ke CS.",
    business_info:
      "Jam operasional: Senin-Jumat 09:00-17:00 WIB. Sabtu 09:00-14:00 WIB.",
    escalation_keywords: "#chatcs,manager,supervisor,komplain,ngamuk,kecewa",
    session_timeout_mins: 30,
    auto_close_enabled: false,
    updated_by: users[0].id,
    updated_at: now,
  });

  console.log("[seed] Created default bot config.");

  await db.insert(schema.stockConfig).values({
    id: generateId(),
    source_type: null,
    config_json: null,
    is_active: false,
    updated_at: now,
  });

  console.log("[seed] Created default stock config.");
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
