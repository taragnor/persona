import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended, // TS plugin's recommended rules
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-explicit-any": "warn",

      // "no-console": "warn",
      // "eqeqeq": ["error", "always"],
      "curly": "error",
      "prefer-const": "error",
      // "quotes": ["error", "single", { avoidEscape: true }],
      "semi": ["error", "always"],
      // "indent": ["error", 2],
    },
  },
];
