"use client";

import { useState } from "react";
import { can } from "@/domain/permissions";
import { AI_ORIGIN_LABEL, EDIT_STATUS_LABEL, ROLE_LABEL } from "@/domain/labels";
import type { Comment, Participant, Role, SuggestedEdit } from "@/types";
import styles from "./ReviewPanel.module.css";

export type SharedItem =
  | { kind: "edit"; edit: SuggestedEdit; order: number }
  | { kind: "comment"; comment: Comment; replies: Comment[]; quote: string | null; detached: boolean; order: number };

interface Props {
  role: Role;
  items: SharedItem[];
  participants: Map<string, Participant>;
  selected: string[];
  /** 편집자가 아직 열어 보지 않은 의견(확인할 일, FR-02 ②) */
  unseen: Set<string>;
  busy: boolean;
  notice: string | null;
  onSelect: (id: string) => void;
  onAccept: (edit: SuggestedEdit) => void;
  onReject: (edit: SuggestedEdit) => void;
  onReply: (parent: Comment, body: string) => Promise<void>;
}

function Author({ id, participants }: { id: string; participants: Map<string, Participant> }) {
  const p = participants.get(id);
  return (
    <span className={styles.author}>
      <span className={styles.authorName}>{p?.display_name ?? "알 수 없음"}</span>
      {p && <span className={styles.roleBadge}>{ROLE_LABEL[p.role]}</span>}
    </span>
  );
}

/**
 * 함께 봄 탭(WS-47). 사람이 주고받은 의견(WS-49)과 수정 제안(WS-48). 세 역할 모두 본다.
 * 수락·거절은 받은 사람(작가)에게만 보인다(D-14, D-15). 답글만 달린 건과 원고에 반영된 건은 다르게 보인다(FR-36).
 */
export function SharedTab(p: Props) {
  if (p.items.length === 0) return <p className={styles.empty}>아직 주고받은 의견과 수정 제안이 없어요.</p>;
  return (
    <>
      {p.notice && (
        <p className={styles.notice} role="status">
          {p.notice}
        </p>
      )}
      <ul className={styles.cards}>
        {p.items.map((item) =>
          item.kind === "edit" ? (
            <EditCard key={item.edit.id} {...p} edit={item.edit} />
          ) : (
            <CommentCard key={item.comment.id} {...p} comment={item.comment} replies={item.replies} quote={item.quote} detached={item.detached} />
          ),
        )}
      </ul>
    </>
  );
}

function EditCard({ edit, role, participants, selected, busy, onSelect, onAccept, onReject }: Props & { edit: SuggestedEdit }) {
  const decided = edit.status !== "pending";
  return (
    <li
      className={`${styles.card} ${decided ? styles.decided : ""}`}
      data-testid="edit-card"
      data-card-id={edit.id}
      data-status={edit.status}
      aria-current={selected.includes(edit.id) ? "true" : undefined}
      tabIndex={0}
      onClick={() => onSelect(edit.id)}
      onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && onSelect(edit.id)}
    >
      <div className={styles.cardHead}>
        <span className={styles.typeTag}>수정 제안</span>
        <span className={styles.statusChip} data-testid="edit-status">
          {EDIT_STATUS_LABEL[edit.status]}
        </span>
        {edit.status === "accepted" && <span className={styles.reflected}>원고에 반영됨</span>}
      </div>
      <Author id={edit.author_id} participants={participants} />
      <p>
        <del className={styles.editDel}>{edit.original}</del> → <ins className={styles.editIns}>{edit.replacement}</ins>
      </p>
      {edit.ai_origin_id && <span className={styles.aiOrigin}>{AI_ORIGIN_LABEL}</span>}
      {!decided && can(role, "accept_suggested_edit") && (
        <div className={styles.cardActions} onClick={(e) => e.stopPropagation()}>
          <button type="button" className={styles.primaryButton} disabled={busy} onClick={() => onAccept(edit)}>
            수락
          </button>
          {can(role, "reject_suggested_edit") && (
            <button type="button" className={styles.button} disabled={busy} onClick={() => onReject(edit)}>
              거절
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function CommentCard({ comment, replies, quote, detached, participants, selected, unseen, onSelect, onReply, role }: Props & { comment: Comment; replies: Comment[]; quote: string | null; detached: boolean }) {
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <li
      className={styles.card}
      data-testid="comment-card"
      data-card-id={comment.id}
      aria-current={selected.includes(comment.id) ? "true" : undefined}
      tabIndex={0}
      onClick={() => onSelect(comment.id)}
      onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && onSelect(comment.id)}
    >
      <div className={styles.cardHead}>
        <span className={styles.typeTag}>의견</span>
        {replies.length > 0 && <span className={styles.replyCount}>답글 {replies.length}</span>}
        {unseen.has(comment.id) && <span className={styles.unseen}>새 의견</span>}
      </div>
      <Author id={comment.author_id} participants={participants} />
      {quote && <p className={styles.quoteLine}>“{quote}”</p>}
      {detached && <p className={styles.quoteLine}>원문이 바뀌어 지면에 표시하지 않아요.</p>}
      <p className={styles.body}>{comment.body}</p>
      {comment.ai_origin_id && <span className={styles.aiOrigin}>{AI_ORIGIN_LABEL}</span>}
      {replies.length > 0 && (
        <ul className={styles.replies}>
          {replies.map((r) => (
            <li key={r.id} className={styles.reply} data-testid="reply">
              <Author id={r.author_id} participants={participants} />
              <p className={styles.body}>{r.body}</p>
            </li>
          ))}
        </ul>
      )}
      {can(role, "create_comment") && (
        <form
          className={styles.replyForm}
          onClick={(e) => e.stopPropagation()}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!reply.trim() || busy) return;
            setBusy(true);
            try {
              await onReply(comment, reply.trim());
              setReply("");
            } finally {
              setBusy(false);
            }
          }}
        >
          <input className={styles.replyInput} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="답글" aria-label="답글" />
          <button type="submit" className={styles.button} disabled={!reply.trim() || busy}>
            답글
          </button>
        </form>
      )}
    </li>
  );
}
