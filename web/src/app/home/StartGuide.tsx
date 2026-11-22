"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon, type IconName } from "@/components/Icon";
import { requestTour } from "@/components/tour-start";
import styles from "./StartGuide.module.css";

type Row = {
  id: string;
  icon: IconName;
  title: string;
  hint: string;
  href: string;
  go: string;
};

/**
 * 핸드독스 /modoo/start처럼, 할 일 목록과 (i) 설명·화면 투어를 한자리에 둔다.
 */
export function StartGuide({ workspaceHref }: { workspaceHref: string | null }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const next = workspaceHref ?? "/?new=1";
  const rows: Row[] = [
    {
      id: "new",
      icon: "plus",
      title: "새 책 만들기",
      go: "바로 만들기",
      href: "/?new=1",
      hint: "제목과 소설·에세이·실용서 템플릿을 고르면 빈 첫 장이 열려요. 이 브라우저가 그 책의 편집자가 됩니다.",
    },
    {
      id: "invite",
      icon: "link",
      title: "참여자 초대",
      go: workspaceHref ? "작업 공간에서 초대" : "먼저 책을 만들면",
      href: next,
      hint: "작업 공간 상단의 초대로 작가 링크와 디자이너 링크를 나눠요. 받은 사람이 그 역할로 들어와요. 역할마다 화면을 따로 만들지 않아요.",
    },
    {
      id: "review",
      icon: "comment",
      title: "같은 지면에서 검토",
      go: workspaceHref ? "검토 화면 열기" : "먼저 책을 만들면",
      href: next,
      hint: "작가가 글을 쓰면 맞춤법 밑줄이 떠요. 편집자는 장 검토로 제안을 돌리고, 함께 봄에서 수정과 의견을 나눠요.",
    },
    {
      id: "layout",
      icon: "layout",
      title: "조판과 미리보기",
      go: workspaceHref ? "조판 화면 열기" : "먼저 책을 만들면",
      href: next,
      hint: "조판 설정에서 판형·여백·행간을 바꾸면 종이에 바로 보여요. 미리보기는 고칠 수 없는 펼침면이에요. 작가는 조판 값을 보기만 해요.",
    },
  ];

  return (
    <section id="home-guide" className={styles.board} aria-labelledby="home-guide-title" data-tour="home-guide">
      <div className={styles.panel}>
        <span className={styles.eyebrow}>HOW BOOKTELIER WORKS</span>
        <h2 id="home-guide-title">북틀리에로 한 권을 완성하세요</h2>
        <p className={styles.lead}>한 번에 하나씩. (i)를 누르면 설명이 열리고, 행을 누르면 바로 시작해요.</p>
        <ul className={styles.rows}>
          {rows.map((row) => {
            const expanded = openId === row.id;
            return (
              <li key={row.id} className={styles.item} data-open={expanded}>
                <div className={styles.line}>
                  <Link className={styles.row} href={row.href}>
                    <span className={styles.icon} aria-hidden="true">
                      <Icon name={row.icon} size="sm" />
                    </span>
                    <span className={styles.rowCopy}>
                      <strong>{row.title}</strong>
                      <small>{row.go}</small>
                    </span>
                    <Icon name="chevron" size="sm" className={styles.chevron} />
                  </Link>
                  <button
                    type="button"
                    className={styles.info}
                    aria-expanded={expanded}
                    aria-controls={`guide-hint-${row.id}`}
                    aria-label={`${row.title} 설명`}
                    onClick={() => setOpenId(expanded ? null : row.id)}
                  >
                    <Icon name="info" size="xs" />
                  </button>
                </div>
                {expanded && (
                  <p id={`guide-hint-${row.id}`} className={styles.hint}>
                    {row.hint}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <aside className={styles.tips} aria-labelledby="home-guide-tips">
        <span className={styles.eyebrow}>FIRST LOOK</span>
        <h2 id="home-guide-tips">처음이라면 화면을 따라가 보세요</h2>
        <p className={styles.lead}>지금 화면의 단추를 하나씩 가리키며 설명해 드려요. 건너뛰어도 왼쪽 아래 사용법에서 다시 열 수 있어요.</p>
        <button type="button" className={styles.tour} onClick={() => requestTour()}>
          <Icon name="focus" size="sm" />
          사용법 투어 시작
        </button>
        <h3 className={styles.tipsHead}>알아두면 좋아요</h3>
        <ul className={styles.bullets}>
          <li>역할은 받은 링크가 정해요. 같은 주소라도 작가와 디자이너는 다른 도구를 봐요.</li>
          <li>세 역할이 같은 책 모양 종이를 봐요. 보이는 단추만 달라요.</li>
          <li>작가는 굵게·기울임·밑줄로 강조해요. 본문 글꼴·크기는 조판 설정에서 바꿔요.</li>
        </ul>
      </aside>
    </section>
  );
}
