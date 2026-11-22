"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/Icon";
import type { Role } from "@/types";
import styles from "./AiChat.module.css";

type Msg = { id: string; from: "user" | "assistant"; body: string };

const PROMPTS: { icon: IconName; label: string; text: string }[] = [
  { icon: "check", label: "교정·교열", text: "현재 원고의 맞춤법과 띄어쓰기를 검토해 줘" },
  { icon: "edit", label: "표현 다듬기", text: "선택한 문장을 자연스럽게 다듬어 줘" },
  { icon: "layout", label: "조판 도움", text: "현재 원고의 조판을 어떻게 정리하면 좋을까?" },
];

function replyFor(prompt: string, chapterTitle: string, role: Role): string {
  const title = chapterTitle || "지금 장";
  if (/조판/.test(prompt)) {
    return role === "designer"
      ? `「${title}」 지면을 살펴봤어요.\n\n여백·행간·판형은 조판 설정에서 바로 비교할 수 있어요. 안내선을 켜 두고 미리보기로 펼침면을 한 번 확인하면 좋아요.\n\n이 안내는 준비된 예시이며 인쇄 적합성 판정은 아닙니다.`
      : `「${title}」 조판을 살펴봤어요.\n\n상단에서 조판으로 바꾸면 판형·여백·행간을 바로 조절할 수 있어요. 안내선을 켜 두고 미리보기로 펼침면을 확인하세요.\n\n이 안내는 준비된 예시이며 인쇄 적합성 판정은 아닙니다.`;
  }
  if (/다듬|윤문|표현/.test(prompt)) {
    return `「${title}」에서 문장 호흡을 살펴봤어요.\n\n반복되는 표현을 덜고, 장면이 보이는 문장으로 바꿔 보는 윤문 예시는 '내 AI 제안' 탭의 카드로 확인할 수 있어요. 장 검토를 누르면 이 장 전체에 제안이 붙습니다.\n\n최종 판단은 원고의 의도와 함께 확인하세요.`;
  }
  return `「${title}」을 맞춤법·띄어쓰기 규칙으로 살펴봤어요.\n\n제안은 '내 AI 제안' 탭의 카드로 정리돼요. 장 검토를 실행하면 이 장 전체를 한 번에 확인합니다.\n\n이 결과는 준비된 규칙과 표현 예시의 검사이며 전체 원고 품질을 보장하지 않습니다.`;
}

/**
 * 검토 패널의 AI 대화(시안 #br-chat-pane). 실제 LLM이 아니라 시안과 같은 예시 응답이에요(D-21).
 */
export function AiChat({
  chapterTitle,
  role,
  onShowSuggestions,
}: {
  chapterTitle: string;
  role: Role;
  onShowSuggestions?: () => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  function send(text: string) {
    const prompt = text.trim();
    if (!prompt || busy) return;
    const user: Msg = { id: crypto.randomUUID(), from: "user", body: prompt };
    setMessages((m) => [...m, user]);
    setDraft("");
    setBusy(true);
    const id = window.setTimeout(() => {
      setMessages((m) => [...m, { id: crypto.randomUUID(), from: "assistant", body: replyFor(prompt, chapterTitle, role) }]);
      setBusy(false);
    }, 700);
    timers.current.push(id);
  }

  return (
    <div className={styles.pane} role="tabpanel" aria-label="AI 대화">
      <div className={styles.log} ref={log} role="log" aria-live="polite" data-testid="ai-chat">
        {messages.length === 0 && !busy ? (
          <div className={styles.welcome}>
            <Icon name="spark" className={styles.welcomeIcon} />
            <h3>{role === "designer" ? "지면을 함께 살펴볼까요?" : "원고를 함께 살펴볼까요?"}</h3>
            <p>
              {role === "designer" ? (
                <>
                  여백, 글자 크기, 행간을 점검해 보세요.
                  <br />
                  원고를 바꾸지 않고 지면 설정을 조정합니다.
                </>
              ) : (
                <>
                  교정, 표기 통일, 문장 호흡을 요청해 보세요.
                  <br />
                  제안은 원고와 연결된 카드로 정리합니다.
                </>
              )}
            </p>
            <small>현재는 준비된 규칙과 표현 예시로 작동합니다.</small>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={m.from === "user" ? styles.user : styles.assistant}>
              <span className={styles.label}>{m.from === "user" ? "나" : "북틀리에 · 규칙 분석"}</span>
              <p>{m.body}</p>
              {m.from === "assistant" && onShowSuggestions && /카드/.test(m.body) && (
                <button type="button" className={styles.jump} onClick={onShowSuggestions}>
                  제안 카드 확인
                </button>
              )}
            </div>
          ))
        )}
        {busy && (
          <p className={styles.pending} aria-label="예시 응답 준비 중">
            살펴보는 중…
          </p>
        )}
      </div>
      <div className={styles.chips}>
        {PROMPTS.map((p) => (
          <button key={p.label} type="button" disabled={busy} onClick={() => send(p.text)}>
            <Icon name={p.icon} size="xs" />
            {p.label}
          </button>
        ))}
      </div>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <label className={styles.srOnly} htmlFor={inputId}>
          원고에 대해 요청하기
        </label>
        <textarea
          id={inputId}
          rows={2}
          value={draft}
          disabled={busy}
          placeholder="현재 장에서 검토할 내용을 말해 주세요."
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              send(draft);
            }
          }}
        />
        <button type="submit" className={styles.send} disabled={busy || draft.trim().length === 0} aria-label="AI 대화 보내기">
          <Icon name="arrow" size="sm" />
        </button>
      </form>
      <p className={styles.foot}>준비된 예시 응답 · 실제 AI API 연결 전</p>
    </div>
  );
}
