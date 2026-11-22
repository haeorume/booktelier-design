import type { Metadata } from "next";

// 메신저로 보낼 때 미리보기가 뜨게 한다(routes 주소 규칙 5). 서버에는 책 정보가 없어 1차는 고정 문구다.
export const metadata: Metadata = {
  title: "Booktelier(북틀리에)로 초대받았어요",
  description: "받은 링크의 역할로 책 작업 공간에 들어가요.",
  openGraph: {
    title: "Booktelier(북틀리에)로 초대받았어요",
    description: "받은 링크의 역할로 책 작업 공간에 들어가요.",
    siteName: "Booktelier(북틀리에)",
    type: "website",
  },
};

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return children;
}
