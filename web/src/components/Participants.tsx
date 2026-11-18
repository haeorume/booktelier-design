import { ROLE_LABEL } from "@/domain/labels";
import type { Participant } from "@/types";
import styles from "./Participants.module.css";

/**
 * 접속자 표시(WS-13, FR-19). 1차는 한 브라우저 데모라 실시간 접속 정보가 없다.
 * 이 책의 참여자를 아바타로 보여 주고 지금 역할의 사람을 강조한다(정할 것 17 잠정).
 * 역할은 색이 아니라 글자로 함께 보인다. 편집자는 이름 대신 '편집자'(FR-19 비고).
 */
export function Participants({ participants, currentId }: { participants: Participant[]; currentId: string }) {
  return (
    <ul className={styles.list} aria-label="참여자" data-testid="participants">
      {participants.map((p) => {
        const name = p.role === "editor" ? ROLE_LABEL.editor : p.display_name;
        const me = p.id === currentId;
        return (
          <li key={p.id} className={styles.person} aria-current={me ? "true" : undefined} title={`${name} · ${ROLE_LABEL[p.role]}`}>
            <span className={styles.avatar} aria-hidden="true">
              {name.slice(0, 1)}
            </span>
            <span className={styles.label}>
              {name}
              {p.role !== "editor" && <span className={styles.role}> {ROLE_LABEL[p.role]}</span>}
              {me && <span className={styles.me}> (나)</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
