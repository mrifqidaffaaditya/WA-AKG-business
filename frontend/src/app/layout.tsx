import type { Metadata, Viewport } from "next";
import { Fira_Sans, Fira_Code } from "next/font/google";
import { AuthProvider } from "@/hooks/useAuth";
import "./globals.css";

const firaSans = Fira_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-fira-sans",
  display: "swap",
});

const firaCode = Fira_Code({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-fira-code",
  display: "swap",
});

export const metadata: Metadata = {
  title: "WA-AKG Business",
  description: "WhatsApp CS Management Platform",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#1a1612",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className={`dark h-full ${firaSans.variable} ${firaCode.variable}`}>
      <body className="bg-slate-950 text-slate-200 h-full min-h-full font-sans overflow-hidden overscroll-none">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
