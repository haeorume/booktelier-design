import styles from "./Logo.module.css";

/**
 * 로고 심볼(오름님 11.22 요청: 시안 로고의 심볼과 같게). 비스듬히 누운 둥근 막대를 가운데에서 갈라
 * 왼쪽 아래는 주황, 오른쪽 위는 짙은 색, 가운데에 타원 구멍. 그림 파일이 아니라 SVG 도형으로 그려요.
 */
function Mark() {
  return (
    <svg className={styles.mark} viewBox="0 0 215 183" aria-hidden="true" focusable="false">
      <defs>
        <mask id="bt-logo-hole" maskUnits="userSpaceOnUse" x="0" y="0" width="215" height="183">
          <rect width="215" height="183" fill="white" />
          <ellipse cx="0" cy="0" rx="40" ry="52" fill="black" transform="translate(107.5 91.5) rotate(-30)" />
        </mask>
      </defs>
      <g mask="url(#bt-logo-hole)">
        <g transform="translate(107.5 91.5) rotate(-30)">
          <path className={styles.markOrange} d="M0 -70 H-43 A70 70 0 0 0 -43 70 H0 Z" />
          <path className={styles.markInk} d="M0 -70 H43 A70 70 0 0 1 43 70 H0 Z" />
        </g>
      </g>
    </svg>
  );
}

/**
 * BOOKTELIER 로고(QA-F02, PR-26, D-01). 시안 11.22의 로고 자리(심볼 + 굵은 글자 + STUDIO).
 * 글자는 BOOKTELIER예요(D-01, R4).
 */
export function Logo({ size = "md", withName = false, studio = false }: { size?: "md" | "lg"; withName?: boolean; studio?: boolean }) {
  return (
    <span className={styles.logo} data-size={size} data-testid="logo">
      <span className={styles.lockup} aria-hidden="true">
        <Mark />
        <span className={styles.word}>BOOKTELIER</span>
      </span>
      {studio && (
        <span className={styles.studio} aria-hidden="true">
          STUDIO
        </span>
      )}
      <span className={withName ? styles.name : styles.hidden}>북틀리에</span>
      {!withName && <span className={styles.hidden}>Booktelier</span>}
    </span>
  );
}
