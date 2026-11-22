"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getClientSession, type ThemeChoice } from "@/data";
import styles from "./Theme.module.css";

function useThemeChoice(): ThemeChoice {
  const session = getClientSession();
  return useSyncExternalStore(session.subscribe, session.getTheme, () => "system");
}

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** 컴퓨터가 다크 모드인지. 서버에서 그릴 때는 false(화면이 붙은 뒤 바로 맞춰져요). */
function useSystemDark(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(DARK_QUERY);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(DARK_QUERY).matches,
    () => false,
  );
}

/**
 * 고른 테마를 <html data-theme>로 붙여요(다크 테마, 11.22). 고르지 않았으면(system) 붙이지 않아
 * CSS의 prefers-color-scheme이 컴퓨터 설정을 따르게 해요. 루트 레이아웃에 하나만 둬요.
 */
export function ThemeApplier() {
  const choice = useThemeChoice();
  useEffect(() => {
    const root = document.documentElement;
    if (choice === "system") delete root.dataset.theme;
    else root.dataset.theme = choice;
  }, [choice]);
  return null;
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

/** 해·달 전환 버튼. 지금 보이는 테마의 반대로 바꾸고 그 선택을 이 브라우저에 기억해요. */
export function ThemeToggle() {
  const choice = useThemeChoice();
  const systemDark = useSystemDark();
  const dark = choice === "dark" || (choice === "system" && systemDark);
  const label = dark ? "밝은 테마로 바꾸기" : "어두운 테마로 바꾸기";
  return (
    <button
      type="button"
      className={styles.toggle}
      aria-label={label}
      title={label}
      aria-pressed={dark}
      data-testid="theme-toggle"
      onClick={() => getClientSession().setTheme(dark ? "light" : "dark")}
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
