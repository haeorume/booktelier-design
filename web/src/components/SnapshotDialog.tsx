"use client";

import { useState } from "react";
import { ROLE_LABEL } from "@/domain/labels";
import { can } from "@/domain/permissions";
import type { Participant, Role, Snapshot } from "@/types";
import { Dialog } from "./Dialog";
import { Icon } from "./Icon";
import dialog from "./Dialog.module.css";
import styles from "./SnapshotDialog.module.css";

interface Props {
  role: Role;
  snapshots: Snapshot[];
  participants: Map<string, Participant>;
  onSave: (label: string) => Promise<void>;
  /** 목록에는 원고가 없어서(A-29) 열 때 하나를 다시 읽는다. */
  onOpen?: (snapshot: Snapshot) => Promise<Snapshot>;
  onClose: () => void;
  /** 열어 본 종이 위에 작게 보일 책·장 이름(시안 .bf-snapshot-paper small). 없으면 줄을 빼요. */
  bookTitle?: string;
  chapterTitle?: string;
}

function when(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * 검토본(WS-03, FR-38, 시안 '검토본' 창). 저장은 편집자만(①), 목록과 열어 보기는 모두(②, 읽기 전용).
 */
export function SnapshotDialog({ role, snapshots, participants, onSave, onOpen, onClose, bookTitle, chapterTitle }: Props) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canSave = can(role, "save_snapshot");
  const sorted = [...snapshots].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const author = (s: Snapshot) => {
    const who = participants.get(s.created_by);
    return who ? (who.role === "editor" ? ROLE_LABEL.editor : who.display_name) : "";
  };

  if (open) {
    return (
      <Dialog title={open.label} onClose={onClose} wide closeLabel>
        <div className={styles.meta}>
          <span className={styles.badge}>읽기 전용</span>
          <span>
            {when(open.created_at)} 저장{author(open) ? ` · ${author(open)}` : ""}
          </span>
        </div>
        <article className={styles.paper} data-testid="snapshot-preview">
          {(bookTitle || chapterTitle) && <small className={styles.paperLabel}>{[bookTitle, chapterTitle].filter(Boolean).join(" · ")}</small>}
          <div className={styles.paperText}>
            {open.doc.content.map((p) => (
              <p key={p.attrs.id}>{(p.content ?? []).map((t) => t.text).join("")}</p>
            ))}
          </div>
        </article>
        <button type="button" className={dialog.secondary} onClick={() => setOpen(null)}>
          검토본 목록
        </button>
      </Dialog>
    );
  }

  return (
    <Dialog title="검토본" onClose={onClose} closeLabel>
      <p className={dialog.intro}>저장한 때의 원고를 읽기 전용으로 확인해요.</p>
      {canSave && (
        <form
          className={styles.save}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!label.trim() || busy) return;
            setBusy(true);
            setError(null);
            try {
              await onSave(label);
              setLabel("");
            } catch (e) {
              setError(e instanceof Error ? e.message : "검토본을 저장하지 못했어요.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className={dialog.label} htmlFor="snapshot-name">
            검토본 이름
          </label>
          <div className={dialog.row}>
            <input id="snapshot-name" className={dialog.input} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="예: 1차 검토본" autoComplete="off" />
            <button type="submit" className={dialog.primary} disabled={!label.trim() || busy}>
              검토본 저장
            </button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className={dialog.alert}>
          {error}
        </p>
      )}
      {sorted.length === 0 ? (
        <p className={styles.empty}>아직 저장한 검토본이 없어요.</p>
      ) : (
        <ul className={styles.list}>
          {sorted.map((s) => (
            <li key={s.id}>
              <button type="button" className={styles.item} data-testid="snapshot-item" onClick={async () => setOpen(onOpen ? await onOpen(s) : s)}>
                <span className={styles.itemText}>
                  <Icon name="doc" className={styles.itemIcon} />
                  <strong>{s.label}</strong>
                  <small>
                    {when(s.created_at)}
                    {author(s) ? ` · ${author(s)}` : ""}
                  </small>
                </span>
                <Icon name="right" className={styles.itemIcon} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
