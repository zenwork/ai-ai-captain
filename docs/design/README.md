# Stream Deck icon design proposal

Open [the self-contained default SVG](palettes/default.svg) to inspect the proposed tiles at any scale. [The PNG preview](palettes/default.png) provides a raster alternative. Both use **Fjord, the implemented default palette**. The main reference lives alongside the other palette sheets as `default`. Choose a palette in the dashboard's **Icon palette** selector; it applies to every connected Stream Deck and browser preview. The [DONE assessment close-up](done-assessment.svg) compares fresh, aged, and assessed completions across all five palettes.

## Palette gallery

The [palettes directory](palettes/) contains three refined standard options plus two high-contrast directions. Every option has a complete sheet with the same identities, state phases, controls, and readability samples:

| Palette     | Direction                                             | Full SVG                        | PNG                               |
|-------------|-------------------------------------------------------|---------------------------------|-----------------------------------|
| Fjord       | Cool slate, seafoam, powder blue; implemented default | [Sheet](palettes/fjord.svg)     | [Preview](palettes/fjord.png)     |
| Nocturne    | Ink violet, jade, cornflower                          | [Sheet](palettes/nocturne.svg)  | [Preview](palettes/nocturne.png)  |
| Ember & Ice | Warm graphite, olive, icy blue                        | [Sheet](palettes/ember-ice.svg) | [Preview](palettes/ember-ice.png) |
| Signal      | High-contrast dark; near-black with luminous accents  | [Sheet](palettes/signal.svg)    | [Preview](palettes/signal.png)    |
| Porcelain   | High-contrast light; deep ink with rich state bands   | [Sheet](palettes/porcelain.svg) | [Preview](palettes/porcelain.png) |

Signal and Porcelain target at least 7:1 text and identity contrast in every phase; the other palettes target at least 4.5:1. The [contrast report](palette-contrast.json) includes labels, identity marks, host badges, controls, and captions. These checks are not a complete accessibility certification or a substitute for physical-device review.

## Shared visual language

- Matrix: eleven client/host combinations × ten state/brightness examples = 110 tiles, including Claude Desktop with its own app-window badge alongside Claude CLI and IntelliJ.
- State labels: STARTING, WORKING, WAITING bright/dim, DONE bright/dim/aged/assessed, FAILED, and UNK. Longer labels remain on one line within the state band. Assessed DONE stays labeled DONE but uses a double check and a darker midnight-blue palette.
- Large monochrome product marks identify the client or harness, not the selected model. Neutral host badges distinguish CLI, IntelliJ, and desktop apps.
- Codex uses code brackets rather than a second terminal symbol or a mark resembling ChatGPT. JetBrains AI uses a neutral IJ monogram with a sparkle.
- A raised hand means user action is required; a check mark means work has finished. Colors, explicit labels, and symbols reinforce each other.
- The final strip displays seven tiles at 72 × 72 SVG pixels, including assessed DONE and Claude Desktop; the main matrix enlarges them to 90 × 90 for comparison. Screen zoom and display scaling affect physical size.
- WAITING and DONE brightness phases are static examples, not animation. Existing attention timings remain unchanged for unassessed completions; assessment stops completion blinking immediately.
- INFO is a separately placed dashboard action, shown with matching fixed paging controls.

## Assessed DONE

Assessment is a substate of DONE, not a new work state. It means that the user visited this session after its current completion, so its result is presumed reviewed; it is not proof that every word was read.

| Completion substate                  | Appearance                              | Attention                              |
|--------------------------------------|-----------------------------------------|----------------------------------------|
| Fresh, not assessed                  | Bright blue, single check               | Existing progressively slower flashing |
| Older than ten minutes, not assessed | Dark blue, single check                 | Steady                                 |
| Assessed after a visit               | Even darker midnight blue, double check | Steady immediately, regardless of age  |

The proposed behavior is:

- A verified visit to the specific session after completion assesses that completion. A visit while work is running does not pre-assess its future result.
- A successful session-specific navigation or an explicit assessment action can record the visit. Merely bringing IntelliJ, Claude, or another host application into focus must not assess every conversation in it. If navigation cannot identify the selected conversation, it must not silently claim that it was reviewed.
- Assessment belongs to one session and one completion. Another turn clears it; the next completion starts a fresh alert. Polling, model metadata, or the ten-minute threshold never assess a result.
- The completion timestamp remains unchanged. A separate assessment timestamp should be tied to that completion and persisted, so hub/plugin restarts do not restore an already-assessed alert.
- Assessed conversations remain open and focusable. Assessment neither removes a session nor changes closure behavior.

The full state wording, harness/host artwork, controls, and selectable palettes are implemented in the shared runtime renderer. Claude Desktop classification is supported for reported sessions, but automatic conversation tracking and assessed DONE visit detection remain unimplemented. These reference sheets do not change session detection or Stream Deck layout. Illustrating a product does not imply automatic conversation tracking is available for it.

## Session info key

The **AI Session Info** key is **Implemented**. It is a 72 × 72 key that you place directly below a session key. It shows the session of the key above it. The [info key study](session-freedom-key.svg) ([PNG](session-freedom-key.png)) is the design reference. The runtime renderer is `renderInfoCard` in `src/shared/card-design.ts`. It takes all colors from the selected palette.

| Element     | Content                                                                    |
|-------------|----------------------------------------------------------------------------|
| Top row     | Model name on the left, tokens used on the right                           |
| Bar         | Context used, with a mark at 80%. The bar uses the warning color from 80%. |
| Lower left  | AUTO symbol and label. The host never asks for decisions.                  |
| Lower right | Padlock and label. LIMIT, FULL, or "?" for freedom                         |

