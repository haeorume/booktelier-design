"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, NETWORK, VersionConflictError, type AppDeps } from "@/data";
import { track } from "@/events";
import type { ChapterDoc } from "@/types";

/** 원고 저장 상태(L-42). */
export type SaveState = "saved" | "saving" | "failed" | "offline";
export const SAVE_LABEL: Record<SaveState, string> = { saved: "저장됨", saving: "저장 중", failed: "저장 실패", offline: "연결 끊김" };

interface Options {
  deps: AppDeps;
  projectId: string;
  chapterId: string;
  initialDoc: ChapterDoc;
  initialVersion: number;
  /** 원고를 고칠 수 있는 역할인지(작가, D-14). 아니면 저장하지 않는다(편집기가 열릴 때 문서를 정리해도). */
  editable: boolean;
  /** 저장하려던 원고가 그사이 다른 곳에서 바뀌었다(409). 최신 원고로 다시 그린다(C-4). */
  onConflict: () => void;
  /**
   * 409에 실려 온 최신 원고를 편집기에 바로 그린다(F4). 성공하면 다시 읽기(onConflict)를 하지 않는다.
   * 다시 읽는 동안에도 입력이 계속 409로 막히며 다시 읽기를 처음부터 되풀이하지 않게 한다.
   */
  redraw?: (doc: ChapterDoc) => boolean;
}

/**
 * 원고 저장(A-12, NFR-06, 리뷰 B-1). 입력이 이어지면 앞 저장이 끝난 뒤 이어서 저장한다(한 줄로).
 * 서버가 원고를 바꾼 경우(적용·실행 취소·수락, D-30)에는 편집기에 같은 글자를 반영하되 다시 저장하지 않고
 * 서버가 준 버전을 이어 쓴다(serverEdit). 원고 글자는 이벤트·로그에 넣지 않는다.
 */
