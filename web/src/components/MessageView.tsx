import Link from "next/link";
import styles from "./MessageView.module.css";

/** 한 줄 안내와 처음으로 가는 링크만 있는 화면(없는 주소, 쓸 수 없는 링크, 역할 없음). */
export function MessageView({ title, body }: { title: string; body?: string }) {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>{title}</h1>
      {body && <p className={styles.body}>{body}</p>}
      <Link className={styles.link} href="/">
        처음으로
      </Link>
    </main>
  );
}

export const NOT_FOUND = { title: "없는 주소예요", body: "주소를 다시 확인해 주세요." };
