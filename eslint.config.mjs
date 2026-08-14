import { defineConfig, globalIgnores } from "eslint/config";
import eslint from "@eslint/js";
import next from "@next/eslint-plugin-next";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  globalIgnores([
    ".next/**",
    "dist/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat["jsx-runtime"],
  reactHooks.configs.flat["recommended-latest"],
  jsxA11y.flatConfigs.recommended,
  next.configs["core-web-vitals"],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.serviceworker,
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  {
    files: ["src/page-shells/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          { name: "tone", message: "页面与展示组件只能通过播放端口使用音频。" },
          { name: "dexie", message: "页面与展示组件只能通过 Repository 端口使用存储。" },
        ],
        patterns: [
          { group: ["@/src/audio/engine/**", "@/src/storage/db/**", "@/src/storage/repositories/**", "@/src/services/**"], message: "页面与展示组件不得导入具体基础设施实现。" },
        ],
      }],
    },
  },
  {
    files: ["src/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: ["react", "tone", "dexie", "next", "next/navigation"],
        patterns: [
          { group: ["@/src/audio/**", "@/src/storage/**", "@/src/services/**", "@/src/page-shells/**"], message: "领域层必须保持纯函数和无副作用。" },
        ],
      }],
    },
  },
]);

export default eslintConfig;