The dashboard has a **Show info keys** option. It is on by default. It controls the info key on the Stream Deck, in the dashboard preview, and in the virtual deck. In the web views, each session key has its info key below it.

A missing value shows a dashed shape or a dash. The symbol, the label, and the color carry the meaning together. Color is never the only signal.

| Freedom | Symbol         | Label | Meaning                                  |
| ------- | -------------- | ----- | ---------------------------------------- |
| Limited | Closed padlock | LIMIT | The host restricts or asks for changes   |
| Full    | Open padlock   | FULL  | The host can change without a barrier    |
| Unknown | Dashed padlock | ?     | The host does not report the mode        |

| Approval | Symbol                | Label | Meaning                                    |
| -------- | --------------------- | ----- | ------------------------------------------ |
| Asks     | None                  |       | The host asks for decisions                |
| Never    | Double chevron        | AUTO  | The host never asks for decisions          |
| Unknown  | Dashed double chevron | ?     | The host does not report the approval mode |

The AUTO symbol shows only when the mode is on or unknown. A session that reports neither mode shows one dashed padlock only. The two indicators are independent. A session can have a sandbox and still never ask.

### Data that each host supplies

| Host        | Model, tokens, context                                               | Freedom and approval                                                                      | Status                                                                                   |
|-------------|----------------------------------------------------------------------|-------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------|
| Codex       | `turn_context.model`; `token_count` total, last turn, context window | `sandbox_policy.type` (`danger-full-access` is full); `approval_policy` (`never` is AUTO) | **Implemented**. Verified in local rollout files. The `never` value is not seen locally. |
| Junie       | Not read yet                                                         | `brave` key is not read yet                                                               | Not implemented. The meaning of `brave` is not verified.                                 |
| Claude Code | Not in `sessions/<pid>.json`                                         | Not in `sessions/<pid>.json`                                                              | Not implemented. Needs a hook or a status line reporter.                                 |
| Copilot     | Model is read today; usage events are not verified                   | Allow-all flag is not verified                                                            | Not implemented. No local Copilot data was available.                                    |
| Other hosts | Optional fields in the reporter or the HTTP API                      | Optional fields in the reporter or the HTTP API                                           | **Implemented**                                                                          |

Other hosts report the values with these session fields: `tokensUsed`, `contextUsedPercent`, `freedom` (`limited` or `full`), and `approval` (`asks` or `never`). The `report upsert` command has the options `--tokens-used`, `--context-percent`, `--freedom`, and `--approval`. The hub stores only numbers and mode names. It never stores prompts, responses, sandbox paths, or commands (`ARCH-08`).

Open decisions:

- Claude Code usage comes from the transcript end. The adapter keeps only the model name and token counts. The freedom and AUTO modes are still not reported.
- Decide if a middle level, "asks first", is useful. Codex `on-request` is "asks" today.
- Confirm Junie `brave` mode and the Copilot allow-all flag before you add them.

## Regenerating the visuals

The source of truth is [palettes/tokens.json](palettes/tokens.json) plus the local [icon library](assets/icons.svg). All seven SVG outputs, their PNGs, the shared runtime assets in `src/shared/card-assets.ts`, browser artwork notices, and the contrast report are generated by [render-design-proposals.mjs](../../scripts/render-design-proposals.mjs). The token file's `previewPalette` selects the default study; `selectedPalette` identifies the shipped fallback (Fjord). A user's live choice is stored separately in the hub's `settings.json`, not in these source files. The shared geometry in `src/shared/card-design.ts` renders both the references and the live icons. Update the sources, not individual generated sheets, to keep the visuals aligned.

From the repository root, using the project's Node.js 24+ environment:

```sh
npm run design:preview
npm run design:check
```

To make the animated [Stream Deck XL mockup](../images/stream-deck-xl-mockup.gif) again, run `npm run design:mockup`. It uses the live key renderer (`streamdeck/src/cards.ts`) and the attention timing of the plugin. The 12-second loop contains full WAITING pulse cycles and full DONE flash periods. Update the mockup after a change to key artwork, palettes, or attention timing.

The same command also makes the [workflow mockup](../images/stream-deck-xl-workflow.gif). This 42.5-second animation shows sessions that start, change state, and end. Three DONE sessions older than ten minutes are on the deck at the start. Two of them start new work after one third and two thirds of the animation. Some new sessions close. Others stay open, and their DONE flash slows down. The outcomes include DONE, FAILED, WAITING, UNK, and closed sessions. The DONE flash slows down as the completion becomes older. Change the `workflowEvents` list in `scripts/render-deck-mockup.ts` to change the scenario.

PNG generation requires `rsvg-convert` on `PATH` (on macOS, install with `brew install librsvg`). The check command needs only Node.js; it verifies contrast targets, DONE darkness ordering, local symbol references, unique IDs, current wording, and generated SVG/runtime-asset/notices/report freshness. It does not compare PNG bytes, so regenerate PNGs and inspect them whenever sources change.

The SVGs embed every icon and need no network requests, external images, scripts, or downloaded fonts; text uses standard system fonts. Pinned artwork versions are recorded in the local icon library. Source URLs and third-party notices are in [the shared notices file](THIRD_PARTY_NOTICES.txt).

The shared renderer flattens icon artwork into transformed path groups with explicit colors, rather than nested SVG viewports or inherited `currentColor`. This keeps the same design compatible with Stream Deck's image renderer. Verify changes in the Stream Deck application preview as well as a browser.
