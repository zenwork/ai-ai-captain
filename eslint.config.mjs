// ESLint configuration for AI AI Captain.
// AGENTS.md section 3.3 sets the rule sets. Change the project rules in the last block.
import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // Generated files and third-party code. AGENTS.md section 5 lists the generated files.
    ignores: [
      "dist/",
      "web/",
      "streamdeck/com.local.ai-ai-captain.sdPlugin/",
      "intellij-bridge/",
      "node_modules/",
      "Claude outputs/",
      // Made by scripts/render-design-proposals.mjs.
      "src/shared/card-assets.ts",
      "**/*.js",
      "**/*.mjs",
      "**/*.cjs",
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // One project for all TypeScript files, tests included. See tsconfig.eslint.json.
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Project rules. Each rule here supports a rule in AGENTS.md section 3.
    rules: {
      // AGENTS.md 3.2: give exported functions explicit return types.
      "@typescript-eslint/explicit-module-boundary-types": "error",
      // AGENTS.md 3.2: use type-only imports for types.
      "@typescript-eslint/consistent-type-imports": "error",
      // AGENTS.md 3.1: do not nest conditions more than two levels.
      "max-depth": ["error", 3],
      // AGENTS.md 3.1: use const when the value does not change.
      "prefer-const": "error",
      // Numbers in template strings are safe and common (ports, counts, pixels).
      // Other types stay forbidden. Thus `undefined`, objects, and arrays do not go into text by mistake.
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      // The project does not use noUncheckedIndexedAccess. Thus TypeScript thinks that record, array, and regex
      // match values are always present. At run time they can be undefined, and the `??` fallbacks are necessary.
      "@typescript-eslint/no-unnecessary-condition": "off",
      // AGENTS.md 3.2: use the node: prefix for Node.js built-in modules.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(assert|buffer|child_process|crypto|events|fs|http|https|net|os|path|process|stream|url|util|zlib)(/.*)?$",
              message: "Use the node: prefix for Node.js built-in modules.",
            },
          ],
        },
      ],
    },
  },
  {
    // Tests use mocks and partial fixtures. These rules only make noise there.
    files: ["**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/unbound-method": "off",
      // Mocks of functions that return a promise use `async` without `await`. Example: `vi.fn(async () => "")`.
      "@typescript-eslint/require-await": "off",
      // Some tests run generated script text (macOS automation scripts, the plugin bundle) with fake globals.
      "@typescript-eslint/no-implied-eval": "off",
    },
  },
  // Keep this last. It turns off the style rules that Prettier controls.
  prettier,
);
