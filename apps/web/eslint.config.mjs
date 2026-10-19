import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// `next lint` 在 Next 16 被移除，改由 ESLint 直接运行；eslint-config-next 16 原生导出扁平配置。
// `pnpm lint` 仍只检查 `src/`，与 `next lint` 原来的范围一致（public/vad 里是打包好的第三方文件）。
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      // eslint-plugin-react-hooks 7（随 eslint-config-next 16 引入）新增了面向 React Compiler 的
      // 规则，现有代码命中 97 处：渲染期读写 ref 的「最新回调」写法、effect 里同步 setState 等。
      // 先降为警告——它们是启用 React Compiler、改写为 useEffectEvent 的待办清单，不是这次
      // 升级引入的问题；直接报错会让 pre-commit 的 lint 拦下所有人的提交。
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
    },
  },
  // `next lint` 过去自带的忽略项，直接运行 ESLint 时要自己声明。
  globalIgnores([
    ".next/**",
    ".next-*/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);
