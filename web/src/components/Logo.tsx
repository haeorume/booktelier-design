import styles from "./Logo.module.css";

/**
 * BOOKTELIER 글자 로고(QA-F02, PR-26, D-01). 오름님 SVG가 오면 바꿔요(DESIGN.md 9장).
 * 'BOOK'의 주황(--bt-brand)은 로고 그림이라 글자 대비 기준 밖이에요(DESIGN.md 1장 4).
 */
export function Logo({ size = "md", withName = false }: { size?: "md" | "lg"; withName?: boolean }) {
  return (
    <span className={styles.logo} data-size={size} data-testid="logo">
      <span aria-hidden="true">
        <span className={styles.mark}>BOOK</span>TELIER
      </span>
      <span className={withName ? styles.name : styles.hidden}>북틀리에</span>
      {!withName && <span className={styles.hidden}>Booktelier</span>}
    </span>
  );
}
