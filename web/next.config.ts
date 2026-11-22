import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    resolveAlias: {
      // 미리보기(D-34)의 Paged.js는 원본 소스를 묶으면 딸린 es5-ext가 Turbopack에서 깨져요(contains.call is not a function).
      // Paged.js가 함께 주는 미리 묶은 ESM 파일을 써요.
      pagedjs: "./node_modules/pagedjs/dist/paged.esm.js",
    },
  },
};

export default nextConfig;
