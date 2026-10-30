# Stream Deck plugin

The plugin uses the official `@elgato/streamdeck` SDK. Build it from the repository root with `npm run build`; this creates `com.local.ai-ai-captain.sdPlugin` with a bundled plugin entrypoint, the bundled hub (`bin/hub.cjs`), the static dashboard (`web/`), manifest, and auto-installed XL profile. Link it into Stream Deck using Elgato's CLI: `streamdeck link streamdeck/com.local.ai-ai-captain.sdPlugin`.

The default XL layout places 30 **AI Session** actions in positions 1–30 (left-to-right, top-to-bottom), then **Previous Session Page** and **Next Session Page** in positions 31 and 32. You can place these actions elsewhere and replace session slots with INFO or other controls. Sessions fill only the configured session keys in reading order, and paging uses the available number of session keys (up to 30 per device), so custom controls do not hide conversations. Session actions refresh from the hub every 1.5 seconds. Press a session key to focus it.

The profile assigns 30 session keys followed by previous/next paging keys. The plugin displays live session keys as slots fill and exposes further sessions on additional pages. Set `AI_AI_CAPTAIN_URL` only if the hub uses a non-default local port.

## Hub supervision

The plugin starts the hub automatically. You do not start it in a terminal.

- If a hub answers at `AI_AI_CAPTAIN_URL`, the plugin uses that hub. An example is a hub that `npm run dev` started.
- If no hub answers, the plugin starts `bin/hub.cjs` with the Stream Deck Node.js runtime.
- If the hub stops, the plugin starts it again. The delay starts at 1 second and increases to a maximum of 30 seconds.
- The hub stops when the plugin stops.
- The hub writes its warnings and errors to the plugin log.

While no hub answers, the keys show UNK.

## Claude tracking

