"use client";

import { useEffect, useRef, useState } from "react";
import { ROLE_LABEL, roleLinkLabel } from "@/domain/labels";
import { track } from "@/events";
import type { Role, RoleLink } from "@/types";
import { Dialog } from "./Dialog";
import { Icon } from "./Icon";
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
  /** 창 첫 줄에 보일 책 제목(시안 .bf-modal-intro). 없으면 줄을 빼요. */
  bookTitle?: string;
  /** 이미 들어온 사람(시안 .bf-share-members). 편집자는 아래 '나 · 편집자' 줄로 따로 보여요. */
  participants?: { id: string; role: Role; display_name: string }[];
}

const ORDER: Role[] = ["author", "designer"];

/** 서버는 전체 주소를, 1차 브라우저 저장 구현은 경로(/j/…)를 준다. 경로면 지금 주소의 origin을 붙인다. */
export function roleLinkUrl(link: Pick<RoleLink, "url">): string {
  if (!link.url.startsWith("/")) return link.url;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}${link.url}`;
}

/** 역할 카드(시안 .bf-invite-choice): 열리는 작업실과 할 수 있는 일(DESIGN.md 6장 초대 창). */
const ROOM: Record<"author" | "designer", { initial: string; mode: string; can: string; caption: string }> = {
  author: { initial: "A", mode: "Edit", can: "원고 작성 · AI 제안 · 수정 제안 확인", caption: "글을 쓰는 데 필요한 메뉴만" },
  designer: { initial: "D", mode: "Layout", can: "판형 · 서체 · 여백 · 미리보기", caption: "지면을 다루는 데 필요한 메뉴만" },
};

/** 역할 카드 안의 작은 작업실 그림(시안 .bf-mini-workspace). 장식이에요. */
function MiniWorkspace({ role }: { role: "author" | "designer" }) {
  return (
    <span className={styles.mini} data-role={role} aria-hidden="true">
      <span className={styles.miniChrome}>
        <i />
        <i />
        <i />
      </span>
      <span className={styles.miniBody}>
        <span className={styles.miniNav} />
        <span className={styles.miniPaper}>
          <b />
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className={styles.miniTools} />
      </span>
    </span>
  );
}

/**
 * 초대 창(WS-02, L-07, 시안 '참여자 초대와 작업 권한'). 역할마다 다른 링크를 복사한다(FR-05). 편집자만 연다.
 * 시안은 역할을 하나 골라 그 초대장만 보이지만, 여기서는 두 역할 카드 안에 각자의 링크를 함께 보여요.
 */
export function ShareDialog({ links, onCreate, onRotate, onRevoke, onClose, bookTitle, participants }: Props) {
  const [busy, setBusy] = useState<Role | null>(null);
  const [copied, setCopied] = useState<Role | null>(null);
  const [failed, setFailed] = useState<Role | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputs = useRef<Partial<Record<Role, HTMLInputElement | null>>>({});

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

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
  const members = (participants ?? []).filter((p) => p.role !== "editor");

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
    <Dialog title="참여자 초대와 작업 권한" onClose={onClose} wide closeLabel>
      {bookTitle && <p className={styles.intro}>{bookTitle}</p>}
      <p className={styles.scope}>
        <Icon name="info" size="xs" />
        <span>이 책에 초대된 사람만 들어와요. 링크마다 역할이 정해져 있어요.</span>
      </p>
      {members.length > 0 && (
        <ul className={styles.members}>
          {members.map((p) => (
            <li key={p.id} data-role={p.role}>
              <span className={styles.dot} aria-hidden="true">
                {p.display_name.slice(0, 1)}
              </span>
              <span>
                <strong>{p.display_name}</strong>
                <small>{ROLE_LABEL[p.role]}</small>
              </span>
              <b>{p.role === "author" ? "Edit 전용" : "Layout 전용"}</b>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.editor}>
        <span className={styles.dot} data-role="editor" aria-hidden="true">
          E
        </span>
        <span className={styles.editorText}>
          <strong>나 · 편집자</strong>
          <small>원고 편집 + 조판 · 모든 작업 도구와 초대 권한</small>
        </span>
        <span className={styles.tag}>전체 작업실</span>
      </div>
      <p className={styles.prompt}>어떤 역할로 초대할까요?</p>
      <ul className={styles.choices}>
        {ORDER.map((role) => {
          const link = active(role);
          const room = ROOM[role as "author" | "designer"];
          return (
            <li key={role} className={styles.choice} data-role={role} data-ready={link ? "true" : "false"} data-testid={`share-${role}`}>
              <span className={styles.choiceTop}>
                <span className={styles.dot} data-role={role} aria-hidden="true">
                  {room.initial}
                </span>
                <strong>{ROLE_LABEL[role]}</strong>
                <i className={styles.check} aria-hidden="true">
                  <Icon name="check" />
                </i>
              </span>
              <MiniWorkspace role={role as "author" | "designer"} />
              <b className={styles.room}>{room.mode} 작업실</b>
              <small className={styles.can}>{room.can}</small>
              <span className={styles.caption}>{room.caption}</span>
              <div className={styles.issued}>
                {link ? (
                  <>
                    <div className={styles.issuedHead}>
                      <span>
                        <Icon name="check" size="sm" />
                        {roleLinkLabel(role)} 준비 완료
                      </span>
                      <button type="button" className={styles.textButton} onClick={() => run(role, () => onRotate(link))} disabled={busy !== null}>
                        새로 바꾸기
                      </button>
                    </div>
                    <div className={styles.linkRow}>
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
                        <Icon name={copied === role ? "check" : "link"} />
                        {copied === role ? "복사됨" : "링크 복사"}
                      </button>
                    </div>
                    <div className={styles.issuedFoot}>
                      <span>받는 사람은 이름을 넣고 바로 들어와요.</span>
                      <button type="button" className={styles.textButton} onClick={() => run(role, () => onRevoke(link))} disabled={busy !== null}>
                        링크 취소
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className={styles.prepare}>{ROLE_LABEL[role]}에게 필요한 메뉴만 보이는 작업실을 준비해요.</p>
                    <button type="button" className={styles.create} onClick={() => run(role, () => onCreate(role))} disabled={busy !== null}>
                      <Icon name="plus" />
                      링크 만들기
                    </button>
                  </>
                )}
                {failed === role && (
                  <p className={styles.error} role="alert">
                    복사하지 못했어요. 주소를 골라 두었으니 직접 복사해 주세요.
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div className={styles.callout}>
        <strong>링크에 정한 작업실만 열려요.</strong>
        <p>링크를 받은 작가는 원고 편집, 디자이너는 조판만 쓸 수 있어요. 링크가 새었으면 새로 바꾸거나 취소해요.</p>
      </div>
    </Dialog>
  );
}
