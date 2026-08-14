import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["android/**", "coverage/**", "ios/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["App.tsx", "src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.node,
        __DEV__: "readonly",
        atob: "readonly",
        fetch: "readonly",
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    files: [
      "src/**/*.{spec,test}.{ts,tsx}",
      "src/**/__tests__/**/*.{ts,tsx}",
      "e2e/**/*.ts",
    ],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  eslintConfigPrettier,
);
