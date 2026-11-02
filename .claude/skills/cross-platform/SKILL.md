---
name: cross-platform
description: Rules for code that runs on macOS, Linux, and Windows in AI AI Captain. Use when you add or change process listing, window focus, URL opening, file paths, shell commands, packaging scripts, or tests that touch `process.platform`, `execFile`, `ps`, `lsof`, `osascript`, `xdotool`, or PowerShell.
---

# Cross-platform rules

The hub, the Stream Deck plugin, and the scripts run on macOS, Linux, and Windows. CI runs `typecheck`, `test`, and `build` on all three systems (`.github/workflows/ci.yml`). A change that passes on macOS only is not complete.

## 1. Read the specification first

Read `architecture.md` **ARCH-02** before you change platform behavior. It lists the platform support:

| System  | Process list       | Open files | Focus                        | Open URL        |
| ------- | ------------------ | ---------- | ---------------------------- | --------------- |
| macOS   | `/bin/ps`          | `lsof`     | `osascript`, `/usr/bin/open` | `/usr/bin/open` |
| Linux   | `ps` on the `PATH` | `/proc`    | `xdotool` (X11 only)         | `xdg-open`      |
| Windows | PowerShell         | none       | PowerShell `AppActivate`     | `rundll32.exe`  |

Claude desktop chats, dashboard tab reuse, and IntelliJ project focus are macOS only. If you change this table, update ARCH-02, `intagration.md`, and `USER_GUIDE.md` in the same change.

## 2. Inject the platform

Do not read `process.platform` deep inside logic. Accept it as a parameter with `process.platform` as the default. Examples:

- `listProcesses(platform = process.platform)` in `src/server/processes.ts`
- `createFocusHandler({ platform, run })` in `src/server/focus.ts`
- `hostApplication(pid, processes, platform)` in `src/server/processes.ts`

This lets a test on one system examine the code paths of all systems.

## 3. Run commands safely

- Use `execFile` with an argument array. Do not use `exec` or a shell string.
- Set `timeout` and `maxBuffer` on each call.
- Set `windowsHide: true` for commands that can run on Windows.
- Give PowerShell `-NoProfile -NonInteractive -Command`.
- Set `LC_ALL: "C"` for `ps`, so that dates and names have one format.
- Use absolute paths for macOS system tools (`/bin/ps`, `/usr/bin/osascript`, `/usr/bin/open`). Find Linux tools on the `PATH`.
- Validate each value that goes into a script (AppleScript, PowerShell) with a Zod schema before use. See `focusTargetSchema` in `src/server/focus.ts`.

## 4. Normalize data at the boundary

Make the output of each system the same shape before other code uses it. Example: `parseWindowsProcesses` changes `\` to `/` and removes the `.exe` suffix. Thus the name patterns of the adapters work on all systems.

- Use `node:path` `join` for paths. Do not join paths with `/` or `\`.
- Do not compare paths as strings when the case can differ on Windows.
- When a system cannot supply a value, return an empty result. Example: `listOpenFiles` returns `""` on Windows. Do not throw.

## 5. Fail with a clear reason

When a feature is not available on a system, return a result with a reason that the user can read. Example: "On Linux, install xdotool and use an X11 session." Do not crash and do not fail silently.

## 6. Write tests for all systems

- Inject the platform and a fake command runner. Assert the command and the arguments for each system. See `src/server/focus.test.ts`.
- Use the parser functions (`parseProcesses`, `parseWindowsProcesses`) with sample command output. Put long samples in `src/server/fixtures/`. Do not start real processes in unit tests.
- Use `it.skipIf(process.platform === "win32")` only when the test needs a real file system feature or tool of that system, such as POSIX file modes. Write the reason in the test name or in a comment.
- Do not use `skipIf` to hide a bug on one system.

## 7. Scripts and packaging

- Scripts in `scripts/` also run on Windows. Example: `package-streamdeck.mjs` uses `tar -a` on Windows because Windows has no `zip` command.
- Use `node:fs` functions instead of `rm`, `cp`, or `mkdir` commands.
- In `package.json` scripts, do not use POSIX-only syntax unless the script is for macOS or Linux only. `deck:app` is such a script.

## 8. Checklist before you finish

1. `npm run typecheck` passes.
2. `npm test` passes.
3. Each new platform branch has a test with an injected platform.
4. The behavior for each of the three systems is defined, or the code returns a clear reason.
5. ARCH-02 and the user documents agree with the change.
