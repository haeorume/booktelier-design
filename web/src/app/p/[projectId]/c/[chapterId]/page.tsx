import { Suspense } from "react";
import { Workspace } from "./Workspace";

type Params = Promise<{ projectId: string; chapterId: string }>;

// cacheComponents에서는 주소 값(params)을 기다리는 부분을 Suspense 안에 둔다.
export default function WorkspacePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <WorkspaceFromParams params={params} />
    </Suspense>
  );
}

async function WorkspaceFromParams({ params }: { params: Params }) {
  const { projectId, chapterId } = await params;
  return <Workspace projectId={projectId} chapterId={chapterId} />;
}
