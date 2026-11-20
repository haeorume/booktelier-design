"use client";

import { useState } from "react";
import { ROLE_LABEL } from "@/domain/labels";
import { can } from "@/domain/permissions";
import type { Participant, Role, Snapshot } from "@/types";
import { Dialog } from "./Dialog";
import forms from "./review/forms.module.css";
import styles from "./SnapshotDialog.module.css";

interface Props {
  role: Role;
  snapshots: Snapshot[];
  participants: Map<string, Participant>;
  onSave: (label: string) => Promise<void>;
  /** 목록에는 원고가 없어서(A-29) 열 때 하나를 다시 읽는다. */
  onOpen?: (snapshot: Snapshot) => Promise<Snapshot>;
  onClose: () => void;
}

function when(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * 검토본(WS-03, FR-38). 저장은 편집자만(①), 목록과 열어 보기는 모두(②, 읽기 전용).
 */
export function SnapshotDialog({ role, snapshots, participants, onSave, onOpen, onClose }: Props) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canSave = can(role, "save_snapshot");
  const sorted = [...snapshots].sort((a, b) => b.created_at.localeCompare(a.created_at));

  if (open) {
    return (
      <Dialog title={`검토본 · ${open.label}`} onClose={onClose}>
        <p className={styles.meta}>{when(open.created_at)} 저장 · 읽기 전용</p>
        <article className={styles.preview} data-testid="snapshot-preview">
          {open.doc.content.map((p) => (
            <p key={p.attrs.id}>{(p.content ?? []).map((t) => t.text).join("")}</p>
          ))}
        </article>
        <div className={forms.actions}>
          <button type="button" className={forms.secondary} onClick={() => setOpen(null)}>
            목록으로
          </button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title="검토본" onClose={onClose}>
      {canSave && (
        <form
          className={styles.saveRow}
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
          <label className={forms.label}>
            검토본 이름
            <input className={forms.input} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} />
          </label>
          <button type="submit" className={forms.primary} disabled={!label.trim() || busy}>
            검토본 저장
          </button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      {sorted.length === 0 ? (
        <p className={styles.empty}>아직 저장한 검토본이 없어요.</p>
      ) : (
        <ul className={styles.list}>
          {sorted.map((s) => {
            const who = participants.get(s.created_by);
            return (
              <li key={s.id}>
                <button type="button" className={styles.item} data-testid="snapshot-item" onClick={async () => setOpen(onOpen ? await onOpen(s) : s)}>
                  <span className={styles.name}>{s.label}</span>
                  <span className={styles.meta}>
                    {when(s.created_at)} · {who ? (who.role === "editor" ? ROLE_LABEL.editor : who.display_name) : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className={forms.actions}>
        <button type="button" className={forms.secondary} onClick={onClose}>
          닫기
        </button>
      </div>
    </Dialog>
  );
}
