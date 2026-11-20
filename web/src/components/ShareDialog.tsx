"use client";

import { useEffect, useRef, useState } from "react";
import { roleLinkLabel } from "@/domain/labels";
import { track } from "@/events";
import type { Role, RoleLink } from "@/types";
import styles from "./ShareDialog.module.css";

interface Props {
  links: RoleLink[];
  /** 그 역할의 링크를 만든다(FR-05 ①). */
  onCreate: (role: Role) => Promise<void>;
  /** 새로 바꾸면 옛 링크로는 들어올 수 없다(FR-08 ①③). */
  onRotate: (link: RoleLink) => Promise<void>;
  /** 취소한 링크로는 들어올 수 없다(FR-08 ②③). */
  onRevoke: (link: RoleLink) => Promise<void>;
  onClose: () => void;
}

const ORDER: Role[] = ["author", "designer"];

/** 서버는 전체 주소를, 1차 브라우저 저장 구현은 경로(/j/…)를 준다. 경로면 지금 주소의 origin을 붙인다. */
export function roleLinkUrl(link: Pick<RoleLink, "url">): string {
  if (!link.url.startsWith("/")) return link.url;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}${link.url}`;
}

/** 역할 카드 설명은 할 수 있는 일로(DESIGN.md 6장 초대 창). */
const CAN_DO: Partial<Record<Role, string>> = {
  author: "원고 쓰기 · AI 제안 · 수정 제안 받기",
  designer: "조판 설정 · 미리보기 · 의견",
};

/** 초대 창(WS-02, L-07). 역할마다 다른 링크를 복사한다(FR-05). 편집자만 연다. */
export function ShareDialog({ links, onCreate, onRotate, onRevoke, onClose }: Props) {
  const [busy, setBusy] = useState<Role | null>(null);
  const [copied, setCopied] = useState<Role | null>(null);
  const [failed, setFailed] = useState<Role | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputs = useRef<Partial<Record<Role, HTMLInputElement | null>>>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [onClose]);

  async function copy(link: RoleLink) {
    const url = roleLinkUrl(link);
    let ok = true;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      ok = false;
    }
    // 이벤트는 '링크 복사를 눌렀을 때' 남긴다(events 탭). 클립보드에 들어갔는지는 props에 적는다.
    track("role_link_copied", { role: link.role, clipboard: ok ? "ok" : "failed" });
    if (timer.current) clearTimeout(timer.current);
    if (!ok) {
      // 복사하지 못했으면 '복사됨'을 보이지 않고, 주소를 골라 두어 직접 복사하게 한다.
      setCopied(null);
      setFailed(link.role);
      inputs.current[link.role]?.select();
      return;
    }
    setFailed(null);
    setCopied(link.role);
    timer.current = setTimeout(() => setCopied(null), 2000);
  }

  const active = (role: Role) => links.find((l) => l.role === role && !l.revoked_at) ?? null;

  async function run(role: Role, work: () => Promise<void>) {
    if (busy) return;
    setBusy(role);
    setCopied(null);
    setFailed(null);
    try {
      await work();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="share-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="share-title" className={styles.title}>
          참여자 초대
        </h2>
        <p className={styles.hint}>링크마다 역할이 정해져 있어요. 받은 사람은 그 역할로만 들어와요. 링크가 새었으면 새로 바꾸거나 취소해요.</p>
        <ul className={styles.list}>
          {ORDER.map((role) => {
            const link = active(role);
            return (
              <li key={role} className={styles.row} data-testid={`share-${role}`}>
                <span className={styles.label}>
                  {roleLinkLabel(role)}
                  <span className={styles.can}>{CAN_DO[role]}</span>
                </span>
                {link ? (
                  <>
                    <input
                      ref={(el) => {
                        inputs.current[role] = el;
                      }}
                      className={styles.url}
                      readOnly
                      value={roleLinkUrl(link)}
                      aria-label={`${roleLinkLabel(role)} 주소`}
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    <button type="button" className={styles.copy} onClick={() => copy(link)} disabled={busy !== null}>
                      {copied === role ? "복사됨" : "링크 복사"}
                    </button>
                    <button type="button" className={styles.close} onClick={() => run(role, () => onRotate(link))} disabled={busy !== null}>
                      새로 바꾸기
                    </button>
                    <button type="button" className={styles.close} onClick={() => run(role, () => onRevoke(link))} disabled={busy !== null}>
                      링크 취소
                    </button>
                  </>
                ) : (
                  <button type="button" className={styles.copy} onClick={() => run(role, () => onCreate(role))} disabled={busy !== null}>
                    링크 만들기
                  </button>
                )}
                {failed === role && (
                  <p className={styles.error} role="alert">
                    복사하지 못했어요. 주소를 골라 두었으니 직접 복사해 주세요.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        <div className={styles.actions}>
          <button type="button" className={styles.close} onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
