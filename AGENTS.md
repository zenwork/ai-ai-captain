# AGENTS.md

This file gives the rules for AI agents that work on AI AI Captain. Obey all rules in this file for each task.

## 1. Language standard

Write all text in [ASD-STE100 Simplified Technical English](https://www.asd-ste100.org/). This rule applies to:

- Documentation and specifications.
- Code comments and JSDoc.
- Commit messages and pull request descriptions.
- User-visible text in the dashboard, logs, and error messages.
- Your replies to the user.

Obey these STE100 rules:

- Use one word for one meaning. Use the same term for the same thing in all files.
- Use the active voice.
- Use the imperative form for instructions.
- Write one instruction in each sentence.
- Keep procedural sentences to a maximum of 20 words.
- Keep descriptive sentences to a maximum of 25 words.
- Keep paragraphs to a maximum of six sentences.
- Use approved STE100 words. Use technical names and technical verbs only when necessary.
- Put a WARNING or a CAUTION before the step that it applies to.

Do not change the names of commands, files, settings, API fields, or labels on the user interface. These names are technical names.

## 2. Specifications and design

The specifications and the design documents are the authority for all work. Read the applicable documents before you change code, tests, or documentation.

| Document                                               | Content                                                                 |
| ------------------------------------------------------ | ----------------------------------------------------------------------- |
| [architecture.md](architecture.md)                     | Component boundaries, data ownership, technology, privacy constraints   |
| [functionality.md](functionality.md)                   | Session behavior, lifecycle states, navigation, acceptance scenarios    |
| [design.md](design.md)                                 | Visual language, state wording, icons, colors, attention, accessibility |
| [intagration.md](intagration.md)                       | Adapter coverage, API, hooks, configuration, installation               |
| [docs/design/README.md](docs/design/README.md)         | Palette gallery, icon sheets, regeneration of design artifacts          |
| [docs/session-tracking.md](docs/session-tracking.md)   | Implementation notes for individual session tracking                    |
| [integrations/README.md](integrations/README.md)       | Harness reporters and automatic adapter limits                          |
| [streamdeck/README.md](streamdeck/README.md)           | Stream Deck plugin, layout, key states, attention timing                |
| [intellij-bridge/README.md](intellij-bridge/README.md) | Optional manual IntelliJ bridge                                         |
| [README.md](README.md)                                 | Overview, local run, session API, development commands                  |
| [USER_GUIDE.md](USER_GUIDE.md)                         | Build, install, run, and configure instructions for users               |

NOTE: The file name `intagration.md` is correct. Do not rename it.

### 2.1 Rules for the specifications

- Find the applicable requirement IDs before you start. Examples: `ARCH-05`, `FUNC-02`, `DSN-03`, `INT-03`.
- Make sure that your change agrees with all four anchor specifications.
- If a specification is unclear or two documents disagree, stop. Tell the user. Do not guess.
- Keep the status terms correct: **Implemented**, **Required**, and **Proposed**.
- When you implement a **Required** item, change its status to **Implemented**.
- Do not mark an item **Implemented** without runtime code and tests.
- Do not implement a **Proposed** item without approval from the user.
- When you change a behavior, a contract, or a visual, update the applicable specification and its acceptance criteria in the same change.
- Keep `README.md` and `USER_GUIDE.md` correct after each change to commands, settings, or installation.

### 2.2 Rules for the design

- Use the state wording, symbols, and colors in `design.md` only.
- Get colors from the palette tokens in `docs/design/palettes/tokens.json` and `src/shared/palette.ts`. Do not write new color values in other files.
- Do not show state with color only. Each state must also have a symbol and a label.
- After a change to key artwork or palettes, run `npm run design:check`.
- To make new design previews, run `npm run design:preview`.

### 2.3 Privacy rules

These rules come from `ARCH-08`. Obey them in all code.

- Do not keep, send, log, or show prompts, transcripts, responses, tool arguments, or tool results.
- Do not show private error messages. Show only safe error codes.
- Keep the hub bound to `127.0.0.1` by default.
- Do not change the settings of Copilot, Codex, or other harnesses.

## 3. TypeScript

### 3.1 Readability

Write code for human readers first. Performance is the second priority, unless a specification gives a performance requirement.

- Use full, descriptive names. Do not use abbreviations. Example: use `sessionIdentifier`, not `sid`.
- Write one statement on each line.
- Keep functions short. Give each function one purpose.
- Use early returns. Do not nest conditions more than two levels.
- Use named constants for numbers and strings that have a meaning. Example: `const closingGracePeriodMilliseconds = 10_000;`.
- Use `const`. Use `let` only when the value changes.
- Prefer clear code to clever code. Do not use complex one-line expressions.
- Write a comment to tell why the code does something. Do not write a comment that only repeats the code.
- Match the style and the structure of the code near your change.

### 3.2 Standards

- Keep `strict` mode on in all `tsconfig.json` files.
- Do not use `any`. Use `unknown` and narrow the type.
- Do not use non-null assertions (`!`) or unsafe type casts (`as`) when a type guard can do the work.
- Validate all external data with `zod` at the boundary. External data includes HTTP bodies, files, and event streams.
- Use ES modules and the `node:` prefix for Node.js built-in modules.
- Give exported functions explicit return types.
- Use `async` and `await`. Do not leave a promise without `await` or error handling.
- Put types that the hub and the plugin share in `src/shared/`.
- Do not add a new dependency without approval from the user.

### 3.3 Linting and formatting

All TypeScript must pass the linter with no errors and no warnings.

- Use ESLint with `typescript-eslint`. Use the `strictTypeChecked` and `stylisticTypeChecked` configurations.
- Do not disable a lint rule in a file or on a line. If a rule is wrong for this project, tell the user.
- Run `npm run lint` before you complete a task.

CAUTION: THE PROJECT DOES NOT HAVE A `lint` SCRIPT AT THIS TIME. DO NOT ADD THE LINTER WITHOUT APPROVAL FROM THE USER. UNTIL THE SCRIPT EXISTS, TELL THE USER THAT YOU DID NOT LINT THE CODE.

### 3.4 Tests

- Write tests with `vitest`. Put each test file next to its source file as `*.test.ts`.
- Add or change tests for each change to behavior.
- Use the acceptance scenarios in `functionality.md` (`FUNC-10`) as test cases where possible.

## 4. Markdown

- Use space padding in all Markdown tables. Put one space or more between each pipe (`|`) and the cell text.
- Make all cells in one column the same width. The pipes must align vertically in the source text.
- Make the separator row the same width as the column. Example: `| ------ |`.
- Use one `#` heading for each file.
- Use relative links to other files in the repository.
- Put commands in code blocks with a language tag. Example: `sh`.

Correct table:

```markdown
| State   | Label   |
| ------- | ------- |
| working | WORKING |
| waiting | WAITING |
```

Incorrect table:

```markdown
|State|Label|
|---|---|
|working|WORKING|
```

When you edit a file that has incorrect tables, correct the tables that you change.

## 5. Project structure

| Path                       | Content                                                   |
| -------------------------- | --------------------------------------------------------- |
| `src/server/`              | Hub: HTTP API, adapters, discovery, store, focus          |
| `src/shared/`              | Code and types for the hub, the plugin, and the dashboard |
| `src/cli.ts`               | Reporter and hook command                                 |
| `web-src/`                 | Dashboard source. The build makes `web/app.js`.           |
| `web/`                     | Static dashboard files and service worker                 |
| `streamdeck/src/`          | Stream Deck plugin source                                 |
| `streamdeck/manifest.json` | Stream Deck plugin manifest                               |
| `intellij-bridge/`         | Optional Kotlin IntelliJ plugin                           |
| `scripts/`                 | Build, package, and design render scripts                 |
| `docs/design/`             | Palettes, icon sheets, and design tokens                  |

Do not edit generated files. Generated files include `web/app.js`, `dist/`, and `streamdeck/com.local.ai-ai-captain.sdPlugin/`.

## 6. Commands

| Command                     | Function                                                 |
| --------------------------- | -------------------------------------------------------- |
| `npm install`               | Install the dependencies                                 |
| `npm run dev`               | Build the dashboard and start the hub in watch mode      |
| `npm run build`             | Build the hub, the dashboard, and the Stream Deck plugin |
| `npm test`                  | Run all tests                                            |
| `npm run typecheck`         | Check the types of the hub and the plugin                |
| `npm run design:check`      | Make sure that design artifacts agree with the renderer  |
| `npm run design:preview`    | Make new SVG and PNG design previews                     |
| `npm run design:mockup`     | Make the animated Stream Deck XL mockup GIF again        |
| `npm run reload:streamdeck` | Build and restart the linked Stream Deck plugin          |

## 7. Before you complete a task

Do these steps in sequence:

1. Run `npm run typecheck`. Make sure that there are no errors.
2. Run `npm test`. Make sure that all tests pass.
3. Run `npm run lint` when the script exists.
4. Run `npm run design:check` if you changed artwork, palettes, or the card renderer.
5. Make sure that the specifications and the documentation agree with your change.
6. Tell the user the result of each step. If a step failed or you did not do it, say so.

Do not commit or push without a request from the user.
