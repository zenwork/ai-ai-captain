---
name: project-structure
description: Project, module, and package structure and the naming conventions for files, symbols, and directories in AI AI Captain. Use when you add a file, a module, a directory, an adapter, or an exported symbol, when you move or rename code, or when you are not sure where code belongs.
---

# Project structure and naming

`architecture.md` **ARCH-03** is the authority for component ownership. `AGENTS.md` section 5 lists the top-level paths. This skill gives the rules to put new code in the correct location and to give it the correct name.

## 1. Packages

The repository has one npm package (`package.json`) and three runtimes. Each runtime has one source root.

| Source root       | Runtime                          | Can import from                          |
| ----------------- | -------------------------------- | ---------------------------------------- |
| `src/server/`     | Hub (Node 20)                    | `src/shared/`                            |
| `src/cli.ts`      | Reporter and hook command (Node) | `src/shared/`                            |
| `streamdeck/src/` | Stream Deck plugin (Node 20)     | `src/shared/`                            |
| `web-src/`        | Dashboard (browser)              | `src/shared/`, `streamdeck/src/cards.ts` |
| `src/shared/`     | All runtimes                     | `src/shared/` only                       |
| `scripts/`        | Build, package, and design tools | All source roots                         |

`intellij-bridge/` is a separate Kotlin project. Do not put TypeScript in it.

### 1.1 Import rules

- `src/shared/` must not import from `src/server/`, `streamdeck/src/`, or `web-src/`.
- `src/shared/` must not use Node.js built-in modules. The browser also uses it.
- `src/server/` must not import from `streamdeck/src/` or `web-src/`. Test files are the only exception.
- `web-src/` imports the card renderer from `streamdeck/src/cards.ts` (ARCH-03). Do not add hardware or Stream Deck SDK imports to `cards.ts`.
- Use relative imports with the `.js` extension. Example: `import { SessionStore } from "./store.js";`. The `NodeNext` module setting needs the extension.
- Import Node.js built-in modules with the `node:` prefix.
- Use `import type` for imports that are only types.

## 2. Where to put new code

Ask these questions in sequence. Use the first answer that is yes.

1. Do two or more runtimes use the code or the type? Put it in `src/shared/`.
2. Is it a contract for external data (HTTP body, file, event)? Put the `zod` schema in `src/shared/` when more than one runtime reads it. Otherwise put it in the module that reads the data.
3. Does it read the state of one harness (Claude, Codex, Copilot, Junie)? Put it in the adapter module for that harness in `src/server/`.
4. Is it about operating system processes, windows, or focus? Put it in `processes.ts`, `focus.ts`, or `macos-platform.ts`. See the `cross-platform` skill.
5. Is it Stream Deck key layout, polling, or actions? Put it in `streamdeck/src/`.
6. Is it dashboard behavior in the browser? Put it in `web-src/`.
7. Is it a build, package, design, or diagnostic tool? Put it in the applicable folder of `scripts/`:
   - `scripts/design/`: design sheets, the deck mockup, marketplace art, and the generation of `src/shared/card-assets.ts`.
   - `scripts/streamdeck/`: the plugin folder, the release pack, the marketplace metadata, and the Stream Deck CLI.
   - `scripts/dev/`: tools for local development, such as the virtual deck app and the key demo.
   - `scripts/diagnostics/`: manual tools that print what a harness or an app exposes. Their output becomes test fixtures.

If no answer is yes, stop. Ask the user. When you add a module, add it to the ARCH-03 table in the same change.

## 3. Modules

- Give each module one purpose. The file name tells the purpose.
- Do not make barrel files (`index.ts`). Import from the module that defines the symbol.
- Do not use default exports. Use named exports only.
- Keep private helpers in the module that uses them. Do not export a symbol only for one test, unless the test cannot examine it through the public functions.
- Put the types of one module in that module. Put types that many hub modules use in `src/server/types.ts`. Put types that many runtimes use in `src/shared/`.
- Split a module when it has two purposes. Example: `claude-usage.ts` is separate from `claude.ts` because usage limits and session tracking are two purposes.

### 3.1 Harness adapters

An adapter reads the state of one harness and feeds the session store. Use this structure:

