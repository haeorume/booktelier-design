import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 서버 계약(api/openapi.json)에서 만든 파일. 손으로 고치지 않아요(불변 규칙 R13, npm run gen:api).
    "src/types/api.ts",
  ]),
]);

export default eslintConfig;
