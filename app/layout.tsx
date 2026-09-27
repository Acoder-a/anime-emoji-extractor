import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Anime Clip｜极简动漫素材裁剪器",
  description: "解析或上传完整视频，手动定义时间段并导出高清图片帧和视频片段。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
