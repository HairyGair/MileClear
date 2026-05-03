// Flat ESLint config for the MileClear monorepo.
// One config governs all four workspaces (api, web, mobile, shared)
// with per-area overrides. Conservative ruleset: TypeScript correctness
// + React hooks. No stylistic rules — Prettier territory.

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";
import globals from "globals";

export default [
  // Ignore generated, build, and vendor output everywhere
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/.expo/**",
      "**/coverage/**",
      "**/ios/**",
      "**/android/**",
      "**/.prisma/**",
      "**/prisma/migrations/**",
      "**/*.d.ts",
      "apps/mobile/plugins/**", // Expo config plugins are CommonJS
    ],
  },

  // Base JS recommended
  js.configs.recommended,

  // TypeScript recommended (non-type-checked variant — type-checked needs
  // a tsconfig per project and would slow CI substantially)
  ...tseslint.configs.recommended,

  // Repo-wide TypeScript rules + globals
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      // Codebase uses `any` deliberately in API boundaries + dynamic JSON
      "@typescript-eslint/no-explicit-any": "off",

      // Allow leading-underscore unused (intentional discard convention)
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // Require statements (lazy native imports for Expo Go compat)
      "@typescript-eslint/no-require-imports": "off",

      // Empty catch blocks are common for "best-effort" sync paths;
      // keep the warning off but flag truly empty functions
      "no-empty": ["error", { allowEmptyCatch: true }],

      // Allow non-null assertions — codebase uses them after explicit checks
      "@typescript-eslint/no-non-null-assertion": "off",

      // Don't ban ts-comment escape hatches; they're rare and intentional
      "@typescript-eslint/ban-ts-comment": "off",
    },
  },

  // React + Next (apps/web)
  {
    files: ["apps/web/**/*.{ts,tsx,js,jsx}"],
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooks,
      "@next/next": nextPlugin,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,

      // React 17+ JSX transform — React import not required
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      // Web uses `<a>` for external/legacy links; Next nag is noisy
      "@next/next/no-html-link-for-pages": "off",
      // We use <img> in some marketing contexts; project decision
      "@next/next/no-img-element": "off",
      // Allow unescaped apostrophes/quotes in copy
      "react/no-unescaped-entities": "off",
    },
  },

  // React Native (apps/mobile)
  {
    files: ["apps/mobile/**/*.{ts,tsx}"],
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooks,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        __DEV__: "readonly",
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react/no-unescaped-entities": "off",
    },
  },

  // Server / Node-only code (apps/api, packages/shared, root scripts)
  {
    files: [
      "apps/api/**/*.ts",
      "packages/shared/**/*.ts",
      "*.config.{js,mjs,ts}",
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // Tests can be a bit looser
  {
    files: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}", "**/__tests__/**"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "no-empty": "off",
    },
  },
];
