import Link from "next/link";
import { ServiceHeader } from "@/app/home/ServiceHeader";
import { Icon } from "./Icon";
import styles from "./MessageView.module.css";

interface Props {
  title: string;
  body?: string;
  /** 제목 위 작은 영문 눈썹(시안 .bf-eyebrow). */
  eyebrow?: string;
  /** 맨 아래 흐린 안내(시안 .bf-local-note). */
  note?: string;
}

/**
 * 한 줄 안내와 처음으로 가는 링크만 있는 화면(없는 주소, 쓸 수 없는 링크, 역할 없음).
 * 모양은 시안의 '초대장을 열 수 없어요' 카드(.bf-join-card + .bf-join-icon)예요.
 */
export function MessageView({ title, body, eyebrow = "PAGE UNAVAILABLE", note }: Props) {
  return (
    <div className={styles.page}>
      <ServiceHeader />
      <main className={styles.main}>
        <div className={styles.card}>
          <div className={styles.icon} aria-hidden="true">
            <Icon name="link" />
          </div>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <h1 className={styles.title}>{title}</h1>
          {body && <p className={styles.body}>{body}</p>}
          <Link className={styles.link} href="/">
            처음으로
          </Link>
          {note && <p className={styles.note}>{note}</p>}
        </div>
      </main>
    </div>
  );
}

export const NOT_FOUND = { title: "없는 주소예요", body: "주소를 다시 확인해 주세요.", eyebrow: "PAGE NOT FOUND" };