| Item              | Name pattern             | Example                                |
| ----------------- | ------------------------ | -------------------------------------- |
| Module            | `<harness>.ts`           | `codex.ts`                             |
| Additional module | `<harness>-<purpose>.ts` | `codex-budget.ts`, `claude-desktop.ts` |
| Tracker class     | `<Harness>Tracker`       | `CodexTracker`                         |
| State reducer     | `<Harness>SessionState`  | `CopilotSessionState`                  |
| Owner lookup      | `<harness>Owners`        | `copilotOwners`                        |
| Budget reader     | `<Harness>BudgetReader`  | `CodexBudgetReader`                    |

A new adapter must obey ARCH-09 before you call it supported.

## 4. File and directory names

| Item             | Rule                                                | Example                                                 |
| ---------------- | --------------------------------------------------- | ------------------------------------------------------- |
| Source file      | kebab-case, `.ts`                                   | `hub-supervisor.ts`                                     |
| Test file        | Same name as the source, `.test.ts`, same directory | `hub-supervisor.test.ts`                                |
| Test fixture     | kebab-case, in `fixtures/` next to the tests        | `src/server/fixtures/claude-desktop-cowork-sidebar.txt` |
| Script           | kebab-case, verb first, `.ts` or `.mjs`             | `render-deck-mockup.ts`, `pack-streamdeck.mjs`          |
| Directory        | kebab-case, singular or a known name                | `intellij-bridge`, `web-src`                            |
| Specification    | lower case, `.md`, at the root                      | `architecture.md`                                       |
| Guide for people | UPPER_SNAKE_CASE, `.md`, at the root                | `USER_GUIDE.md`                                         |

- Use only lower-case letters, digits, and hyphens in source file names.
- Write a new script in TypeScript (`.ts`) and run it with `tsx`. Use `.mjs` only when the script must run without `tsx`.
- Do not use the name of the type of code in the file name. Example: use `store.ts`, not `store-class.ts` or `store-utils.ts`.
- Do not make `utils.ts`, `helpers.ts`, or `common.ts`. Name the file for its purpose.

## 5. Symbol names

| Item                                              | Rule                                  | Example                                      |
| ------------------------------------------------- | ------------------------------------- | -------------------------------------------- |
| Class                                             | PascalCase noun                       | `SessionStore`, `HostLifetimes`              |
| Interface and type                                | PascalCase noun                       | `FocusTarget`, `CardPhase`                   |
| Function                                          | camelCase, verb first                 | `parseJunieSettings`, `renderCard`           |
| Function that returns a value with no side effect | camelCase noun                        | `doneAttention`, `codexOwners`               |
| Factory                                           | `create<Thing>`                       | `createApp`, `createFocusHandler`            |
| Parser of external text                           | `parse<Thing>`                        | `parseWindowsProcesses`                      |
| Zod schema                                        | camelCase, `Schema` suffix            | `sessionInputSchema`                         |
| Type from a schema                                | PascalCase, no suffix                 | `type Budget = z.infer<typeof budgetSchema>` |
| Constant                                          | camelCase                             | `inspectionTimeoutMilliseconds`              |
| Boolean                                           | `is`, `has`, `can`, or `should` first | `hasPager`, `isKey`                          |

- Do not use UPPER_SNAKE_CASE for constants. The code uses camelCase.
- Put the unit at the end of a name for a quantity. Use the full word: `Milliseconds`, `Seconds`, `Bytes`, `Pixels`.
- Do not use abbreviations (`AGENTS.md` 3.1). Known technical names are permitted: `Url`, `Id`, `Pid`, `Svg`, `Json`, `Api`.
- Write acronyms as one word in camelCase and PascalCase. Example: `canonicalDashboardUrl`, `JsonReader`.
- Use the same term for the same thing in all files. Use the terms in `functionality.md` and `design.md`. Examples: `session`, `harness`, `host`, `hub`, `card`, `key`.

NOTE: Some older names use `Ms` (`doneAttentionLifetimeMs`, `waitingPulseIntervalMs`). Use `Milliseconds` in new code. Rename an old name only when you change that code for a different reason.

## 6. Move or rename code

1. Find all imports of the symbol or the file.
2. Move the test file with the source file.
3. Change the ARCH-03 table and other documents that give the old path.
4. Run `npm run typecheck`, `npm test`, `npm run lint`, and `npm run build`.

Do not rename files, commands, settings, or API fields that users or other tools use. These are technical names (`AGENTS.md` section 1). `intagration.md` is an example.
