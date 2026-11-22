import type { PageMark } from "@/domain/pages";
import styles from "./PageGuides.module.css";

interface Props {
  marks: PageMark[];
  /** 지면 전체 높이와 아래 여백(px). 마지막 쪽 번호를 아래 여백 가운데에 그려요. */
  sheet: number;
  bottom: number;
}

/**
 * 쪽 경계·쪽 번호·머리말 층(FR-17 ①, FR-44, DESIGN.md 4장). 이어진 편집기 위에 얹는 그림이라 글을 끊지 않아요.
 * 경계 선마다 그 쪽의 번호(바깥쪽 여백)와 다음 쪽의 머리말을 같이 놓아요. 누를 수 없고 화면 읽기에서도 빠져요.
 */
export function PageGuides({ marks, sheet, bottom }: Props) {
  return (
    <div className={styles.layer} aria-hidden="true" data-testid="page-guides" data-pages={marks.length}>
      {marks.map((m, i) => {
        const last = i === marks.length - 1;
        const next = marks[i + 1];
        const y = last ? sheet - bottom / 2 : m.end;
        return (
          <div key={m.number} className={styles.row} data-last={last} style={{ top: `${y}px` }}>
            {!last && <span className={styles.line} data-testid="page-boundary" />}
            {m.numberAt && (
              <span
                className={styles.number}
                data-side={m.side}
                // 가운데 아래: 쪽 사이에는 빈 공간이 없어 가운데에 두면 본문과 겹쳐요. 마지막 쪽(아래 여백)만 가운데에 두고,
                // 나머지는 바깥쪽 여백에 '– 2 –' 모양으로 놓아 바깥쪽 아래와 구분해요(Codex 검수 11.21). 실제 자리는 미리보기에서 보여요.
                data-at={m.numberAt === "center" && !last ? "outer" : m.numberAt}
                data-style={m.numberAt}
                data-testid="page-number"
              >
                {m.numberAt === "center" && !last ? `– ${m.number} –` : m.number}
              </span>
            )}
            {next?.header && (
              <span className={styles.header} data-side={next.side} data-testid="running-head">
                {next.header}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
