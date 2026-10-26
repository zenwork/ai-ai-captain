# Design anchor specification

## Purpose and decision status

The control panel must communicate client identity, host context, and session state at a glance on a small physical key. It is not a miniature transcript or a dashboard full of session titles.

This anchor owns visual hierarchy, wording, icon semantics, color roles, attention, and accessibility. Behavioral semantics are in [functionality.md](functionality.md); technical boundaries and setup are in [architecture.md](architecture.md) and [intagration.md](intagration.md).

| Item                                                            | Status                                                                                                |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Large identity/host/state symbols, no session-name text on keys | Implemented baseline                                                                                  |
| Custom manually placed INFO action                              | Implemented                                                                                           |
| WAITING pulse and ten-minute DONE attention decay               | Implemented                                                                                           |
| WORKING display wording                                         | Implemented                                                                                           |
| Branded/consistent SVG icon system and full state wording       | Implemented in the shared renderer                                                                    |
| Claude Desktop visual variant                                   | Implemented; local Code registrations and experimental exposed-chat tracking use the app-window badge |
| Darkest, double-check assessed DONE                             | Required refinement, illustrated but not implemented                                                  |
| Fjord, Nocturne, Ember & Ice, Signal, Porcelain palettes        | Implemented and selectable in the web UI; Fjord is the default; the last two target high contrast     |

Design studies may be refreshed together when requested, but must identify their preview palette and must not silently select a palette or change the running plugin. Selecting a palette and deploying a design are separate decisions.

## DSN-01 — Key anatomy and hierarchy

The logical canvas is 72 × 72. Runtime key images use a 144 × 144 SVG viewport representation; proposals remain scalable. Physical-size review must use the 72-pixel samples as well as enlarged contact sheets.

Each session key has these priorities:

1. **Main symbol:** the client/harness, with a bold monochrome silhouette.
2. **State band and color:** what the session is doing and whether user action is needed.
3. **Neutral host badge:** CLI, IntelliJ, or desktop app.
4. **Small logical key number:** a reference to readable browser details, not a session title.

No project names, session titles, model names, or tiny explanatory prose belong on physical session keys. The browser owns those details. State wording must remain a single readable line without clipping, wrapping, or collisions with its symbol. The full-label SVG uses modest horizontal condensation, shared by the runtime and reference sheets. Physical-device readability still needs verification on the user's display.

The background, outline, and band reinforce state. Brand colors must not compete with state colors. Empty session keys remain subdued and cannot impersonate an INFO control.

## DSN-02 — Identity and host symbols

The main mark represents the harness/client, never whichever model it currently uses. Copilot running Claude stays visually Copilot. A Codex session hosted by JetBrains AI Assistant uses the Codex coding symbol plus the IntelliJ badge, not the native JetBrains AI symbol.

Claude Code registrations use the Claude mark with a terminal, IntelliJ, or desktop badge from host ancestry. Regular desktop chats use the desktop badge. These adapters use the existing artwork, state labels, palette, and attention timing. Unsupported telemetry stays UNK; app presence alone never creates a session tile.

| Client/session type | Proposed main mark | Host badge |
| --- | --- | --- |
| GitHub Copilot CLI | Recognizable Copilot goggles | Terminal `>_` |
| GitHub Copilot in IntelliJ | Same goggles | `IJ` |
| Microsoft Copilot app | Microsoft Copilot ribbon, not GitHub goggles | App window |
| Codex CLI | Square code brackets; deliberately not another terminal icon | Terminal `>_` |
| Codex in IntelliJ / JetBrains AI | Same code brackets | `IJ` |
| Codex desktop app (ChatGPT app) | Same code brackets | App window |
| Native JetBrains AI | Neutral `IJ` monogram with sparkle | Included in main symbol |
| Claude CLI | Claude starburst | Terminal `>_` |
| Claude in IntelliJ | Same starburst | `IJ` |
| Claude Desktop | Same starburst | App window |
| ChatGPT | OpenAI knot | App window |
| Unclassified harness | Generic agent/bot | Only a host supported by evidence |

The icon proposal uses selected static Lobe Icons 1.100.0 brand artwork and Lucide 0.468.0 interface symbols. The Codex coding glyph and neutral IJ monogram are identifying conventions, not claims that they are official product logos. Artwork must be bundled locally, with provenance and appropriate license notices; trademarks retain their owners' rights. No runtime CDN or React dependency is needed.

## DSN-03 — State wording and non-color cues

