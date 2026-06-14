import fs from "fs";
import path from "path";

const configPath = path.join(process.cwd(), "cs_config.json");

export interface CsConfig {
  signatureEnabled: boolean;
  signatureTemplate: string;
  quickReplies: string[];
  autoReplyClaimEnabled: boolean;
  autoReplyClaim: string;
  autoReplyResolveEnabled: boolean;
  autoReplyResolve: string;
}

const defaultConfig: CsConfig = {
  signatureEnabled: false,
  signatureTemplate: " - {name}",
  quickReplies: [
    "Halo, ada yang bisa kami bantu?",
    "Mohon tunggu sebentar ya, sedang kami cek.",
    "Terima kasih telah menghubungi kami. Semoga harimu menyenangkan!"
  ],
  autoReplyClaimEnabled: true,
  autoReplyClaim: "Halo, dengan CS {name} di sini. Ada yang bisa saya bantu?",
  autoReplyResolveEnabled: true,
  autoReplyResolve: "Terima kasih telah menghubungi kami. Sesi obrolan ini telah ditutup. \n\nMohon berikan penilaian atas pelayanan kami dengan membalas pesan ini menggunakan angka 1 (Sangat Buruk) hingga 5 (Sangat Baik).",
};

export function getCsConfig(): CsConfig {
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, "utf-8");
      return { ...defaultConfig, ...JSON.parse(data) };
    }
  } catch (err) {
    console.error("Failed to read cs_config.json", err);
  }
  return defaultConfig;
}

export function updateCsConfig(config: Partial<CsConfig>): CsConfig {
  const current = getCsConfig();
  const updated = { ...current, ...config };
  fs.writeFileSync(configPath, JSON.stringify(updated, null, 2), "utf-8");
  return updated;
}
