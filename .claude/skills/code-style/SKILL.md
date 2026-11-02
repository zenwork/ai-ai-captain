---
name: code-style
description: Code style, linting, and formatting rules for AI AI Captain. Use when you write or change TypeScript, JSON, YAML, or Markdown, when you finish a task, when `npm run lint` or `npm run format:check` fails, or when you change `eslint.config.mjs`, `.prettierrc.json`, or `.editorconfig`.
---

# Code style and linting

The project uses standard tools for style. The configuration files are the authority. This skill tells you how to use them. `AGENTS.md` section 3 gives the rules for readable code that the tools cannot check.

## 1. Tools and configuration files

| Tool       | File                   | Function                                                                 |
| ---------- | ---------------------- | ------------------------------------------------------------------------ |
| ESLint     | `eslint.config.mjs`    | Correctness and type rules (`strictTypeChecked`, `stylisticTypeChecked`) |
| TypeScript | `tsconfig.eslint.json` | Type information for ESLint, tests included                              |
| Prettier   | `.prettierrc.json`     | Formatting of TypeScript, JSON, YAML, and Markdown                       |
| Prettier   | `.prettierignore`      | Generated files and other projects that Prettier must not change         |
| Editors    | `.editorconfig`        | Indentation, line endings, and line length in IntelliJ and other editors |

ESLint does not control format. `eslint-config-prettier` turns off the ESLint format rules. Thus the two tools do not disagree.

## 2. Commands

| Command                | Function                                              |
| ---------------------- | ----------------------------------------------------- |
| `npm run lint`         | Lint all TypeScript. A warning is a failure.          |
| `npm run lint:fix`     | Repair the lint problems that ESLint can repair       |
| `npm run format`       | Format all files                                      |
| `npm run format:check` | Find files that do not agree with the Prettier format |

## 3. Procedure for a change

1. Write the code to agree with `AGENTS.md` section 3.
2. Format only the files that you changed:

   ```sh
   npx prettier --write <changed files>
   ```

3. Run `npm run lint`.
4. Repair each problem in the code. Run `npm run lint:fix` for problems that ESLint can repair.
5. Run `npm run typecheck` and `npm test`.
6. Tell the user the result of each command.

CAUTION: DO NOT RUN `npm run format` ON ALL FILES IN A FEATURE CHANGE. IT CHANGES MANY FILES. DO IT ONLY WHEN THE USER ASKS, IN A SEPARATE `style:` COMMIT.

## 4. Rules for lint problems

- Repair the cause. Do not hide the problem.
- Do not add `eslint-disable` comments. `AGENTS.md` section 3.3 does not permit them.
- Do not use `any`, `as`, or `!` to stop a type error. Use a `zod` schema or a type guard.
- If a rule is wrong for this project, stop. Tell the user the rule name, the file, and the reason.
- Do not change `eslint.config.mjs` or `.prettierrc.json` without approval from the user.

## 5. Change the configuration

The user can adapt the configuration. When the user asks for a change, obey these rules:

- Put project rules in the "Project rules" block of `eslint.config.mjs`. Write a comment that names the applicable `AGENTS.md` rule.
- Put rules for tests in the `**/*.test.ts` block only.
- Keep `prettier` as the last item in `eslint.config.mjs`.
- Keep `.editorconfig` and `.prettierrc.json` the same for indentation, line endings, and line length.
- When a new source directory has TypeScript, add it to `tsconfig.eslint.json`.
- When a new generated directory exists, add it to the `ignores` list and to `.prettierignore`.
- After a change, run `npm run lint` and `npm run format:check`. Tell the user the number of new problems.

## 6. What the tools do not check

Do these checks yourself. They come from `AGENTS.md` section 3.1:

- Full, descriptive names. No abbreviations.
- Short functions with one purpose.
- Named constants for values that have a meaning.
- Comments that tell why, not what.
- Comments and messages in ASD-STE100 Simplified Technical English.
