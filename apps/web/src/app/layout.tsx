import type { ReactNode } from "react";

export const metadata = {
  title: "WhatsApp Task Platform",
  description: "A consent-based task management platform.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
