# Integration anchor specification

## Purpose and scope

This file intentionally uses the requested name `intagration.md`. It owns integration boundaries, actual coverage, API/reporting contracts, configuration, installation, and adapter acceptance. Related anchors are [architecture.md](architecture.md), [functionality.md](functionality.md), and [design.md](design.md).

**Implemented** means supported by current code; **Required** identifies agreed behavior still outstanding; **Proposed** identifies an undecided mechanism. In particular, an icon in a design study does not mean the underlying application exposes session telemetry.

## INT-01 — Coverage and prerequisites

| Integration                         | Implemented evidence/path                                                                    | Limits                                                                                                                      |
| ----------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Copilot CLI                         | Live `inuse.<pid>.hold` ownership and per-session `events.jsonl`                             | Depends on installed local event/lock formats                                                                               |
| Copilot in IntelliJ                 | Same session telemetry plus IDE process ancestry/project lifetime evidence                   | Several conversations can share one runtime; ACP variants without these files need another reporter                         |
| Codex CLI                           | Live writer locks/open rollout files and supported rollout events                            | Missing rollout history yields UNKNOWN; not every approval pause is recorded                                                |
| Codex in the ChatGPT desktop app    | Same Codex ownership and rollout telemetry; the key shows the Codex desktop app badge        | Plain ChatGPT chats have no known local status source (see INT-10)                                                          |
| Codex in JetBrains AI Assistant     | Codex ownership/rollout telemetry through the installed ACP runtime                          | Does not intercept/take over JetBrains' app-server connection                                                               |
| Claude Code CLI and IntelliJ        | Live `sessions/<pid>.json` registration, validated process identity, and host lifetime       | Requires the installed registration format; approval states and models must be exported by the runtime                      |
| Claude Code in the desktop app      | Same live registrations with Claude app ancestry                                             | Remote or isolated runtimes without local registrations need a reporter                                                     |
| Junie in IntelliJ IDEA              | `~/.junie/sessions` index, status events, and open IntelliJ project registration             | Needs a running IDEA process; approval waits are not recorded, so WAITING is not shown                                      |
| Other harness hooks                 | Generic CLI/HTTP reporter                                                                    | Requires the harness to invoke configured hooks                                                                             |
| Other IntelliJ tasks                | Optional manual Kotlin bridge                                                                | One manually reported task per project, not per-conversation automatic telemetry                                            |
| Claude desktop chat and task        | Experimental Accessibility adapter for exposed chat and task URLs and known English controls | Requires Accessibility access; hidden chats and other UI formats are not fully supported; tasks have no model or token data |
| ChatGPT / Microsoft Copilot desktop | Main-app detection in `/api/clients`; shown as an APP key on Stream Deck                     | Plain conversations not automatically tracked (see INT-10 for ChatGPT research)                                             |

Node.js 24+ is required to build AI AI Captain and for local hub development. Stream Deck 7.1+ is required for the current plugin; its manifest targets macOS 13+, Windows 10+, and the embedded Node 20 runtime. The plugin also runs the bundled hub on that Node 20 runtime. The default hardware profile targets the XL. macOS is required for the current automatic process/lifetime adapters and focus commands, not for the generic session API itself.

## INT-02 — Automatic adapter contracts

### Copilot

Use `AI_AI_CAPTAIN_COPILOT_HOME`, or `~/.copilot`, as the root containing `session-state`. Only hold files actually opened by their matching live owner establish a candidate session. A historical lock on disk is insufficient.

Reduce supported records as follows:

| Evidence                                                           | Domain result                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `session.start` / `session.resume`                                 | starting; refresh project/model metadata                            |
| User message, assistant turn start/message, ordinary tool activity | working, unless an input/permission request remains outstanding     |
| Permission request, `ask_user`, or `exit_plan_mode` tool           | waiting until outstanding requests resolve                          |
| Turn end, idle, task completion, cancellation                      | done with conversation open, unless user action remains outstanding |
| `session.error`                                                    | failed                                                              |
| `session.shutdown`                                                 | ended completion; normal closing grace period                       |

### Codex

Resolve the root from `AI_AI_CAPTAIN_CODEX_HOME`, then `CODEX_HOME`, then `~/.codex`. Candidates require ownership of `thread-writer-locks/<session-id>.lock` or an applicable open `sessions/**/rollout-*-<session-id>.jsonl`. Indexing files to locate a live owner's rollout must not revive unowned history.

