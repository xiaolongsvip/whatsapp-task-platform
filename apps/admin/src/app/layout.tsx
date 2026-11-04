import type { ReactNode } from "react";

export const metadata = {
  title: "WTP Administration",
  description: "Administration console for WhatsApp Task Platform.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
