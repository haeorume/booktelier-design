"use client";

import { useEffect, useRef, useState } from "react";
import { roleLinkLabel } from "@/domain/labels";
import { track } from "@/events";
import type { Role, RoleLink } from "@/types";
import styles from "./ShareDialog.module.css";

interface Props {
  links: RoleLink[];
  onClose: () => void;
}

const ORDER: Role[] = ["author", "designer"];

export function roleLinkUrl(token: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/j/${token}`;
}

/** 공유 창(WS-02). 역할마다 다른 링크를 복사한다(FR-05). 편집자만 연다. */
export function ShareDialog({ links, onClose }: Props) {
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
    const url = roleLinkUrl(link.token);
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

  const sorted = ORDER.map((r) => links.find((l) => l.role === r)).filter((l): l is RoleLink => !!l && !l.revoked_at);

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="share-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="share-title" className={styles.title}>
          공유
        </h2>
        <p className={styles.hint}>링크마다 역할이 정해져 있어요. 받은 사람은 그 역할로만 들어와요.</p>
        <ul className={styles.list}>
          {sorted.map((link) => (
            <li key={link.token} className={styles.row} data-testid={`share-${link.role}`}>
              <span className={styles.label}>{roleLinkLabel(link.role)}</span>
              <input
                ref={(el) => {
                  inputs.current[link.role] = el;
                }}
                className={styles.url}
                readOnly
                value={roleLinkUrl(link.token)}
                aria-label={`${roleLinkLabel(link.role)} 주소`}
                onFocus={(e) => e.currentTarget.select()}
              />
              <button type="button" className={styles.copy} onClick={() => copy(link)}>
                {copied === link.role ? "복사됨" : "링크 복사"}
              </button>
              {failed === link.role && (
                <p className={styles.error} role="alert">
                  복사하지 못했어요. 주소를 골라 두었으니 직접 복사해 주세요.
                </p>
              )}
            </li>
          ))}
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