| Evidence                                          | Domain result                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| `session_meta`                                    | starting and project metadata                                                   |
| `turn_context` / `thread_settings_applied`        | Metadata only; no invented activity                                             |
| `event_msg.task_started` / `turn_started`         | working                                                                         |
| Blocking `request_user_input` call and its result | waiting until the request is resolved                                           |
| Task/turn completion or turn abort                | done with conversation open; avoid completing a newer turn from a stale turn ID |
| Session-level error / turn failure                | failed                                                                          |

Missing, unreadable, or unrecognized telemetry must remain distinguishable in diagnostics. Live ownership alone cannot establish whether the AI is working, waiting, or done.

### Shared host lifetime

The adapters additionally inspect revoked standard terminal descriptors, remembered runtime-to-app ancestry, and schema-v2 JetBrains project registrations under `~/.junie/instances`. `AI_AI_CAPTAIN_JETBRAINS_INSTANCES` overrides that location; running the Junie CLI is not a prerequisite.

Coverage must be established for the owning IDEA process before an absent registration can prove project closure. Match actual canonical project paths, including nested working directories, not just project names or arbitrary files retained by the IDE. Registration creation time and supported session/turn triggers exclude conversations from previous project openings.

Registry errors/unsupported formats or unavailable terminal evidence fail open for lifetime filtering: they do not prove closure. Remembered ownership/capability records use process start identity to reject PID reuse. Registry RPC tokens must never enter hub metadata. The hub must not kill processes to clear keys.

### Junie adapter

Read `index.jsonl` and each session's `events.jsonl` under `AI_AI_CAPTAIN_JUNIE_HOME`, or `~/.junie/sessions`. Read only the session identifier, the project folder, and the status field of the last status event. Never read prompts, task names, or responses.

Map `IN_PROGRESS` to WORKING, `COMPLETED` to DONE, and `FAILED` to FAILED. Map other values to UNKNOWN. Show a session only when its project is open in a running IntelliJ IDEA process. When multiple IDEA processes run, bind focus to the process whose project registration is open. Report the session with the JetBrains AI identity.

### Claude adapters

Claude Code reads `sessions/<pid>.json` under `AI_AI_CAPTAIN_CLAUDE_HOME`, then `CLAUDE_CONFIG_DIR`, then `~/.claude`.
The file must match a live `claude` executable, PID, process-start identity, and local PID domain.
The installed 2.1.309 registration uses UTC for its unzoned `procStart` value. Stale registrations never create sessions.
Reads reject registrations above 64 KiB. Invalid or incomplete live registrations make previously confirmed sessions UNKNOWN.
Only session ID, project, optional model, status, and timestamps enter the hub. Names, socket paths, keys, and authentication fields are discarded.
The adapter reads only the end of the session transcript (`projects/<project>/<sessionId>.jsonl`). It keeps the model name and token counts from the latest assistant line. It never keeps message text. The context percent assumes a 200,000-token window. The adapter does not install hooks or change Claude settings.
Generic hooks remain an alternative for versions without the required registration or state fields.

