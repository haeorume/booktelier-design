"use client";

import { useState } from "react";
import { Dialog } from "./Dialog";
import { Icon } from "./Icon";
import styles from "./Dialog.module.css";

/**
 * 편집자 링크 안내(ST-02, FR-46 ①). 책을 만든 뒤 한 번 보인다. 다른 브라우저에서 다시 들어올 때 쓰는
 * 링크라 복사해 보관하라고 안내한다. 남에게 주는 초대 링크와 다르다(L-52). 확인하면 작업 공간으로 간다.
 * 링크에는 편집자 토큰이 들어 있어 이벤트에 주소를 넣지 않는다. 복사 이벤트는 events 탭에 없어 남기지 않는다.
 * 모양은 시안 창(.bf-modal)과 초대 창의 링크 줄(.bf-link-row)을 따라요.
 */
export function EditorLinkDialog({ url, onDone }: { url: string; onDone: () => void }) {
  const [copied, setCopied] = useState<"ok" | "failed" | null>(null);

  async function copy() {
    let ok = true;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      ok = false;
    }
    setCopied(ok ? "ok" : "failed");
  }

  return (
    <Dialog title="편집자 링크" onClose={onDone}>
      <p className={styles.intro}>다른 브라우저나 컴퓨터에서 이 책에 다시 들어올 때 쓰는 링크예요. 복사해서 나만 볼 수 있는 곳에 보관해 주세요. 다른 사람에게는 보내지 마세요.</p>
      <p className={styles.label} aria-hidden="true">
        나만 보관할 링크
      </p>
      <div className={styles.row}>
        <input
          readOnly
          value={url}
          aria-label="편집자 링크 주소"
          data-testid="editor-link"
          onFocus={(e) => e.currentTarget.select()}
          className={styles.input}
        />
        <button type="button" className={styles.secondary} onClick={() => void copy()}>
          <Icon name={copied === "ok" ? "check" : "link"} />
          {copied === "ok" ? "복사됨" : "링크 복사"}
        </button>
      </div>
      {copied === "failed" && (
        <p role="alert" className={styles.alert}>
          복사하지 못했어요. 주소를 골라 직접 복사해 주세요.
        </p>
      )}
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={onDone}>
          확인
        </button>
      </div>
    </Dialog>
  );
}
