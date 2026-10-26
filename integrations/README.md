# Harness integrations

## Automatic Copilot sessions

On macOS the hub automatically follows the existing local event files of live Copilot CLI and IntelliJ Copilot runtime sessions. No hook configuration or IntelliJ bridge is needed for this adapter. Live ownership comes from open `inuse.<pid>.hold` files, rather than file age or process presence alone; abandoned lock files are excluded. Because a background runtime can retain those files after a terminal/project closes, host-lifetime checks also filter the inventory. Process ancestry associates each session with its hosting application. Multiple sessions owned by one IDE runtime remain separate.

The reader uses `~/.copilot/session-state` by default; set `AI_AI_CAPTAIN_COPILOT_HOME` to the directory containing `session-state` for another location. It parses existing event records locally and discards message content, tool arguments/results, and other transcript data. Only session ID, project, model, event timestamps, state, and process/host metadata enter the hub store and API. Initial state is replayed once, then only appended bytes are read. Unsupported or unavailable telemetry produces `unknown`, and ended sessions disappear after ten seconds.

| Copilot event | Session state | Key |
| --- | --- | --- |
| `session.start`, `session.resume` | starting | Purple hourglass `STARTING` |
| User message, assistant turn start, tool activity | working | Green `WORKING` |
| Assistant turn end, session idle/task completion | done; conversation remains open | Blue `DONE` |
| Permission requested or `ask_user` tool, until outstanding requests complete | waiting | Amber `WAITING` |
| `session.error` | failed | Red `FAILED` |
| `session.shutdown` or live ownership released | done | Blue check mark `DONE` |
| Event file or process telemetry unavailable | unknown | Gray `UNK` |

This adapter follows Copilot's installed local event/lock format, which may change between versions. It supports runtimes that write those files; Copilot ACP agents without these files still need lifecycle reporting. IntelliJ session keys use the absolute project path and the owning application bundle's command-line launcher to select the matching project window, rather than only activating the application. A closed project may be reopened. Other hosts retain application-level activation; selecting a specific conversation tab is not implemented.

## Automatic Codex sessions

On macOS the hub follows individual Codex CLI sessions and Codex sessions hosted by JetBrains AI Assistant through Codex ACP. No bridge installation, hook configuration, or change to Codex settings is required. It identifies live session ownership from files held open by Codex processes: `thread-writer-locks/<session-id>.lock` and `sessions/**/rollout-*-<session-id>.jsonl`. A stale lock file or historical rollout on disk does not create a session. Process ancestry supplies the owning application and exact IDEA installation for project focus.

The root is `AI_AI_CAPTAIN_CODEX_HOME`, then `CODEX_HOME`, then `~/.codex`. Rollouts are replayed once and then read incrementally, sharing the same bounded JSONL reader as Copilot. The hub retains only session ID, project, model, state, timestamps, and host metadata. It discards instructions, prompts, responses, questions/answers, tool arguments/results, and error messages rather than storing or serving them.

| Codex rollout record | Session state | Key |
| --- | --- | --- |
| `session_meta` | starting | Purple `STARTING` |
| `event_msg.task_started` / `turn_started` | working | Green `WORKING` |
| Blocking `request_user_input` tool call, until its result arrives | waiting | Amber `WAITING` |
| `event_msg.task_complete`, turn completion, or `turn_aborted` | done; conversation remains open | Blue `DONE` |
| `event_msg.error` / `turn_failed` | failed | Red `FAILED` |
| Live writer/rollout ownership released | done, removed after ten seconds | Blue `DONE` |
| Missing rollout or unavailable telemetry | unknown | Gray `UNK` |

