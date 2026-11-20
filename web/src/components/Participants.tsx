import { ROLE_LABEL } from "@/domain/labels";
import type { PresentPerson } from "@/data";
import type { Participant } from "@/types";
import styles from "./Participants.module.css";

interface Props {
  participants: Participant[];
  currentId: string;
  /** 지금 같은 책을 연 다른 사람(A-31). null이면 서버가 없는 1차 데모라 참여자를 모두 보여 준다. */
  present: PresentPerson[] | null;
  chapterTitles: Map<string, string>;
  onJump: (person: PresentPerson) => void;
}

function nameOf(p: { role: Participant["role"]; display_name: string }): string {
  return p.role === "editor" ? ROLE_LABEL.editor : p.display_name;
}

/**
 * 접속자 표시(WS-13, CS-20, FR-19·47). 나와 지금 이 책을 연 사람만 보인다. 다른 사람의 아바타 아래에는 지금 보는 장이 있고,
 * 누르면 그 사람이 보는 장과 문단으로 간다(작업 위치). 역할은 색이 아니라 글자로 함께 보인다. 편집자는 이름 대신 '편집자'.
 * 서버가 없으면(1차 데모) 이 책의 참여자를 모두 보여 주고 지금 역할의 사람을 강조한다(정할 것 17 잠정).
 */
export function Participants({ participants, currentId, present, chapterTitles, onJump }: Props) {
  if (present === null) {
    return (
      <ul className={styles.list} aria-label="참여자" data-testid="participants">
        {participants.map((p) => (
          <Person key={p.id} person={p} me={p.id === currentId} />
        ))}
      </ul>
    );
  }
  const me = participants.find((p) => p.id === currentId);
  return (
    <ul className={styles.list} aria-label="접속자" data-testid="participants">
      {me && <Person person={me} me />}
      {present.map((p) => {
        const name = nameOf(p);
        const chapter = p.chapter_id ? chapterTitles.get(p.chapter_id) : undefined;
        return (
          <li key={p.participant_id}>
            <button
              type="button"
              className={styles.person}
              data-testid="presence-person"
              disabled={!p.chapter_id}
              title={`${name} · ${ROLE_LABEL[p.role]}${chapter ? ` · ${chapter}` : ""}`}
              aria-label={`${name} ${ROLE_LABEL[p.role]}${chapter ? `, ${chapter}을 보고 있어요. 누르면 그 자리로 가요` : ""}`}
              onClick={() => onJump(p)}
            >
              <span className={styles.avatar} aria-hidden="true">
                {name.slice(0, 1)}
              </span>
              <span className={styles.label}>
                <span>
                  {name}
                  {p.role !== "editor" && <span className={styles.role}> {ROLE_LABEL[p.role]}</span>}
                </span>
                {chapter && (
                  <span className={styles.where} data-testid="presence-chapter">
                    {chapter}
                  </span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Person({ person, me }: { person: Participant; me: boolean }) {
  const name = nameOf(person);
  return (
    <li className={styles.person} aria-current={me ? "true" : undefined} title={`${name} · ${ROLE_LABEL[person.role]}`}>
      <span className={styles.avatar} aria-hidden="true">
        {name.slice(0, 1)}
      </span>
      <span className={styles.label}>
        {name}
        {person.role !== "editor" && <span className={styles.role}> {ROLE_LABEL[person.role]}</span>}
        {me && <span className={styles.me}> (나)</span>}
      </span>
    </li>
  );
}