Claude CLI and IntelliJ keys come from supported live Claude Code registrations. Local Code runtimes in the desktop app use the app badge.
Regular desktop chats use an experimental exposed-chat Accessibility adapter. Hidden chats and remote Code runtimes remain unsupported.
The existing Claude artwork, state colors, and attention timing apply. No Stream Deck profile change is required.
Update and restart the hub to load these adapters. A running development hub reloads them automatically.
See [Claude setup and limits](../intagration.md#claude-adapters).

## Dashboard shortcut

On macOS, INFO asks the hub to detect the default browser and reuse its dashboard tab. Safari/Chromium use native tab scripting. Zen/Firefox use Accessibility and verify the native address bar without reading webpage contents. See [permissions and fallback behavior](../README.md#reuse-the-dashboard-tab-with-info). If reuse fails or no match exists, the hub opens the configured URL through the default browser. This fallback can create a new tab. The plugin uses its system opener if the hub is unavailable or reports failure. INFO shows an alert only if that opener also fails.

INFO is a separate, manually placed action. It is **not** automatically added after your sessions; unused session keys stay empty.

1. Reload the updated plugin with `npm run reload:streamdeck`.
2. In the Stream Deck app, find **AI AI Captain → Open AI AI Captain Dashboard** in the action list.
3. Drag that action onto your preferred key, replacing an **AI Session** key if needed. You can also place it on another page.

The purple **INFO** key stays at your chosen location as sessions arrive, close, or change pages. Press it to open the web dashboard and state explanations in your default browser. It works even when the hub is unreachable, opening the configured `AI_AI_CAPTAIN_URL` so you can inspect the dashboard's connection state. The default profile is unchanged; linking/reloading the plugin does not replace your customized assignments. Reinstalling or reimporting the profile is unnecessary.

Dashboard session cards include a state explanation and expandable **State details & evidence**. UNKNOWN entries expand automatically, distinguishing missing telemetry, read errors, unreadable/unsupported events, and process-discovery failures. Evidence includes timestamps, event/adapter, telemetry location/error code, model/project availability, and runtime/host PIDs. Raw transcripts and private error messages are never rendered.

Every key represents an individual reported session. It uses a large type symbol and a colored state band instead of small session names. The key number matches the full name, project, model, and host details in the browser dashboard. The dashboard also shows a live preview using the same SVG images as the physical keys.

| Type | Large symbol | Host badge |
| --- | --- | --- |
| Copilot CLI | Copilot goggles | Terminal `>_` |
| Copilot in IntelliJ | Copilot goggles | `IJ` |
| Microsoft Copilot app | Copilot ribbon, distinct from GitHub goggles | App window |
| IntelliJ AI | Large `IJ` tile with sparkle | Included in symbol |
| Codex | Square code brackets | `>_` or `IJ` |
| Claude | Starburst | `>_`, `IJ`, or app window |
| ChatGPT | OpenAI knot | App window |

| State | Color | Symbol and label |
| --- | --- | --- |
| Working | Green/teal | Activity ring, `WORKING` |
| User action/input/permission required | Amber | Raised hand, `WAITING` |
| Work finished; no action required | Blue | Check mark, `DONE` |
| Starting | Purple | Hourglass, `STARTING` |
| Failed | Red | Warning triangle, `FAILED` |
| Unknown / hub unreachable | Gray | Question mark, `UNK` |

WAITING keys blink slowly: amber brightens/dims every 1.2 seconds, completing a cycle every 2.4 seconds. Pulsing stops when the session leaves WAITING or the key is hidden.

DONE draws attention with brief blue flashes that become less frequent as the completion ages:

| Time since completion | Flash frequency |
| --- | --- |
| 0–10 seconds | Every 0.5 seconds |
| 10–30 seconds | Every 1 second |
| 30–60 seconds | Every 2 seconds |
| 1–2 minutes | Every 5 seconds |
| 2–5 minutes | Every 10 seconds |
| 5–10 minutes | Every 30 seconds |
| 10 minutes or older | Steady darker blue |

Each flash lasts 250 ms; recent completions alternate between icy light blue and bright sky blue rather than going blank. Both phases stand apart from the subdued dark blue used after ten minutes. The icon, host badge, key number, and label remain readable, with dark labels on recent DONE and light labels on aged DONE. The schedule uses the actual state-transition timestamp, so polling, metadata changes, page changes, or restarts do not restart the alert. Another working turn followed by completion does restart it. The darker appearance does not change the underlying `done` state or remove an open session.

Animation uses local key-image updates, not extra hub requests. WORKING, STARTING, FAILED, and UNK stay steady. The dashboard preview and completion indicators follow the same schedule; reduced-motion browsers skip flashing while still aging to darker blue at ten minutes.

The approved default artwork uses Fjord with full state labels. Choose **Icon palette** and **Flash intensity** in the dashboard to change all session, empty, INFO, and paging keys. Flash intensity accepts levels 0–4; the default is 2. The hub persists both settings in `settings.json`; keys update on the next normal 1.5-second poll without reimporting the profile or restarting the plugin. Rebuild/reload the plugin once to install this renderer upgrade. Colors fill the background, border, and state band; symbols and full labels distinguish states without color. Cards stay in creation order during state changes so activity does not continually move sessions between keys. Copilot, Codex, and supported Claude Code sessions (CLI or IntelliJ-hosted, including JetBrains AI Assistant's Codex runtime) are tracked automatically by the macOS hub; other harnesses require reporters. Regular Claude desktop chat uses the experimental exposed-chat adapter described above. Codex uses square code brackets plus an `IJ` badge in IntelliJ. Sessions switch from green `WORKING` during work to blue `DONE` when the turn finishes. Amber `WAITING` is only for requested input/permission, not normal inactivity. A completed open conversation stays blue and visible until new work starts; only actual session closure starts the ten-second removal countdown. A live session without readable telemetry shows gray `UNK`. App-presence records are excluded. Symbols for other harnesses/apps apply when an individual session is reported; they do not imply those apps have automatic session adapters.

Reload a linked plugin with `npm run reload:streamdeck` from the repository root. This rebuilds the plugin, hub, and dashboard bundles, enables developer mode, and restarts the plugin. The hub's session scanner and the plugin each refresh every 1.5 seconds, so a state change normally reaches a key within about three seconds. Pressing an IntelliJ session key selects its project window using the reported absolute project path; automatically tracked Copilot sessions target the exact owning IDEA installation. A closed project may be reopened. Other hosts and sessions without project metadata retain application-level activation. Failed requests show the key's alert icon. Selecting an individual conversation tab is not yet supported.

Linked development installs do not need reinstalling after a build. When using individual commands, run `streamdeck dev` once before `streamdeck restart com.local.ai-ai-captain`. The restart CLI may print success while Stream Deck ignores the request if developer mode is off; its app log will report `Feature only enabled in developer mode`. A key showing only the static star is the manifest fallback icon; populated session keys should instead show their type and colored state. Generated SVG images are sent as base64 image data URIs so Stream Deck recognizes them as images.
