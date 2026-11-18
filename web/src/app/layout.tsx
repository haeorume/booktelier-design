import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Booktelier(북틀리에)",
  description: "편집자·작가·디자이너가 함께 책을 만드는 작업 공간",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
