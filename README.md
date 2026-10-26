# AI AI Captain

<img alt="Stream Deck XL with six AI sessions in different states, empty session keys, and the INFO key" src="docs/images/stream-deck-xl-workflow.gif" width="400px"/>
<br>

AI AI Captain is an AI session monitor for Stream Deck XL. 

* The hub tracks cli sessions: Copilot, Codex, and Claude Code.
* The hub tracks IntelliJ IDEA sessions: Copilot, Codex, and Claude Code.
* The hub tracks JetBrains AI Assistant sessions.
* The hub tracks Claude desktop sessions.
* The dashboard remains static and client-rendered. Each session has an identity, state, host application, and optional project and model. The hub does not retain conversation content.


New users: start with the [User Guide](USER_GUIDE.md). It explains how to build, install, run, and configure AI AI Captain in step-by-step instructions.

<img alt="Aye aye, captain, standing by" src="docs/images/aye-aye-captain.png" width="200px"/>

## Anchor specifications

- [Architecture](architecture.md): component boundaries, technology, data ownership, and local-first constraints.
- [Functionality](functionality.md): session behavior, lifecycle semantics, navigation, and acceptance criteria.
- [Design](design.md): visual language, full state wording, assessed DONE, and palette configuration.
- [Integration](intagration.md): adapter coverage, API/hooks, configuration, installation, and integration requirements.

The anchors distinguish implemented behavior from required refinements and unselected proposals. SVG studies do not imply deployed visuals or automatic support for every illustrated application.

