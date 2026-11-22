import { Suspense } from "react";
import { NewBook } from "./NewBook";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <NewBook />
    </Suspense>
  );
}
