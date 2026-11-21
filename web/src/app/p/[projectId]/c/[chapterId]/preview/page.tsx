import { Suspense } from "react";
import { Preview } from "./Preview";

type Params = Promise<{ projectId: string; chapterId: string }>;

// 미리보기(PV-01, routes 7): 지금 장 주소 뒤에 /preview. 새 탭으로도 열 수 있어요.
export default function PreviewPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <PreviewFromParams params={params} />
    </Suspense>
  );
}

async function PreviewFromParams({ params }: { params: Params }) {
  const { projectId, chapterId } = await params;
  return <Preview projectId={projectId} chapterId={chapterId} />;
}