Claude desktop chat inspection uses macOS Accessibility. Enable access for the application that runs the hub, then restart it.
The inspector reads exposed conversation URLs, roles, enabled flags, and known control labels only.
It does not read message text, composer values, cookies, authentication storage, or private errors.
The adapter follows exposed `claude.ai/chat/<UUID>` web areas, not chat history links.
It also follows exposed `claude.ai/cowork/cse_<ID>` (Cowork) and `claude.ai/code/session_<ID>` (Claude Code) task web areas.
A task runs in the cloud or in an isolated VM, so it has no local `sessions/<pid>.json` registration.
A task key uses application focus. The deep-link contract covers chats only.
The adapter also reads each row of the "Chats and tasks" sidebar list. Each row has a status indicator.
`Running` gives WORKING. A working task can show its current activity in place of `Running`, for example `Using the browser`. Any other status indicator label also gives WORKING. `Awaiting input` and `Awaiting answer` give WAITING. `Unread response`, `Done`, and `Completed` give DONE. `Error` gives FAILED. `Idle` and `Archived` rows are not reported.
The inspection script changes each row title into a 64-bit hash. The title does not leave the script. The hub keeps only the hash.
When the open page title agrees with a row title, the page joins that row. The row identity stays the same when the user opens another page.
A hidden sidebar or a filtered list removes the rows that it does not show, after 15 seconds. The app sorts its sidebar again when a task changes, so one scan can miss a row. During the 15 seconds, the session keeps its key position and its completion time. A changed title gives a new row identity.
DONE attention: a row that the hub sees change to DONE flashes as a new completion. A row that is already DONE at its first scan has no known completion time, so it does not flash. A row that the app shows as read (`Done` or `Completed`, not `Unread response`) does not flash, because the user has opened it. The adapter sets `completionAttention: "none"` in the session metadata for these rows.
The adapter reads the model picker label of the open page, for example `Model: Opus 5.5 Medium`. It changes the label to a model name such as `claude-opus-5-5` and does not keep the effort level.
The hub keeps the last model of each chat or task after the user leaves its page. The app does not show tokens, context use, freedom, or approval, so the info key leaves them empty.
Inspection is bounded to 6000 elements and four seconds. A long conversation can pass the element limit. Then the scan reports the sessions that it found and removes no session. Unsupported UI formats fail to UNKNOWN or app-presence diagnostics.
The installed desktop app must expose these controls; full UI-version coverage is not yet verified.

