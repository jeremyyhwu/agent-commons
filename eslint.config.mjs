import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import firebaseRulesPlugin from "@firebase/eslint-plugin-security-rules";

const eslintConfig = defineConfig([
  // Compiled test output (`npm test` emits here) is generated, not source.
  { ignores: [".tmp-tests/**"] },
  ...nextVitals,
  ...nextTs,
  firebaseRulesPlugin.configs["flat/recommended"],
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

