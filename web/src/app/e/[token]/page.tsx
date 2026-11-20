import { Suspense } from "react";
import { EditorLinkView } from "./EditorLinkView";

type Params = Promise<{ token: string }>;

// cacheComponents에서는 주소 값(params)을 기다리는 부분을 Suspense 안에 둔다(/j/[token]과 같음).
export default function EditorLinkPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <EditorLinkFromParams params={params} />
    </Suspense>
  );
}

async function EditorLinkFromParams({ params }: { params: Params }) {
  const { token } = await params;
  return <EditorLinkView token={token} />;
}
