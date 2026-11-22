import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/Theme";
import { ROLE_LABEL } from "@/domain/labels";
import type { Role } from "@/types";
import styles from "./ServiceHeader.module.css";

const INITIAL: Record<Role, string> = { editor: "E", author: "A", designer: "D" };

/**
 * 작업 공간 밖 화면(편집자 홈·새 책·링크로 들어오기·안내)의 머리(시안 .bf-header).
 * 왼쪽 로고 + STUDIO, 오른쪽 '시제품' 표시 · 지금 역할 · 테마 스위치(홈에서만).
 */
export function ServiceHeader({ role, homeLink = false, themeToggle = false }: { role?: Role | null; homeLink?: boolean; themeToggle?: boolean }) {
  return (
    <header className={styles.header}>
      {homeLink ? (
        <Link className={styles.brand} href="/home" aria-label="BOOKTELIER 홈으로">
          <Logo studio />
        </Link>
      ) : (
        <span className={styles.brand}>
          <Logo studio />
        </span>
      )}
      <div className={styles.right}>
        <span className={styles.prototype}>시제품</span>
        {role && (
          <span className={styles.account} data-role={role}>
            <span className={styles.avatar} aria-hidden="true">
              {INITIAL[role]}
            </span>
            {ROLE_LABEL[role]}
          </span>
        )}
        {/* 테마 스위치는 화면에 하나만(data-testid=theme-toggle). 화면 상태가 남는 cacheComponents에서 숨은 화면과 겹치지 않게
            원래 스위치가 있던 편집자 홈에서만 그려요. */}
        {themeToggle && <ThemeToggle />}
      </div>
    </header>
  );
}
