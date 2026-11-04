import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "WhatsApp Task Platform",
  description: "A consent-based task management platform.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
