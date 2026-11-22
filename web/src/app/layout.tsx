import type { Metadata } from "next";
import { Suspense } from "react";
import { DevBar } from "@/components/DevBar";
import { ThemeApplier } from "@/components/Theme";
import { Tour } from "@/components/Tour";
import "./globals.css";

export const metadata: Metadata = {
  title: "Booktelier(북틀리에)",
  description: "편집자·작가·디자이너가 같은 지면에서 함께 책을 만드는 작업 공간",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        <ThemeApplier />
        {/* 막대는 주소(usePathname)를 읽어 브라우저에서만 그린다. */}
        <Suspense fallback={null}>
          <DevBar />
        </Suspense>
        {children}
        <Suspense fallback={null}>
          <Tour />
        </Suspense>
      </body>
    </html>
  );
}
