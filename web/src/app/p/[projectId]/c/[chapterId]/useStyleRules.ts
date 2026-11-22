"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppDeps, Ctx } from "@/data";
import type { StyleRule, StyleRuleType } from "@/types";

/**
 * 표기 원칙(A-28, FR-31, WS-51). 이 책의 통일 규칙과 유지 표현 목록.
 * '이 표현 유지'(FR-30)를 누르면 서버가 유지 표현을 더하므로, 그 뒤와 탭을 열 때 다시 읽어요.
 */
export function useStyleRules(deps: AppDeps, ctx: Ctx) {
  const store = deps.review;
  const [rules, setRules] = useState<StyleRule[]>([]);
  const [failed, setFailed] = useState(false);
  const { projectId, chapterId, viewer } = ctx;

  const reload = useCallback(async () => {
    try {
      const list = await store.listStyleRules({ projectId, chapterId, viewer });
      setRules(list);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [store, projectId, chapterId, viewer]);

  // 처음 한 번 읽어요(useShared와 같은 모양: 응답이 오면 넣고, 그사이 화면을 떠났으면 버려요).
  useEffect(() => {
    let alive = true;
    store
      .listStyleRules({ projectId, chapterId, viewer })
      .then((list) => alive && setRules(list))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [store, projectId, chapterId, viewer]);

  const add = useCallback(
    async (type: StyleRuleType, text: string) => {
      const added = await store.addStyleRule({ projectId, chapterId, viewer }, { type, text });
      setRules((list) => [...list, added]);
    },
    [store, projectId, chapterId, viewer],
  );

  return { rules, failed, reload, add };
}
