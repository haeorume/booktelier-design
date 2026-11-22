import { Suspense } from "react";
import { JoinView } from "./JoinView";

type Params = Promise<{ token: string }>;

// cacheComponents에서는 주소 값(params)을 기다리는 부분을 Suspense 안에 둔다.
export default function JoinPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <JoinFromParams params={params} />
    </Suspense>
  );
}

async function JoinFromParams({ params }: { params: Params }) {
  const { token } = await params;
  return <JoinView token={token} />;
}