| Domain state | Required key wording | Proposed symbol | Color role |
| --- | --- | --- | --- |
| `starting` | STARTING | Hourglass | Purple/lilac |
| `working` | WORKING | Activity/spinner ring | Green/teal family |
| `waiting` | WAITING | Raised hand | Amber/gold family |
| `done`, not assessed | DONE | Single check | Blue family, age-dependent |
| `done`, assessed | DONE | Double check | Darkest blue family |
| `failed` | FAILED | Warning triangle | Red/rose/terracotta family |
| `unknown` | UNK | Circled question mark | Neutral gray/steel |

The raised hand replaces ambiguous pause bars: WAITING means a user action is needed, not just that processing stopped. A working glyph must not look like a start button the user is expected to press. Symbols and labels carry meaning even without color or animation.

The runtime uses STARTING/WORKING/WAITING/DONE/FAILED/UNK and the bundled Lobe/Lucide artwork shown in the default reference. Display wording does not rename public API enum values.

## DSN-04 — DONE hierarchy and assessment

The required hierarchy is:

| Completion condition | Appearance | Attention |
| --- | --- | --- |
| Fresh, not assessed | Bright blue; single check | Quick flashes, progressively slowing |
| Recent, not assessed | Bright/dim blue phases; single check | Existing age-based schedule |
| Older than ten minutes, not assessed | Dark blue; single check | Steady |
| Assessed after visiting that completed session | Even darker midnight blue; double check; subdued but readable identity | Immediately steady, regardless of age |

All four remain DONE. Assessment does not close, remove, or disable a session. No elapsed-time threshold can assess a result. A new turn clears assessment and permits a fresh completion alert. An app/project focus operation without session-specific evidence cannot assess every conversation in that host.

Assessed DONE must be distinguishable from merely old DONE without relying only on a tiny color difference. Its double check and darkest band provide separate cues. Dim the surface/identity intentionally; do not apply a whole-card opacity that makes text unreadable.

The main study uses Fjord as its preview: aged DONE has band `#354B65` and assessed DONE the darker band `#1C2A3E`. Each palette has its own equivalent hierarchy. Fjord is the implemented default; the assessed-DONE values remain a design requirement rather than deployed visit detection.

## DSN-05 — Attention timing

WAITING alternates bright/dim every 1.2 seconds, giving a 2.4-second cycle. Neither phase hides its icon or label.

Unassessed DONE uses a 250 ms bright flash and the following periods:

| Age since actual completion | Period |
| --- | --- |
| 0–10 seconds | 0.5 seconds |
| 10–30 seconds | 1 second |
| 30–60 seconds | 2 seconds |
| 1–2 minutes | 5 seconds |
| 2–5 minutes | 10 seconds |
| 5–10 minutes | 30 seconds |
| Ten minutes or older | No flashing; steady aged blue |

Both recent DONE phases must remain visibly brighter than aged DONE. Metadata updates, polling, page changes, and restarts cannot restart a completion's clock. Assessed DONE must cancel its attention timer immediately once implemented.

WORKING, STARTING, FAILED, and UNK remain steady in the current behavior; the spinner-shaped symbol does not itself require introducing another animation. Browser reduced-motion preferences remove WAITING/DONE flashing while preserving state and aging. Animation must not generate extra hub requests or frame-by-frame operational logs.

## DSN-06 — Color palette decision

The runtime defaults to the Fjord artwork in `docs/design/palettes/default.svg`. The shared geometry in `src/shared/card-design.ts` renders both the live cards and reference sheets; `src/shared/card-assets.ts` bundles generated palette tokens and local symbol artwork. The browser and Stream Deck use the same renderer.

Five alternatives are available, including two high-contrast directions:

| Palette | Character | WORKING band | WAITING band | Fresh DONE band |
| --- | --- | --- | --- | --- |
| Fjord | Cool slate, seafoam, powder blue, soft rose; implemented default | `#79C4B5` | `#E3C291` | `#B0D4EE` |
| Nocturne | Ink violet, jade, cornflower, raspberry; more vivid | `#55D6B0` | `#F0BA67` | `#A9C1FF` |
| Ember & Ice | Warm graphite, olive, icy blue, terracotta; warmer and understated | `#BCD2AA` | `#E8BC94` | `#CAE2E9` |
| Signal | High-contrast dark; near-black, luminous accents, crisp white marks | `#54F2B4` | `#FFD166` | `#BFE5FF` |
| Porcelain | High-contrast light; pale surfaces, deep ink, rich bands; dark blue DONE aging | `#14553F` | `#6B4800` | `#BFE3FF` |

All alternatives preserve amber WAITING and blue-family DONE, with distinct fresh, aged, and assessed values. `docs/design/palettes/tokens.json` is the complete shared token specification, including neutral badges, controls, surfaces, identity foregrounds, label ink, and bright/dim phases. Its `previewPalette` identifies the main sheet; `selectedPalette` identifies the shipped fallback (Fjord), not the current user's setting. The [palette gallery](docs/design/README.md#palette-gallery) links to full sheets that use the same identities, states, and layout for comparison.

