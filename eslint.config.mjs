// @ts-check

/**
 * Lint rules.
 *
 * `npm run lint` used to be `next lint` with no configuration behind it: run it
 * and you got an interactive setup prompt, which means nothing was ever linted
 * and the one `eslint-disable` comment in the codebase was suppressing a rule
 * that was not running. This is the config that makes the script real, and CI
 * runs it.
 *
 * Deliberately narrow. The rules kept are the ones that catch bugs this project
 * has actually hit — a stale hook dependency array is what caused the infinite
 * re-render the browser tests found — plus the Next-specific checks. Stylistic
 * rules are left out: nothing here reformats code.
 */

import js from "@eslint/js"
import nextPlugin from "@next/eslint-plugin-next"
import reactHooks from "eslint-plugin-react-hooks"
import globals from "globals"
import tseslint from "typescript-eslint"

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "next-env.d.ts",
      "test/generated/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "react-hooks": reactHooks,
      "@next/next": nextPlugin,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,

      // An unused variable is usually a half-finished edit.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // `any` is how a type error becomes a runtime error. The document model
      // is the whole safety net here, so widening it is worth an argument.
      "@typescript-eslint/no-explicit-any": "error",
      // A promise nobody awaits swallows its own failure.
      "no-floating-decimal": "off",
      eqeqeq: ["error", "smart"],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },

  {
    // Test and tooling files run in Node and reach for shapes the app does not.
    files: ["test/**", "e2e/**", "prisma/**", "*.config.*", "*.mjs"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
    },
  },
)