Browse the [palette gallery](docs/design/README.md#palette-gallery), including **Signal** (high-contrast dark) and **Porcelain** (high-contrast light). The gallery includes complete client/state sheets, assessed DONE comparisons, and regeneration instructions. The default artwork and Fjord palette are implemented from `palettes/default.svg`; choose another palette through the dashboard. Assessed DONE remains a requirement, not implemented visit tracking.

## Requirements

- macOS for app activation; the dashboard and reporter API can also run on other platforms.
- Node.js 24 or newer and Stream Deck 7.1 or newer for the Stream Deck SDK.
- Stream Deck XL for the intended 30-slot profile.

## Run locally

```sh
npm install
npm run dev
```

Open <http://127.0.0.1:43681>. With the Stream Deck plugin installed, you do not need this step: the plugin starts the hub automatically (see [Hub started by the Stream Deck plugin](#hub-started-by-the-stream-deck-plugin)). The UI is static HTML/CSS, a browser-side Web Component, and a service worker; there is no server-side rendering. Session metadata is stored at `~/Library/Application Support/ai-ai-captain/sessions.json` with owner-only file permissions. The hub moves data from the earlier `~/Library/Application Support/ai-deck` folder at first start. Set `AI_AI_CAPTAIN_DATA_DIR` to change the location and `AI_AI_CAPTAIN_PORT` to change the port.

### Choose an icon palette

Use **Icon palette** near the top of the dashboard. Choose **Fjord (default)**, **Nocturne**, **Ember & Ice**, **Signal**, or **Porcelain**. Changes save automatically in `settings.json` in the hub's data directory and survive restarts. The setting applies to all connected dashboards and Stream Decks, including session, empty, INFO, and paging keys. Dashboards update immediately; hardware updates on its next normal poll (within about 1.5 seconds). Changing palettes does not reset completion age or alter sessions, key positions, or attention timing.

For this initial icon-system upgrade, rebuild/restart the hub and reload the linked plugin once with `npm run reload:streamdeck`; refresh an already-open dashboard. Packaged installs need the rebuilt plugin installed once. Later palette changes need no rebuild, reinstall, profile import, or plugin restart. Selecting **Fjord (default)** restores the default appearance.

### Reuse the dashboard tab with INFO

INFO asks the hub to detect the current macOS default browser and reuse its existing **AI AI Captain — Session Monitor** tab. If reuse fails or no matching tab exists, INFO opens the dashboard through the default browser. This fallback can create a new tab. The hub checks the default browser on each request. Safari and supported Chromium browsers (Chrome, Chromium, Edge, Brave, Vivaldi) use native tab scripting. Zen and Firefox use macOS Accessibility to select the named tab and verify its address. Other browsers use the fallback.

Zen's Accessibility adapter can inspect tabs exposed in its browser windows, not tabs hidden in inactive workspaces. Keep the dashboard in an exposed workspace for reliable reuse; browser-extension-level workspace discovery is not implemented.

For **Zen/Firefox**, allow the application that runs the hub (**Elgato Stream Deck** when the plugin starts the hub, otherwise your terminal) under **System Settings → Privacy & Security → Accessibility**. Then restart the hub. For **Safari/Chromium**, macOS may request **Automation** permission for that application to control the browser. AI AI Captain never grants these permissions, changes the default browser, enables remote debugging, or reads webpage contents. If access is denied or tab inspection fails, the hub uses the fallback. INFO shows an alert only if the fallback also fails. `GET /api/dashboard/browser` reports the detected browser and Accessibility status.

After this upgrade, rebuild/restart the hub and reload the linked plugin once. If the hub is unreachable or is an older version without the new endpoint, INFO retains the previous system URL-opening fallback; that fallback cannot guarantee tab reuse.

### State details and troubleshooting

Every session card explains its state in plain language. Expand **State details & evidence** to see its tracking adapter, state event, telemetry status/location, safe filesystem error code, last observed event, state-change/report times, project/model, runtime/host PIDs, and host-lifetime evidence. When available, project-opening and session-trigger timestamps explain why a conversation belongs to the current project opening. Unknown sessions expand automatically. A report-received timestamp is not presented as proof that a lifecycle event was observed, and absent model/project information is explicitly marked **Not observed**. No prompts, transcript contents, tool arguments, or private error messages are shown.

For example, a live Codex writer lock without a matching rollout file is reported as **UNKNOWN: event file not found**, not as an active AI turn. Missing files, unreadable files, unsupported/empty event streams, and process-discovery failures have distinct explanations and next steps. AI AI Captain does not change harness history settings or grant additional permissions.

To add the purple **INFO** key, drag **AI AI Captain → Open AI AI Captain Dashboard** from the Stream Deck action list onto your preferred key. You can replace an **AI Session** slot or use another page; INFO stays where you put it and is never added automatically. Session keys fill the remaining configured **AI Session** positions in reading order, skipping INFO and other controls without skipping sessions. Paging adjusts to the number of session keys in your layout (up to 30 per device). Press INFO to open the dashboard in your default browser. Existing assignments are preserved; no profile reimport or reinstall is required. Reload the linked plugin with `npm run reload:streamdeck` after updating.

### Automatic session tracking

On macOS, running Copilot CLI sessions and Copilot sessions hosted by IntelliJ's Copilot runtime appear separately without installing the IntelliJ bridge. The hub identifies sessions from open Copilot session hold files, reads their existing `events.jsonl` streams incrementally, and derives state from turn, permission, error, and shutdown events. Several conversations in one IDE process therefore produce several session keys. The adapter retains only metadata; it does not persist or forward message content. Set `AI_AI_CAPTAIN_COPILOT_HOME` if Copilot stores its `session-state` directory somewhere other than `~/.copilot`.

Codex CLI and Codex sessions inside JetBrains AI Assistant (including its Codex ACP runtime) are also tracked automatically. Live Codex writer locks or open rollout files identify individual sessions; existing local rollout events supply their project, model, and state. A Codex session uses square code brackets with an `IJ` badge when hosted in IntelliJ, distinct from Copilot's goggles. Turn completion/cancellation means blue **DONE** while the conversation stays open; **WAITING** is reserved for a requested action. A live session with no readable rollout telemetry shows **UNK**, never a guessed running state. The adapter does not change Codex settings or retain prompts, responses, or tool contents. Set `AI_AI_CAPTAIN_CODEX_HOME` to override the Codex data directory; otherwise the hub uses `CODEX_HOME` or `~/.codex`. See [integrations/README.md](integrations/README.md) for coverage limits.

#### Closed terminals and IntelliJ projects

Background AI runtimes can retain session locks after their terminal or project closes. The hub therefore also checks host lifetime every discovery scan (normally about 1.5 seconds):

- A revoked terminal connection removes the associated CLI sessions, even if their runtime continues running in the background.
- IntelliJ project registrations from JetBrains AI Assistant's `~/.junie/instances` registry identify the actual open project paths for each IDEA process. Closing a project removes its Copilot, Codex, and Claude Code sessions without removing sessions in other open projects. The registry's name does not mean you need to run the Junie CLI. Set `AI_AI_CAPTAIN_JETBRAINS_INSTANCES` for a different registry location.
- Reopening a project does not revive its old conversations. A session must start, resume, or receive a new turn during the current project opening before its key returns. Late completion events and model/usage updates do not reactivate it.
- A remembered host application exiting removes its sessions even if orphaned runtimes retain locks. Host capability/ownership metadata is saved in `host-lifetimes.json` beside `sessions.json`, keyed by process start identity so it survives hub restarts without trusting reused PIDs. No registry authentication tokens are retained.

Confirmed host/project closure removes keys on the next successful scan rather than showing another DONE alert. Ordinary session shutdown or lock release retains the existing ten-second closing grace period. If registration/terminal inspection is unavailable or an IDEA version does not expose supported project registrations, AI AI Captain does not guess that a project closed; dashboard details show **unverified** and the available evidence. A project registry must have been observed for that IDEA process to establish coverage. This update is hub-side: a running `npm run dev` reloads it automatically; otherwise rebuild and restart the hub. No Stream Deck plugin or IntelliJ bridge reinstall is required.

Keys use a large type icon, a host badge, and a state symbol on a colored background. Session names, projects, and model text stay in the dashboard, where numbered details match the key numbers. Green/teal **WORKING** with an activity ring means work is in progress; amber **WAITING** with a raised hand means input, permission, or another user action is required; blue **DONE** with a check means work finished and no action is required. Completed open conversations remain blue until another turn starts; they are not removed just because a turn finished. Purple **STARTING** means initialization, red/rose **FAILED** with a warning triangle means a session error, and gray **? UNK** means telemetry is unavailable. Actually closing a session removes its key after ten seconds. Positions stay stable during state updates. The dashboard includes a live preview using the same key images.

Claude Code CLI and IntelliJ sessions use live registrations under `~/.claude/sessions`. Local Code runtimes hosted by Claude desktop use the same adapter. Set `AI_AI_CAPTAIN_CLAUDE_HOME` to override the root; otherwise `CLAUDE_CONFIG_DIR` takes precedence over `~/.claude`. No hook installation or Claude setting change is required. Missing model or approval metadata is not inferred.

Junie sessions in IntelliJ IDEA appear automatically from `~/.junie/sessions`. Set `AI_AI_CAPTAIN_JUNIE_HOME` to override the folder. A session shows only while its project is open in IntelliJ IDEA. The hub reads status values only. It never reads prompts or task names.

Regular Claude desktop chat has an experimental Accessibility adapter. It tracks exposed conversation URLs and known English controls, not chat history. Enable Accessibility access for the application that runs the hub. Hidden chats, unsupported controls, and remote Code runtimes remain unsupported. Claude stays under **Other detected apps** when no exposed chat supplies usable metadata.

A tracked chat key requests the existing conversation through its restricted Claude deep link. See [Claude adapter contracts](intagration.md#claude-adapters) for limits.

Other harnesses require lifecycle reporters; see [integrations/README.md](integrations/README.md). The manual IntelliJ bridge remains a fallback. ChatGPT and Microsoft Copilot desktop conversations are not automatically tracked.

Pressing an IntelliJ session key targets its project window using the session's absolute project path and IntelliJ's command-line launcher. Automatically tracked Copilot sessions target the exact owning IDEA installation, even when several versions are installed. IntelliJ reuses the matching open project or may open it if it was closed. Other applications, or IntelliJ sessions without project metadata, still use application-level activation. Selecting a particular conversation tab is not yet supported. Invalid/unavailable project paths and failed focus requests show an alert on the key rather than silently falling back to application focus.

Cached sessions are displayed after a hub restart only when a live adapter or reporter confirms them again. Old persisted `working` values do not revive as running sessions.

WAITING keys slowly alternate between bright and dim amber every 1.2 seconds (a 2.4-second cycle) to draw attention without hiding their icon or label. DONE starts with quick blue flashes, becomes progressively less frequent over ten minutes, then stays steady in darker blue. Completion age comes from the actual state transition (`stateChangedAt`), not polling or metadata refreshes, and survives hub/plugin restarts. A new completed turn starts a new alert. Other states stay steady. The dashboard preview and indicators follow the same completion schedule; reduced-motion browsers skip flashes but still darken after ten minutes. See [streamdeck/README.md](streamdeck/README.md) for the timing stages.

Report a session:

```sh
npm run report -- upsert --source codex --harness codex-cli --state working --label "Refactor auth" --project "$PWD" --app "IntelliJ IDEA"
```

The command prints its session ID. Reuse it for later updates and end the session with:

```sh
npm run report -- end --id SESSION_ID --state done
```

`--state` supports `starting`, `working`, `waiting`, `unknown`, `done`, and `failed`. Use `upsert --state done --id SESSION_ID` for a finished turn with an open conversation; use `end --id SESSION_ID` only when the session actually closes. Closed sessions are shown for 10 seconds; completed/failed sessions that are still open remain visible until they resume or close. API reporters should send `"state": "done", "ended": false` for turn completion, and use the end endpoint or `"ended": true` for closure. Legacy done/failed reports without an explicit `ended` value retain their ten-second expiry. Use `--bundle-id` for app activation. Set `AI_AI_CAPTAIN_PRECISE_FOCUS=1` to try PID-based application focus; macOS may request Accessibility permission, and the adapter falls back to app activation if PID focus fails. IntelliJ project targeting takes precedence and does not require this setting or Accessibility permission.

## Session API

- `GET /api/sessions` returns the current snapshot plus the saved palette settings.
- `GET /api/settings` lists the current settings and supported palettes.
- `GET /api/dashboard/browser` detects the current default browser and reports its tab adapter and Accessibility status.
- `POST /api/dashboard/open` reuses or opens the configured dashboard tab; permission failures return a reason without opening duplicates.
- `PUT /api/settings` with `{ "palette": "fjord" | "nocturne" | "ember-ice" | "signal" | "porcelain" }` saves the shared icon palette.
- `GET /api/clients` lists detected desktop apps whose individual sessions are not tracked.
- `PUT /api/sessions/:id` creates or updates a session.
- `POST /api/sessions/:id/end` with `{ "state": "done" | "failed" }` ends one.
- `POST /api/sessions/:id/focus` asks the local OS focus adapter to activate its target.
- `DELETE /api/sessions/:id` removes the session. The Stream Deck plugin sends it when you push a key again within ten seconds after a failed focus request.
- `GET /api/events` streams an initial snapshot (including settings) and subsequent session/client/settings changes as SSE.
- `GET /health` is a process health check.

The hub binds only to `127.0.0.1` by default. The API intentionally stores descriptive metadata only; do not put prompts or transcripts in `label`, `project`, or `metadata`.

## Development

```sh
npm test
npm run typecheck
npm run build
npm run build:sea
```

## GitHub Actions and releases

GitHub Actions runs `npm run typecheck`, `npm test`, and `npm run build` for pull requests and pushes to `main`.

Use Conventional Commits on `main` to select the next release:

- `feat:` starts a minor release.
- `fix:` starts a patch release.
- Add `!` after the type for a breaking change and a major release.

Release Please opens a release pull request. Merge it to update the package version and create a GitHub release.

Enable **Allow GitHub Actions to create and approve pull requests** in repository settings. Without this setting, Release Please cannot open release pull requests.

Set the optional `RELEASE_PLEASE_TOKEN` repository secret if CI must run on release pull requests. GitHub does not start workflows for pull requests created with `GITHUB_TOKEN`.

`web/` contains the static client. Its TypeScript source is `web-src/main.ts`, bundled to `web/app.js` by the build. Stream Deck plugin sources and the IntelliJ bridge live in their respective directories; see their READMEs for current setup and integration notes.

`npm run build:sea` builds and ad-hoc signs `dist/ai-ai-captain` with Node SEA, bundling the hub and copying static assets alongside it. If the installed Node binary cannot be patched (common with Homebrew's dynamically linked build), the script downloads the matching official Node binary into `dist/sea-node`. Ad-hoc signing is for local execution; distribution requires Developer ID signing and notarization.

The Stream Deck build creates `streamdeck/com.local.ai-ai-captain.sdPlugin`, including an XL profile with 30 session keys and two paging keys. The plugin fills the preassigned keys dynamically as sessions arrive.

### Install the Stream Deck plugin

From the repository root, build the plugin, install Elgato's Stream Deck CLI, and link the plugin into Stream Deck:

```sh
npm run build
npm install -g @elgato/cli
streamdeck dev
streamdeck link streamdeck/com.local.ai-ai-captain.sdPlugin
streamdeck restart com.local.ai-ai-captain
```

The reload command finds `streamdeck` on `PATH` or in npm's global prefix. It enables developer mode, links the built plugin, and restarts it. It continues when the package is already linked. If it finds no CLI, it prints the install command and stops.

In the Stream Deck app, select the **AI AI Captain XL** profile. The plugin starts the hub automatically; configure the harness reporters separately as described in [integrations/README.md](integrations/README.md). To create a distributable plugin package instead, run `streamdeck pack` against `streamdeck/com.local.ai-ai-captain.sdPlugin`.

#### Hub started by the Stream Deck plugin

The plugin supervises the hub. When the plugin starts, it examines `/health`. If a hub answers, the plugin uses that hub. If no hub answers, the plugin starts the bundled hub (`bin/hub.cjs`) with the Stream Deck Node.js runtime. It starts the hub again after a failure, with a delay from 1 to 30 seconds. The hub stops when Stream Deck or the plugin stops. While the hub restarts, the keys show UNK.

The supervised hub writes only warnings and errors to the plugin log. It uses the default settings, because Stream Deck does not get your shell environment. To use other `AI_AI_CAPTAIN_*` values, start the hub manually before the plugin starts. To develop the hub, stop the plugin, start `npm run dev`, and then restart the plugin:

```sh
streamdeck stop com.local.ai-ai-captain
npm run dev
streamdeck restart com.local.ai-ai-captain
```

For later changes to the linked plugin, run `npm run reload:streamdeck`; reinstalling is unnecessary. This rebuilds the plugin, hub, and dashboard bundles, enables developer mode, and restarts the plugin. Developer mode is required for the restart command: the CLI can print success even when Stream Deck ignores the request. The app log at `~/Library/Logs/ElgatoStreamDeck/StreamDeck.log` reports `Feature only enabled in developer mode` in that case. The static star is a fallback icon; live session keys should show colored state symbols.