The [Claude deep-link contract](https://support.claude.com/en/articles/14729294-open-claude-desktop-with-a-link) defines existing-chat navigation.
`FocusTarget.claudeConversationId` accepts a UUID only. The hub constructs `claude://claude.ai/chat/<UUID>` without arbitrary URI parameters.
Successful navigation returns `scope: "session"`; it does not set assessed DONE.

## INT-03 — Session HTTP API

The default base URL is `http://127.0.0.1:43681`.

| Method and path                       | Contract                                                                                                                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /health`                         | Hub process health, not proof that every adapter is operational                                                                                                                                        |
| `GET /api/sessions`                   | `{ "sessions": [...], "settings": { "palette": "fjord", "flashIntensity": 2 } }` current inventory and appearance                                                                                      |
| `GET /api/settings`                   | Current settings and supported palette IDs/names; flash intensity is an integer from 0 to 4                                                                                                            |
| `GET /api/dashboard/browser`          | Current macOS default browser, tab adapter, and Accessibility trust status                                                                                                                             |
| `POST /api/dashboard/open`            | Reuse the configured dashboard tab, or open through the default browser if reuse fails; returns `opened`, `reused`, browser metadata, or a safe reason; arbitrary caller URLs are ignored              |
| `PUT /api/settings`                   | Validated `{ "palette": "fjord" \| "nocturne" \| "ember-ice" \| "signal" \| "porcelain", "flashIntensity": 0 }`; optional intensity is 0–4 and stays unchanged when omitted; saves hub-wide appearance |
| `GET /api/clients`                    | `{ "clients": [...] }` detected app presence with session tracking unavailable                                                                                                                         |
| `PUT /api/sessions/:id`               | Validated session upsert; body `id` must match URL-decoded path ID                                                                                                                                     |
| `POST /api/sessions/:id/end`          | `{ "state": "done" }` or `{ "state": "failed" }`; explicitly closes one record                                                                                                                         |
| `POST /api/sessions/:id/focus`        | Navigation result with `focused` and optional scope/reason                                                                                                                                             |
| `POST /api/sessions/:id/dismiss`      | Hide a DONE, FAILED, or UNKNOWN session until its state or state change time changes; sets `dismissedAt`. 404 for a missing session, 409 for an active one                                             |
| `POST /api/sessions/:id/attend`       | Mark a DONE session as attended until its state or state change time changes; sets `attendedAt`. The key shows assessed DONE. 404 for a missing session, 409 for any other state                       |
| `GET /api/events`                     | SSE snapshot, then session/client/settings/budget changes                                                                                                                                              |
| `GET` / `PUT` / `DELETE /api/budgets` | Subscription budgets. Refer to `INT-12`                                                                                                                                                                |

The API accepts metadata, not transcripts. Request bodies are limited to 32 KiB, with field lengths constrained by `src/shared/session.ts`. Encode session IDs when constructing URLs. Invalid input returns 400; nonexistent end/focus targets return 404. A focus operation can return HTTP 200 with `focused: false`, so clients must check the result as well as the HTTP status.

Example open session report:

```sh
curl -X PUT http://127.0.0.1:43681/api/sessions/example%3Areview-42 \
  -H 'Content-Type: application/json' \
  -d '{"id":"example:review-42","source":"example","harness":"example-cli","label":"Code review","state":"working","ended":false,"project":"/absolute/project/path","focusTarget":{"appName":"Terminal"}}'
```

Optional fields `tokensUsed` (integer), `contextUsedPercent` (0–100), `freedom` (`limited` or `full`), and `approval` (`asks` or `never`) feed the **AI Session Info** key. The Codex adapter fills them from `turn_context` and `token_count` events. The Junie adapter fills them from `settings.json` (`model`, `braveMode`) and from `ContextWindowReportEvent` events. For Junie, `tokensUsed` is the context tokens in use. Brave mode `ON` maps to `full` and `never`. The adapters store mode names and numbers only.

Reuse that ID for every update. For a completed turn, send `state: "done", ended: false`; use the end route for closure. The public upsert schema does not accept reporter-supplied store timestamps as lifecycle clock fields. Built-in adapters pass observed times internally; generic HTTP reports normally use receipt-time behavior.

`POST /api/sessions/:id/attend` is the assessment route. The Stream Deck plugin calls it after a single press on a DONE key. `attendedAt` is a store field: the upsert schema does not accept it from reporters, and every new state or completion time clears it. Navigation alone never sets it.

### SSE contract

Messages are JSON in SSE `data:` records:

- `snapshot`: `sessions`, `clients`, and `settings` on connection/reconnection.
- `upsert`: one `session` record.
- `remove`: one session `id`.
- `clients`: replacement `clients` inventory.
- `settings`: saved hub-wide `settings`, including the icon `palette` and `flashIntensity`.
- `budgets`: the full list of subscription budgets (`INT-12`).

The hub emits comment heartbeats every 15 seconds. Consumers must handle reconnection through a new full snapshot; there are no durable event IDs/replay guarantees. The browser uses SSE; Stream Deck currently polls snapshots every 1.5 seconds.

## INT-04 — CLI and hooks

From the repository root:

```sh
npm run report -- upsert --id example:review-42 --source example \
  --harness example-cli --state working --label "Code review" \
  --project "$PWD" --app "Terminal"
npm run report -- upsert --id example:review-42 --source example \
  --harness example-cli --state done --label "Code review"
npm run report -- end --id example:review-42 --state done
```

`upsert` uses `ended: false` and prints the ID. If no ID is supplied, it generates one; callers must retain/reuse it rather than creating a new conversation on each update. Optional focus arguments include `--app`, `--bundle-id`, and `--pid`.

The generic hook entry point accepts one JSON object on stdin:

```sh
printf '%s\n' '{"session_id":"conversation-42","cwd":"/absolute/project/path"}' | \
  node dist/cli.js hook claude-code SessionStart --app "Terminal"
```

Configure the harness to invoke the command on its real events; this command alone does not install vendor hooks. Accepted identity keys are `session_id`, `session-id`, `sessionId`, `thread-id`, `thread_id`, and `threadId`, or explicit `--id`. An event's generic `id` must not be mistaken for conversation identity. Payloads without a session identifier are rejected.

The reporter normalizes lifecycle names and retains selected metadata only. Start/resume means starting; work/tool events mean working; permissions/input requests mean waiting; completion/idle means done and open; end/shutdown means ended. `Notification` uses its `notification_type`; unknown classifications mean unknown. Confirm mappings against the harness version instead of assuming every similarly named event has identical semantics. Privacy remains the reporter's responsibility.

## INT-05 — Focus integration

The macOS adapter validates IntelliJ's absolute project directory and opens it as a document with the owning installation:

```text
open -a <owning IDEA.app> <absolute project directory>
open -b <IDEA bundle ID> <absolute project directory>
```

Do not use `-n` or `--args`; these options start a new IDEA process or pass the project path as an application argument. Opening the project as a document lets macOS reuse the selected running installation. The adapter reports project scope when the command succeeds. Other sessions use supported app-path/name, bundle-ID, optional PID, or HTTP(S) URL navigation. `AI_AI_CAPTAIN_PRECISE_FOCUS=1` enables an attempted PID-based app focus, which may need Accessibility permission; project targeting takes precedence.

Focus scopes are application, project, and session. An identified Claude desktop chat uses session scope through its restricted deep link. On macOS, a Claude desktop sidebar row uses session scope when the hub opens that row. The hub finds the row through Accessibility and clicks it with a mouse event, then restores the pointer position. The app ignores the Accessibility press on sidebar rows. This click is the only action that the Claude adapter does in the app. The press reuses the inspection script with the row title key as a second argument. A successful navigation command does not prove that the user read the result. Assessed DONE remains unimplemented.

## INT-06 — Stream Deck installation and layout

```sh
npm install
npm run build
npm install -g @elgato/cli
streamdeck dev
streamdeck link streamdeck/com.local.ai-ai-captain.sdPlugin
streamdeck restart com.local.ai-ai-captain
```

Select the **AI AI Captain XL** profile in Stream Deck. The plugin starts the bundled hub automatically when no hub answers at `AI_AI_CAPTAIN_URL` (see ARCH-01). A successful `streamdeck link` only links the package; it does not prove that its process connected or a profile is active.

The build copies the hub to `com.local.ai-ai-captain.sdPlugin/bin/hub.cjs` and the static dashboard to `com.local.ai-ai-captain.sdPlugin/web/`. The supervised hub writes only warnings and errors. These lines go to the plugin log.

To develop the hub with `npm run dev`, start the dev hub before the plugin. The plugin then uses the dev hub. If the plugin hub runs already, do these steps:

```sh
streamdeck stop com.local.ai-ai-captain
npm run dev
streamdeck restart com.local.ai-ai-captain
```

For a later linked update, use `npm run reload:streamdeck`. This rebuilds the plugin, the hub, and the dashboard bundles, enables developer mode, and restarts the plugin. The restart also restarts the supervised hub. Reinstallation/profile reimport is normally unnecessary and must not be used to overwrite a custom layout. The CLI can report restart success while Stream Deck ignores it when developer mode is disabled; verify a fresh plugin connection/reload in the app log.

Available actions are:

| Action                       | UUID                                    |
| ---------------------------- | --------------------------------------- |
| AI Session                   | `com.local.ai-ai-captain.session`       |
| Previous Session Page        | `com.local.ai-ai-captain.previous-page` |
| Next Session Page            | `com.local.ai-ai-captain.next-page`     |
| Open AI AI Captain Dashboard | `com.local.ai-ai-captain.dashboard`     |
| AI Session Info              | `com.local.ai-ai-captain.session-info`  |

Drag **Open AI AI Captain Dashboard** onto any preferred key. INFO is not automatically appended. Other controls may replace session slots; remaining session keys compact and paging adjusts, up to 30 per device.

## INT-07 — Optional IntelliJ bridge

The manual bridge is not needed for the supported automatic Copilot/Codex adapters. It does not observe all JetBrains AI or Copilot conversations, register automatic project-close reporting, or provide conversation-tab focus.

Build with Gradle 8.13+ and JDK 21 using `gradle buildPlugin` in `intellij-bridge/`. `AI_AI_CAPTAIN_IDEA_HOME` can select an installed IDEA distribution; otherwise the build targets IDEA Community 2025.1. Install `intellij-bridge/build/distributions/ai-ai-captain-intellij-bridge-0.1.0.zip` through **Settings → Plugins → gear → Install Plugin from Disk…**, then restart when prompted.

Use **Tools → AI AI Captain** to start/update a task, mark it waiting, or end it. It currently sends legacy terminal reports without explicit `ended` semantics, so completed manual records expire rather than implementing the full open-conversation lifecycle. Do not present this fallback as automatic per-session coverage. Detailed setup remains in [intellij-bridge/README.md](intellij-bridge/README.md).

## INT-08 — Configuration and operational data

Use **Icon palette** and **Flash intensity** in the dashboard to save shared appearance settings in `settings.json` in the data directory. The palette defaults to Fjord; flash intensity defaults to 2 and accepts levels 0 to 4. Both settings survive restarts, reach browsers through SSE, and reach Stream Deck through its normal session poll. The initial renderer upgrade needs a hub rebuild/restart and plugin reload; later appearance changes need no restart or reinstall. Artwork notices ship with the plugin and static web client.

| Variable                            | Consumer                     | Default / meaning                                                                                                          |
| ----------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `AI_AI_CAPTAIN_DECK_PORT`           | `deck:app` hub               | `43682`; separate from the Stream Deck hub                                                                                 |
| `AI_AI_CAPTAIN_DECK_WINDOW_SIZE`    | `deck:app` browser           | `420,140`; Chrome or Chromium app window size                                                                              |
| `AI_AI_CAPTAIN_PORT`                | Hub                          | `43681`; hub remains bound to `127.0.0.1`                                                                                  |
| `AI_AI_CAPTAIN_URL`                 | CLI, Stream Deck, IDE bridge | `http://127.0.0.1:43681`; set consistently when changing ports                                                             |
| `AI_AI_CAPTAIN_DATA_DIR`            | Hub                          | `~/Library/Application Support/ai-ai-captain`; an earlier `ai-deck` directory moves here at first start                    |
| `AI_AI_CAPTAIN_WEB_DIR`             | Hub                          | Static web directory; otherwise repository `web/`. The plugin sets the plugin `web/` directory for the supervised hub      |
| `AI_AI_CAPTAIN_LOG_LEVEL`           | Hub                          | `info`; one of `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`. The plugin sets `warn` for the supervised hub |
| `AI_AI_CAPTAIN_EXIT_WITH_PARENT`    | Hub                          | Internal flag set by the plugin. `1` stops the hub when its parent process stops                                           |
| `AI_AI_CAPTAIN_COPILOT_HOME`        | Copilot adapter              | `~/.copilot`, containing `session-state`                                                                                   |
| `AI_AI_CAPTAIN_CODEX_HOME`          | Codex adapter                | Overrides `CODEX_HOME`, then `~/.codex`                                                                                    |
| `AI_AI_CAPTAIN_CLAUDE_HOME`         | Claude Code adapter          | `CLAUDE_CONFIG_DIR` or `~/.claude`; live session registrations                                                             |
| `AI_AI_CAPTAIN_JUNIE_HOME`          | Junie adapter                | Overrides `~/.junie/sessions`                                                                                              |
| `AI_AI_CAPTAIN_JETBRAINS_INSTANCES` | Lifetime inspector           | `~/.junie/instances`                                                                                                       |
| `AI_AI_CAPTAIN_PRECISE_FOCUS`       | Hub focus adapter            | Opt-in `1` for attempted PID app focus                                                                                     |
| `AI_AI_CAPTAIN_IDEA_HOME`           | Bridge build                 | Optional local IDE installation                                                                                            |

Environment variables must be available to the actual process, not merely an unrelated terminal; GUI-launched apps may not inherit shell configuration. The supervised hub gets the environment of the Stream Deck plugin process. Thus, it normally uses the default values. To use other values, start the hub manually with the variables before the plugin starts. No property-inspector URL setting is currently implemented for the Stream Deck action.

Operational files include `sessions.json` and `host-lifetimes.json` under the data directory. Logs include `~/Library/Logs/ElgatoStreamDeck/StreamDeck.log` and plugin logs under `streamdeck/com.local.ai-ai-captain.sdPlugin/logs/` for a linked development installation. The plugin logs also contain the warnings and errors of the supervised hub. Diagnostics should prefer safe evidence/error codes over copying private transcripts or command arguments.

## INT-09 — New integrations and validation

Before claiming automatic Claude Desktop or another new adapter, establish:

1. Real, stable per-conversation identity and the difference between a client, runtime, session, and model.
2. Evidence for starting, working, input-required waiting, completion, failure, and unknown.
3. Closure/reopening behavior, including background runtimes and stale history.
4. Supported app/project/session navigation scope and whether a visit can actually be verified.
5. Metadata-only processing, local permissions, version/format assumptions, and honest fallback behavior.
6. Regression tests for independent sessions, telemetry failures/recovery, lifecycle cleanup, and privacy; no app-presence shortcut.

Validation commands for relevant implementation changes are:

```sh
npm test
npm run typecheck
npx tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler --lib ES2022,DOM web-src/main.ts
npx tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler --lib ES2022,DOM web-src/deck.ts web-src/deck.test.ts
npm run build
streamdeck validate streamdeck/com.local.ai-ai-captain.sdPlugin
```

Review SVGs at 72 pixels and on the physical device. After a linked plugin reloads, verify a fresh app-log connection. Additional integration event mappings and examples are in [integrations/README.md](integrations/README.md); these anchors govern the cross-integration invariants and explicitly identify remaining gaps.

## INT-10 — ChatGPT desktop research

**Proposed.** Do not implement without approval from the user.

Findings from a local check on macOS:

- `/Applications/ChatGPT.app` has the bundle ID `com.openai.codex`. It is the Codex desktop app under the ChatGPT name. The hub now uses this bundle ID for app focus.
- The app has no `com.openai.chat` data folder. An earlier ChatGPT app stored chats in `~/Library/Application Support/com.openai.chat`. This folder does not exist for the current app, and the old files were not encrypted. Do not read chat files.
- Its coding threads run through the Codex app server in `~/.codex`. The folder has `thread-writer-locks/`, `sessions/**/rollout-*.jsonl`, and `hooks.json`. The existing Codex adapter reads these files.
- Plain chat conversations in ChatGPT have no known local status file or hook.

Options:

| Option                            | Coverage                               | Risk                                                                           |
| --------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------ |
| Use the Codex adapter for threads | Codex threads in the ChatGPT app       | Check that the app server holds the locks for each thread                      |
| Add a `hooks.json` reporter       | Codex threads, with WAITING events     | The user must change `~/.codex/hooks.json`; AGENTS.md forbids the hub to do it |
| Use Accessibility like Claude     | Plain chat, if the UI exposes identity | Fragile; needs a stable chat identifier first                                  |

Next step: run a Codex thread in the ChatGPT app. Check if the Codex adapter shows it. Report the result before any new code.

## INT-11 — Claude desktop adapter on Windows

**Proposed.** Do not implement without approval from the user.

The Claude desktop adapter and sidebar row focus use macOS Accessibility only. Windows has UI Automation. PowerShell can read it and can invoke a button.
The Claude app uses Chromium, so it probably shows a similar tree. Nobody has verified the names, the status indicators, or the page URLs on Windows.

Next step: on a Windows computer, open the Claude app with some running tasks. Run `scripts/claude-uia-tree.ps1 > logs\claude-uia-tree.txt`. Remove titles, message text, and personal names. Add the result as a test fixture. Then write the PowerShell inspector so that it gives the same JSON snapshot as the macOS script.

## INT-12 — Subscription budget keys

**Implemented.** The design is in `docs/design/subscription-budget-key.svg`. The Stream Deck plugin has one action for each provider: **AI Budget: Claude**, **AI Budget: OpenAI**, **AI Budget: GitHub Copilot**, and **AI Budget: JetBrains AI**. Pressing a budget key opens the usage page of the provider in the default browser.

The hub keeps the newest budget of each provider in `budgets.json` in its data folder (`src/server/budgets.ts`). It keeps only numbers, plan names, and reset times. It does not keep account tokens (`ARCH-08`). Reported budgets stay after a restart. When the hub starts, it reads the Codex source at once. When the Stream Deck plugin starts or reloads, it calls `POST /api/budgets/refresh` once. Then a hub that was already running reads the automatic sources again.

| Provider       | Values                                                | Source                                                                                                                     | Status                                    |
| -------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| OpenAI         | Plan, 5-hour and weekly percent used, resets, credits | `rate_limits` in Codex rollout `token_count` events. Verified on macOS                                                     | **Implemented**                           |
| Claude         | 5-hour and weekly percent used, reset times           | Claude Code status line (`integrations/claude-statusline.mjs`), the Usage page of the Claude desktop app, reporter, or API | **Implemented** (status line, Usage page) |
| GitHub Copilot | AI Credits used of the allowance, extra spend         | Reporter or API. Usage data needs a GitHub token                                                                           | Reporter only                             |
| JetBrains AI   | Credits used, reset date, top-up balance              | Reporter or API. The IDE widget shows the values. No local source is known                                                 | Reporter only                             |

### Codex source

Every 30 seconds, the hub reads the end (256 KiB) of the four newest rollout files under `sessions/`, by change time. A resumed conversation writes into the day folder where it started, so the hub checks the change time of the files in all day folders. It uses the newest `token_count` event with `rate_limits`, when `limit_id` is `codex` or empty. It reads no other event.

| Codex field                         | Budget field                                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------------- |
| `primary`, `window_minutes` 300     | `five-hour` window: `used_percent`, `resets_at` (Unix seconds)                            |
| `secondary`, `window_minutes` 10080 | `weekly` window                                                                           |
| `plan_type`                         | `plan`                                                                                    |
| `credits.balance`, `has_credits`    | `extra.kind` `topup`. In use when a window is at 100% or `rate_limit_reached_type` is set |

The snapshot changes only when Codex runs. After its reset time, a window starts again at 0%, because Codex writes a new snapshot each time it runs. Use on another computer shows only after Codex runs on this computer.

### Claude status line source

Claude Code gives its status line command `rate_limits.five_hour` and `rate_limits.seven_day` on stdin, with `used_percentage` (0–100) and `resets_at` (Unix seconds). The fields are present only for claude.ai Pro and Max plans, and only after the first API response of a session. `integrations/claude-statusline.mjs` sends these numbers to `PUT /api/budgets/claude` and prints a short status line. It sends no prompt, path, or token. The hub does not change Claude settings: the user sets the status line in `~/.claude/settings.json`:

```json
"statusLine": { "type": "command", "command": "node /path/to/ai-ai-captain/integrations/claude-statusline.mjs --plan max" }
```

The values update when Claude Code runs the status line, after each response. Use in the Claude desktop app or on claude.ai shows after the next Claude Code response, because the limits are shared. Claude Code drops a window after its reset time; the script then sends 0% for it. With `--quiet`, the script prints nothing.

### Claude Usage page source

On macOS, the Claude desktop adapter also reads the Usage page of the app (Settings, Usage) while it is open. The page shows two meters (Accessibility role `AXLevelIndicator`): "Current session" and "This week", with values such as `46% used`. Each meter has a text such as `Resets Mon 12:50 AM` or `Resets Sunday 5:00 PM` directly before it. The adapter reads only these meters and the nearest reset text before each meter. It reads no other text of the page.

The hub changes the reset text to a local time: a weekday and a time give the next such time, a time alone gives today or tomorrow, and `Resets in 2 hr 10 min` gives a time from now. Other forms give no reset time. The page is in English only. The page does not show the plan, so the hub keeps the plan from the status line or a reporter. The Usage page and the status line both update the same Claude budget. The newest reading wins.

### Budget API and reporter

| Method and path                 | Contract                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------- |
| `GET /api/budgets`              | `{ "budgets": [...] }`. `GET /api/sessions` and the SSE snapshot include them too |
| `PUT /api/budgets/:provider`    | Validated budget. The body `provider` must agree with the path                    |
| `DELETE /api/budgets/:provider` | Remove the budget of a provider                                                   |
| `POST /api/budgets/refresh`     | Read the automatic sources again and return `{ "budgets": [...] }`                |

The SSE stream sends a `budgets` message with the full list after each change. A budget has `provider` (`claude`, `openai`, `copilot`, `jetbrains`), `source`, optional `plan`, and `windows` (`kind` `five-hour`, `weekly`, or `monthly`, optional `usedPercent` 0–100 and `resetsAt`). It can also have `credits` (`used`, `total`) and `extra` (`kind` `extra` or `topup`, `active`, `used`, `limit`, `balance`, `currency` `usd` or `credits`).

```sh
npm run report -- budget claude --plan max --five-hour-percent 34 --five-hour-reset 2h \
  --weekly-percent 21 --weekly-reset 4d
npm run report -- budget copilot --plan pro --credits-used 1310 --credits-total 1500 \
  --monthly-reset 2026-12-01T00:00:00Z --extra-used 12 --extra-limit 20 --extra-usd
npm run report -- budget jetbrains --plan "ai pro" --credits-used 20 --credits-total 20 \
  --monthly-reset 4d --top-up 4.2 --extra-active
npm run report -- budget claude --remove
```

A reset time is an ISO time or a time from now (`90m`, `5h`, `4d`). Without `--monthly-percent`, the monthly bar uses the credits used over the total.
