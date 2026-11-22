"use client";

import { useId, useState } from "react";
import { ROLE_LABEL } from "@/domain/labels";
import type { Role } from "@/types";
import { Icon } from "./Icon";
import styles from "./JoinForm.module.css";

interface Props {
  bookTitle: string;
  role: Role;
  onJoin: (name: string) => void | Promise<void>;
  /** 개발용 막대에서 열었을 때 닫기 */
  onCancel?: () => void;
}

/** 역할마다 열리는 작업실(시안 ROLES.mode)과 할 수 있는 일(시안 .bf-join-permissions). */
const ROLE_INFO: Record<Role, { mode: string; room: string; lead: string; can: [string, string] }> = {
  editor: { mode: "Edit + Layout", room: "원고 편집과 조판 작업실", lead: "원고를 고치고 지면을 다루는", can: ["원고 편집 · 조판", "초대 · 검토본 저장"] },
  author: { mode: "Edit", room: "원고 편집 전용 작업실", lead: "글을 쓰고 AI 제안을 받는", can: ["원고 작성 · AI 제안 적용", "편집 제안 확인 · 검토 요청"] },
  designer: { mode: "Layout", room: "조판 전용 작업실", lead: "페이지와 이미지, 서체와 여백을 다루는", can: ["판형 · 레이아웃 · 이미지 배치", "조판 점검 · 의견 주고받기"] },
};

/**
 * 링크로 들어오기(JN-01, 시안 .bf-join-card 가운데). 책 제목과 받은 역할을 보여 주고 이름을 받는다(FR-06 ①②).
 * 초대장 카드 위쪽(동그라미·제목)은 JoinView가, 여기는 초대한 책 상자부터 이름 칸까지 그려요.
 */
export function JoinForm({ bookTitle, role, onJoin, onCancel }: Props) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const empty = name.trim().length === 0;
  const inputId = useId();
  const info = ROLE_INFO[role];

  return (
    <div className={styles.join} data-role={role}>
      <div className={styles.invited}>
        <span className={styles.invitedLabel}>편집자가 초대한 책</span>
        <strong className={styles.book} data-testid="join-book-title">
          {bookTitle}
        </strong>
        <span className={styles.badge}>
          <span data-testid="join-role">{ROLE_LABEL[role]}</span> · {info.mode}
        </span>
      </div>
      <p className={styles.explain}>
        {info.lead}
        <br />
        <strong>{info.room}</strong>이 열립니다.
      </p>
      <ul className={styles.permissions}>
        {info.can.map((c) => (
          <li key={c}>
            <Icon name="check" size="xs" />
            {c}
          </li>
        ))}
      </ul>
      <form
        className={styles.form}
        onSubmit={async (e) => {
          e.preventDefault();
          if (empty || busy) return;
          setBusy(true);
          try {
            await onJoin(name.trim());
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className={styles.label} htmlFor={inputId}>
          함께 작업할 때 사용할 이름
        </label>
        <input id={inputId} className={styles.input} value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={40} placeholder="이름을 입력해 주세요" autoComplete="off" />
        <div className={styles.actions}>
          {onCancel && (
            <button type="button" className={styles.secondary} onClick={onCancel}>
              닫기
            </button>
          )}
          <button type="submit" className={styles.primary} disabled={empty || busy}>
            {ROLE_LABEL[role]} 작업실로 들어가기
            <Icon name="chevron" />
          </button>
        </div>
      </form>
    </div>
  );
}
