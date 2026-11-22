"use client";

import { MessageView } from "@/components/MessageView";
import { readInviteToken, tabStorage } from "@/data";
import { useSyncExternalStore } from "react";
import { JoinView } from "./[token]/JoinView";

const noop = () => () => {};

/**
 * 참여 화면(JN-01)에서 주소의 token을 지운 뒤의 주소. token은 이 탭에만 있다(D-27).
 * 새로고침해도 이어지고, 다른 탭이나 브라우저에서 /j만 열면 받은 링크로 다시 들어오라고 안내한다.
 */
export default function JoinWithoutToken() {
  const token = useSyncExternalStore(noop, () => readInviteToken(tabStorage()), () => null);
  if (token) return <JoinView token={token} />;
  return <MessageView eyebrow="INVITATION NEEDED" title="받은 링크로 다시 들어와 주세요" body="링크를 보낸 편집자에게 받은 주소를 그대로 열어 주세요." />;
}
