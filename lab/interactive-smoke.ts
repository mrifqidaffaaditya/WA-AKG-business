/**
 * Smoke test for the interactive message builders.
 * Run from the repo root: npx tsx lab/interactive-smoke.ts
 */
import {
  normalizeInteractivePayload,
  describeInteractivePayload,
  formatNativeButtons,
} from "../backend/src/services/interactive.js";

const p1 = normalizeInteractivePayload({
  title: "Konfirmasi",
  body: "Lanjut?",
  footer: "Pilih",
  options: [
    { label: "Ya", value: "yes" },
    { label: "Tidak", value: "no" },
  ],
});
console.log("OPTIONS->", JSON.stringify(formatNativeButtons(p1.buttons)));

const p2 = normalizeInteractivePayload({
  title: "Katalog",
  body: "Pilih produk",
  buttons: [
    {
      type: "single_select",
      title: "Lihat",
      sections: [{ title: "Produk", rows: [{ id: "p1", title: "Kopi", description: "Rp 10.000" }] }],
    },
  ],
});
console.log("LIST->", JSON.stringify(formatNativeButtons(p2.buttons)));
console.log("DESCRIBE->");
console.log(describeInteractivePayload(p2));

const p3 = normalizeInteractivePayload({
  body: "Link",
  options: [{ label: "A" }, { label: "B" }, { label: "C" }, { label: "D" }],
});
console.log("4OPTIONS->", formatNativeButtons(p3.buttons).map((b) => b.name));

const p4 = normalizeInteractivePayload({
  body: "Penawaran",
  buttons: [
    { type: "cta_url", displayText: "Buka", url: "https://example.com" },
    { type: "cta_call", displayText: "Telepon", phoneNumber: "+628123" },
    { type: "cta_copy", displayText: "Salin", copyCode: "PROMO10" },
  ],
});
console.log("CTA->", JSON.stringify(formatNativeButtons(p4.buttons)));
