import type { Metadata } from "next";

import AmplifyProvider from "@/components/AmplifyProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 리포트 | 마케팅 데이터 분석",
  description: "GA4와 AppsFlyer 데이터를 자연어로 분석하는 AI 리포트 서비스",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">
        <AmplifyProvider>{children}</AmplifyProvider>
      </body>
    </html>
  );
}