export function useManuscriptSave({ deps, projectId, chapterId, initialDoc, initialVersion, editable, onConflict, redraw }: Options) {
  const [saveState, setSaveState] = useState<SaveState>("saved");
  /** 서버가 원고를 바꾸는 요청(적용·실행 취소·수락)을 기다리는 동안 편집기를 잠근다. */
  const [locked, setLocked] = useState(false);
  const docRef = useRef(initialDoc);
  const version = useRef(initialVersion);
  const saving = useRef<Promise<unknown>>(Promise.resolve());
  /** 마지막 원고 저장이 성공했는지. 검토 요청·검토본·적용 전에 본다. */
  const savedOk = useRef(true);
  /** 지금 편집기에 들어오는 변경이 서버가 이미 저장한 것인지 */
  const fromServer = useRef(false);
  /** 저장 줄에 걸려 있는 저장 수. 0이고 마지막 저장이 성공했으면 받은 원고를 합쳐도 된다(F4). */
  const pending = useRef(0);
  /** 서버가 원고를 바꾸는 요청(serverEdit)을 기다리는 중인지 */
  const serverBusy = useRef(false);

  const persist = useCallback(async () => {
    setSaveState("saving");
    try {
      const saved = await deps.library.saveChapterDoc(projectId, chapterId, docRef.current, version.current);
      version.current = saved.version;
      savedOk.current = true;
      setSaveState("saved");
    } catch (e) {
      savedOk.current = false;
      // 실패 종류만 남긴다. 원고 글자는 넣지 않는다(events 탭 save_failed).
      const kind = e instanceof VersionConflictError ? "version_conflict" : e instanceof ApiError && e.code === NETWORK ? "network" : "server_error";
      track("save_failed", { kind });
      if (e instanceof VersionConflictError) {
        setSaveState("saved");
        // 최신 원고로 바로 다시 그린다. 그사이 친 글자도 최신 원고로 바뀐다(C-4). 서버 원고라 다시 저장하지 않는다.
        fromServer.current = true;
        let drawn = false;
        try {
          drawn = redraw?.(e.latest.doc) ?? false;
        } finally {
          fromServer.current = false;
        }
        if (drawn) {
          version.current = e.latest.version;
          savedOk.current = true;
        } else onConflict();
        return;
      }
      setSaveState(kind === "network" ? "offline" : "failed");
    }
  }, [deps, projectId, chapterId, onConflict, redraw]);

  /** 앞 저장이 끝난 뒤 이어서 저장한다(한 줄로). */
  const enqueue = useCallback(() => {
    pending.current += 1;
    saving.current = saving.current
      .then(() => persist())
      .finally(() => {
        pending.current -= 1;
      });
  }, [persist]);

  /** 편집기가 원고를 바꿨다. 서버가 바꾼 것이면 저장하지 않고 true를 돌려준다. */
  const onEdited = useCallback(
    (next: ChapterDoc): boolean => {
      // 글자가 그대로인 변경(편집기 정리 등)은 저장하지 않는다.
      const same = JSON.stringify(next) === JSON.stringify(docRef.current);
      docRef.current = next;
      if (fromServer.current) return true;
      if (same) return false;
      // 편집자·디자이너 화면에서도 편집기가 열릴 때 문서를 정리하며 이 함수가 불린다. 저장할 권한이 없으니 보내지 않는다.
      if (!editable) return false;
      enqueue();
      return false;
    },
    [enqueue, editable],
  );

  /**
   * 저장 중인 원고를 기다리고, 마지막 저장이 실패했으면 한 번 더 저장한다. 그래도 실패면 false.
   * 검토 요청·검토본·적용·수락이 화면의 원고가 빠진 서버 원고로 진행되지 않게 한다(FR-13, FR-38, NFR-06).
   */
  const ensureSaved = useCallback(async () => {
    await saving.current;
    if (savedOk.current) return true;
    enqueue();
    await saving.current;
    return savedOk.current;
  }, [enqueue]);

  /**
   * 서버가 원고를 바꾸는 요청(적용·실행 취소·수락, D-30)을 보낸다. 기다리는 동안 편집기를 잠그고(입력 막음),
   * 응답이 오면 change로 편집기에 같은 글자를 반영하고 서버가 준 버전을 이어 쓴다.
   * 기다리는 사이 원고가 바뀌었거나(잠그기 전에 들어온 입력) 반영하지 못하면 글자를 바꾸지 않고
   * 최신 원고로 다시 그린다. 요청 전에 계산한 자리로 엉뚱한 글자를 바꾸지 않게 한다(NFR-04·05, Codex 검수 11.21).
   * request가 원고를 바꾸지 않았으면(1차 구현, newVersion=null) 잠금만 풀고 change는 부르는 쪽이 한다.
   */
  const serverEdit = useCallback(
    async <T,>(request: () => Promise<{ value: T; newVersion: number | null }>, change: () => boolean): Promise<T | null> => {
      const before = JSON.stringify(docRef.current);
      setLocked(true);
      serverBusy.current = true;
      try {
        const { value, newVersion } = await request();
        if (newVersion === null) return value;
        if (JSON.stringify(docRef.current) !== before) {
          onConflict();
          return null;
        }
        fromServer.current = true;
        let ok = false;
        try {
          ok = change();
        } finally {
          fromServer.current = false;
        }
        version.current = newVersion;
        if (!ok) {
          onConflict();
          return null;
        }
        return value;
      } finally {
        serverBusy.current = false;
        setLocked(false);
      }
    },
    [onConflict],
  );

  /** 저장할 것이 남지 않았는지. 서버 원고를 바꾸는 요청을 기다리는 중이어도 false. */
  const isIdle = useCallback(() => pending.current === 0 && savedOk.current && !serverBusy.current, []);

  /**
   * 다른 곳에서 바뀐 원고를 편집기에 반영한다(F4, A-31). 서버에 이미 있는 원고라 다시 저장하지 않고 받은 버전을 이어 쓴다.
   * 입력 중인 문단을 지켜 그 문단이 서버와 다르면 다음 입력 때 그 버전 위에 저장된다.
   */
  const applyRemote = useCallback((newVersion: number, change: () => boolean): boolean => {
    fromServer.current = true;
    let ok = false;
    try {
      ok = change();
    } finally {
      fromServer.current = false;
    }
    if (ok) version.current = newVersion;
    return ok;
  }, []);

  const retrySave = useCallback(() => {
    enqueue();
  }, [enqueue]);

  // 연결이 끊겨 저장하지 못했으면 다시 연결될 때 다시 저장한다(QA-F11).
  useEffect(() => {
    if (saveState !== "offline") return;
    const onOnline = () => retrySave();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [saveState, retrySave]);

  return { saveState, locked, docRef, version, onEdited, ensureSaved, serverEdit, retrySave, isIdle, applyRemote };
}