Signal and Porcelain target at least 7:1 foreground/background contrast for state labels, identity marks, badges, controls, and captions, including dim and assessed phases. Standard palettes target at least 4.5:1. Measurements are in `docs/design/palette-contrast.json`; these targets do not imply complete accessibility certification.

**Implemented configuration:** the dashboard's **Icon palette** selector saves one hub-wide choice in `settings.json`. All browser previews and Stream Deck session, empty, INFO, and paging keys follow it. Browser SSE carries changes immediately; hardware reads settings in the existing 1.5-second session poll. Palette changes must not reset attention clocks, move sessions, or add animation-driven hub requests. Save failures retain the prior choice. New settings use validated palette IDs; unsupported values fall back safely when rendering.

## DSN-07 — Layout, fixed controls, and browser

INFO uses a neutral/purple dashboard-grid symbol and remains a separate, manually positioned action. Previous/next controls use matching chevrons and readable paging information. Their placement must not consume or skip a logical session in the remaining configured session keys.

The browser must use the same card semantics and logical key numbering, but has room for names, models, projects, timestamps, evidence, and grouped navigation. Its preview represents logical sessions, not every user's hardware layout. UNKNOWN diagnostics expand automatically; missing data must be described rather than hidden behind a misleading icon.

Any adopted visual update must reach both card previews and hardware rendering. Supporting browser badges, explanations, and legends must use consistent wording and meaning even when their layout differs.

## DSN-08 — Accessibility and visual acceptance

- State must be distinguishable by wording and shape as well as hue. Assessment adds a double check, not color alone.
- Labels must remain readable against bright, dim, aged, and assessed bands. Aim for at least 4.5:1 text contrast; test actual foreground/background combinations rather than isolated swatches.
- High-contrast proposals must meet at least 7:1 for labels, identity marks, badges, controls, and captions in every state/brightness phase, without sacrificing the darkest assessed DONE hierarchy.
- Product marks and host badges must remain visible when a completion is assessed. Symbols must not overlap the key number, host badge, or state text.
- Verify 72-pixel rendering and the physical device; an attractive enlarged SVG is insufficient. Screen zoom changes the physical size of SVG samples.
- Verify all supported identity/host combinations across every state and brightness phase, including Claude Desktop and unknown/generic types.
- Respect reduced motion in the browser and never rely on flashing as the only attention cue.
- Keep source SVGs self-contained, XML-valid, uniquely identified, and free of runtime external image/script dependencies.

## DSN-09 — Design artifacts

| Artifact                                                       | Purpose                                                                                                                                         |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| [Main SVG contact sheet](docs/design/palettes/default.svg)     | Fjord preview: twelve client/host combinations × ten state/brightness examples, 120 tiles, plus fixed controls and 72-pixel samples             |
| [Main PNG preview](docs/design/palettes/default.png)           | Raster review of that study                                                                                                                     |
| [Assessed DONE close-up](docs/design/done-assessment.svg)      | Fresh, aged, and assessed DONE in all five palettes                                                                                             |
| [Palette gallery](docs/design/README.md#palette-gallery)       | Links to complete palette sheets and PNGs, including dark and light high contrast                                                               |
| [Palette tokens](docs/design/palettes/tokens.json)             | Complete alternative color values                                                                                                               |
| [Contrast report](docs/design/palette-contrast.json)           | Measured minimum ratios by palette and visual role                                                                                              |
| [Local icon library](docs/design/assets/icons.svg)             | Shared, bundled symbol definitions and artwork provenance                                                                                       |
| [Stream Deck XL mockup](docs/images/stream-deck-xl-mockup.gif) | Animated GIF of a configured XL: six sessions in six states, empty session keys, NEXT, and INFO. It uses the live renderer and attention timing |
| [Mockup generator](scripts/render-deck-mockup.ts)              | Reproducible mockup via `npm run design:mockup`                                                                                                 |
| [Preview generator](scripts/render-design-proposals.mjs)       | Reproducible sheets/report via `npm run design:preview`; validation via `npm run design:check`                                                  |
| [Design notes](docs/design/README.md)                          | Study semantics and assessment details                                                                                                          |
| [Third-party notices](docs/design/THIRD_PARTY_NOTICES.txt)     | Artwork provenance and licensing                                                                                                                |

The icon artwork, full wording, controls, and palette configuration are implemented. The reference sheets also illustrate assessed DONE, which still lacks runtime visit detection. Claude Desktop artwork/classification does not imply automatic conversation tracking.
