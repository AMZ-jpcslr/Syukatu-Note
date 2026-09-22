import type { Metadata, Viewport } from "next";
import { Providers, PwaRegistration } from "@/components/providers";
import { Shell } from "@/components/shell";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "しゅうかつ手帳 | 就活スケジュール",
    template: "%s | しゅうかつ手帳",
  },
  description: "応募の締切から面接、ESまで。あなたの就職活動をひとつの手帳に。",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon-180.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f8f9fb",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body>
        <Providers>
          <Shell>{children}</Shell>
          <PwaRegistration />
        </Providers>
      </body>
    </html>
  );
}