`turn_context` and `thread_settings_applied` update the project/model without inventing activity. Individual tool failures do not imply session failure. This adapter follows the installed local rollout/lock format, not an attached app-server connection; formats may change. Codex configurations that do not write rollout history, and approval/input pauses not recorded there, cannot expose full lifecycle state through this adapter. They need lifecycle reporting or a future host integration. The official [Codex App Server documentation](https://developers.openai.com/codex/app-server/) describes the live protocol for clients that own that connection; AI AI Captain does not intercept or take over JetBrains' existing connection.

## Automatic Claude Code sessions

The hub reads live `sessions/<pid>.json` registrations under `AI_AI_CAPTAIN_CLAUDE_HOME`, then `CLAUDE_CONFIG_DIR`, then `~/.claude`.
It validates the session UUID, runtime PID, process-start identity, and local PID domain before creating a key.
Stale files and unrelated processes do not create sessions. CLI, IntelliJ, and local desktop Code sessions use host ancestry for their badge.

The hub uses existing terminal and IntelliJ project-lifetime checks. Confirmed runtime, registration, or host closure removes the key.
Busy/running/working statuses mean WORKING. Explicit input or permission statuses mean WAITING. Idle/done statuses mean DONE.

Starting and failure statuses mean STARTING and FAILED. Unsupported values mean UNK.
Approval pauses and model names must be exported by the runtime. The adapter does not infer missing metadata.

The installed 2.1.309 registration format was checked locally. Other versions can need the generic lifecycle reporter.
The reader does not open transcripts, install hooks, read registration keys, or change Claude settings.

## Claude desktop chat

The experimental desktop adapter uses read-only macOS Accessibility inspection for exposed `claude.ai/chat/<UUID>` conversations.
It follows known English Stop, approval, composer, and Send controls. It does not inspect message text or composer values.
Enable Accessibility access for the application that runs the hub. Then restart the hub.

Hidden chats, remote Code runtimes, unsupported UI formats, and additional languages do not have full coverage.
A failed inspection makes known chats UNKNOWN. App closure or removal of an exposed conversation removes its key.
An app without an exposed conversation ID remains under **Other detected apps**, with a tracking explanation.

The installed desktop UI has not yet been verified with a running conversation.
See [the adapter contracts](../intagration.md#claude-adapters) for state, privacy, and navigation limits.

## Host and project lifetime

Copilot, Codex, and Claude Code share these host-lifetime checks:

- Inspect the runtime's and its ancestors' standard descriptors for a revoked terminal connection; do not treat a detached/headless runtime with unavailable terminal evidence as closed merely because it has no app ancestor.
- Read schema-v2 project registrations in `~/.junie/instances` (`AI_AI_CAPTAIN_JETBRAINS_INSTANCES` overrides this location). Once coverage is established for a live IDEA process, only its registered project paths, including nested working directories, qualify as open. Project names, recent-project history, and arbitrary files retained by the IDE do not prove a project is open. Missing/unreadable/unsupported registration telemetry fails open, with **unverified** host evidence in dashboard details.
- Compare session start/resume/turn-start timestamps against registration creation time to exclude history from earlier project openings. A suppressed conversation requires a fresh session/turn trigger before it returns; completion, token counts, or model changes alone do not qualify.
- Remember runtime-to-app ownership and registration coverage across scans and hub restarts, with process start identity to reject PID reuse. If an owning app exits but its child runtime survives, the orphaned sessions stay excluded. Only descriptive metadata is saved; registry RPC credentials are ignored.

Confirmed terminal/project/app closure removes sessions on the next successful scan (normally about 1.5 seconds). Releasing a session's lock or reporting shutdown retains the ten-second grace period. Without supported project registrations, per-project closure cannot be established automatically; runtime ownership alone remains the fallback. No bridge reinstall is needed for supported registrations, and the hub never terminates user processes to clear keys.

## Generic lifecycle hooks

The generic hook reporter accepts one JSON object on stdin and retains only session metadata. Run the hub first. The hook command derives a stable AI AI Captain session ID from `session_id`, `session-id`, `sessionId`, `thread-id`, `thread_id`, or `threadId` in the hook payload. Pass `--id` if the harness supplies its session ID another way. Payloads with no session identifier are rejected rather than creating a new fake session for every event. An individual event's `id` is not a session identifier. Unknown event names produce `unknown` state.

```sh
node /absolute/path/to/ai-ai-captain/dist/cli.js hook claude-code SessionStart
node /absolute/path/to/ai-ai-captain/dist/cli.js hook codex-cli agent-turn-start
node /absolute/path/to/ai-ai-captain/dist/cli.js hook copilot-cli sessionStart
```

Configure each harness to call the appropriate command with its lifecycle event. The event name is passed as a command argument; the event JSON is piped unchanged to stdin. For a CLI that runs inside a known app, append `--app "Terminal"` or `--bundle-id com.example.app` to set a focus target. Do not set an app target for embedded terminals unless it is known to be correct.

Session-start/resume events mean `starting`; prompt/turn-start/tool events mean `working`; stop/turn-complete/idle events mean `done` with `ended: false`, so the blue completed key stays visible. Permission/input requests mean `waiting`; permission completion means `working`. `Notification` hooks use `notification_type`: `permission_prompt` / `elicitation_dialog` require action, `idle_prompt` means done, and unclassified notifications mean unknown. Only session-end/shutdown events set `ended: true` and start the ten-second removal countdown. Session failure/error events mean `failed`; anything else becomes `unknown`. A recoverable tool failure keeps the session working. Review mappings against the specific hook version before enabling them. Use only event data containing session identifiers and project metadata; the reporter discards other event fields.

## Limitations

Hook names and payload shapes vary by harness and version. Generic reporters need explicit configuration and do not change harness settings. ChatGPT, Microsoft Copilot desktop, and unsupported JetBrains workflows still need session adapters. Claude desktop chat covers exposed conversations only; it does not provide full desktop history or remote Code session discovery.
