import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { Providers } from "./providers";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const description = "让孩子记录、采集并组合身边的声音，在个人与集体声场中生成一首可追溯的作品。";
  return {
    metadataBase: new URL(origin),
    title: { default: "万物声谱", template: "%s｜万物声谱" },
    description,
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title: "万物声谱",
      description,
      type: "website",
      images: [{ url: new URL("/og-v2.png", origin).toString(), width: 1536, height: 1024, alt: "万物声谱——今天，你听见了什么？" }],
    },
    twitter: { card: "summary_large_image", title: "万物声谱", description, images: [new URL("/og-v2.png", origin).toString()] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
