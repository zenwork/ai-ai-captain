# AI AI Captain – Developer Guide

This guide is for users who work with the AI AI Captain GitHub project. It tells you how to get the source, build, install, run, configure, and package AI AI Captain.

For the daily use of the keys and the dashboard, use the [User Guide](USER_GUIDE.md). For the architecture and the contracts, refer to [architecture.md](architecture.md) and [intagration.md](intagration.md).

## Contents

1. [About this guide](#1-about-this-guide)
2. [What you must have](#2-what-you-must-have)
3. [Prepare the computer](#3-prepare-the-computer)
4. [Build AI AI Captain](#4-build-ai-ai-captain)
5. [Install the plugin from the source](#5-install-the-plugin-from-the-source)
6. [Run the hub](#6-run-the-hub)
7. [Change the settings of the hub](#7-change-the-settings-of-the-hub)
8. [Report sessions from other assistants](#8-report-sessions-from-other-assistants)
9. [Show all key variations](#9-show-all-key-variations)
10. [Make the plugin file for the Elgato Marketplace](#10-make-the-plugin-file-for-the-elgato-marketplace)
11. [Install a new version](#11-install-a-new-version)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. About this guide

Use this guide if one or more of these conditions is true:

- You want to build the plugin from the source.
- You use Linux. The Stream Deck app does not run on Linux.
- You want to use the hub without a Stream Deck.
- You want to change the settings of the hub.
- You want to report sessions from an assistant that AI AI Captain does not find automatically.
- You want to change the code or the documentation.

Before you change code or documentation, read [AGENTS.md](AGENTS.md). It gives the rules for language, code, tests, and commits.

---

## 2. What you must have

### 2.1 Equipment

- A computer with macOS, Linux, or Windows 10 or later.
- Linux only: install `xdotool` for window focus. Window focus works in X11 sessions only. It does not work in Wayland.
- Windows only: PowerShell (`powershell.exe`) must be available. Windows cannot list open files, so Codex and Copilot sessions use lock files only.
- Optional: an Elgato Stream Deck XL (32 keys), connected with USB.

NOTE: You can use the dashboard and the virtual deck without a Stream Deck.

These functions work on macOS only:

- Claude desktop chats.
- Use of the dashboard tab again when you push the INFO key.
- Focus on the correct IntelliJ IDEA project window.

### 2.2 Software

| Software               | Minimum version     | Where to get it                    |
| ---------------------- | ------------------- | ---------------------------------- |
| Git                    | Any current version | <https://git-scm.com>              |
| Node.js                | 24                  | <https://nodejs.org>               |
| Elgato Stream Deck app | 7.1 (optional)      | <https://www.elgato.com/downloads> |
| A web browser          | Any current version | Safari, Chrome, or Firefox         |

### 2.3 Access

- You must have an administrator account on the computer.
- You must have a connection to the internet during the build.

---

## 3. Prepare the computer

### 3.1 Open a terminal

You type all commands in this guide in a terminal. On macOS, use the Terminal app:

1. Push **Command (⌘)** and **Space** at the same time.
2. Type `Terminal`.
3. Push **Return**.

To do a command, type or paste it, and push **Return**. Wait until the prompt shows again.

### 3.2 Install Node.js

1. Download the installer for version 24 or higher from <https://nodejs.org>.
2. Open the file and follow the instructions on the screen.
3. Type this command:

   ```sh
   node --version
   ```

4. Make sure that the result starts with `v24` or a higher number.

### 3.3 Install the Stream Deck app (optional)

Do this procedure only if you have a Stream Deck.

1. Download the Stream Deck app from <https://www.elgato.com/downloads>.
2. Install the app.
3. Connect the Stream Deck XL to the computer.
4. Open the Stream Deck app. Make sure that it shows your Stream Deck XL.

### 3.4 Get the source files

1. Go to your home folder:

   ```sh
   cd ~
   ```

2. Clone the GitHub project:

   ```sh
   git clone https://github.com/zenwork/ai-ai-captain.git
   ```

3. Go to the project folder:

   ```sh
   cd ai-ai-captain
   ```

CAUTION: DO NOT MOVE OR RENAME THE `ai-ai-captain` FOLDER AFTER YOU INSTALL THE PLUGIN. IF YOU MOVE THE FOLDER, THE STREAM DECK PLUGIN STOPS.

NOTE: Start all commands in sections 4 to 11 in the `ai-ai-captain` folder. In a new terminal window, type `cd ~/ai-ai-captain` again.

---

## 4. Build AI AI Captain

The build makes the programs from the source files. Do it one time, and again after each new version.

1. Download the necessary components. This can take some minutes.

   ```sh
   npm install
   ```

2. Build AI AI Captain:

   ```sh
   npm run build
   ```

3. Make sure that the terminal shows no lines with the word `error`.

NOTE: Lines with the word `warn` are usually not a problem.

To check the code after a change, use these commands:

| Command                | Function                                              |
| ---------------------- | ----------------------------------------------------- |
| `npm run typecheck`    | Check the types of the hub and the plugin             |
| `npm test`             | Run all tests                                         |
| `npm run lint`         | Lint all TypeScript. A warning is a failure.          |
| `npm run lint:fix`     | Repair the lint problems that ESLint can repair       |
| `npm run format`       | Format all files with Prettier                        |
| `npm run format:check` | Find files that do not agree with the Prettier format |

---

## 5. Install the plugin from the source

Do this procedure one time only. You must have the Stream Deck app. Refer to [3.3](#33-install-the-stream-deck-app-optional).

### 5.1 Install the Stream Deck command tool

1. Type this command:

   ```sh
   npm install -g @elgato/cli
   ```

2. If the terminal shows `EACCES` or `permission denied`, type `sudo npm install -g @elgato/cli`.
3. Type your password when the terminal asks for it.

NOTE: The terminal does not show the password when you type it.

### 5.2 Connect the plugin to the Stream Deck app

1. Make sure that the Stream Deck app is open.
2. Type this command:

   ```sh
   npm run reload:streamdeck
   ```

The command builds the plugin, enables developer mode, links the plugin, and restarts it. The linked plugin uses the files in the project folder.

### 5.3 Select the AI AI Captain profile

1. In the Stream Deck app, find the profile list at the top of the window.
2. Select the profile **AI AI Captain XL**.

For the key layout and the use of the keys, refer to the [User Guide](USER_GUIDE.md).

---

## 6. Run the hub

You can run the hub in four ways:

| Method                | Command            | Port    | Use                                         |
| --------------------- | ------------------ | ------- | ------------------------------------------- |
| Started by the plugin | None               | `43681` | Normal use with a Stream Deck               |
| Manual hub            | `npm start`        | `43681` | Use without a Stream Deck, or with settings |
| Development hub       | `npm run dev`      | `43681` | Debug the hub and the dashboard             |
| Deck app              | `npm run deck:app` | `43682` | A separate hub and a small deck window      |

### 6.1 Use the hub that the plugin starts

The Stream Deck plugin starts the hub automatically when the Stream Deck app opens. The hub stops when the Stream Deck app stops. This hub always uses the default settings.

NOTE: If the hub stops because of an error, the plugin starts it again. During this time, the keys show a gray question mark (**UNK**).

### 6.2 Start the hub manually

Do this procedure if you use AI AI Captain without a Stream Deck, or if you must change a setting of the hub.

1. If the Stream Deck app is open, quit it.
2. Type this command:

   ```sh
   npm start
   ```

3. Keep the terminal window open.
4. Optional: open the Stream Deck app.

The plugin finds the hub that runs in the terminal and uses it.

CAUTION: IF YOU CLOSE THE TERMINAL WINDOW, THE HUB STOPS. THE STREAM DECK PLUGIN THEN STARTS ITS OWN HUB WITH THE DEFAULT SETTINGS.

To stop the manual hub, click its terminal window. Push **Control** and **C** at the same time.

### 6.3 Start the development hub

Use this command to debug the hub and the dashboard:

```sh
npm run dev
```

The command builds the dashboard and starts the hub in watch mode. When you change a file in `src/server/`, the hub starts again. While the hub starts again, the plugin waits. The plugin starts its own hub only after two failed checks.

### 6.4 Open the dashboard and the virtual deck

1. Make sure that a hub runs.
2. Open <http://127.0.0.1:43681> for the dashboard.
3. Open <http://127.0.0.1:43681/deck.html> for the virtual deck.

For the functions of the dashboard and the virtual deck, refer to the [User Guide](USER_GUIDE.md).

### 6.5 Open the deck app

This command starts a separate hub and opens the virtual deck in a small Chrome or Chromium window:

```sh
npm run deck:app
```

- On macOS, the command uses Google Chrome.
- On Linux, the command uses `google-chrome`, `google-chrome-stable`, `chromium`, or `chromium-browser` from `PATH`.
- Other operating systems are not supported by this command.

This hub uses port `43682`, so it does not stop the hub on port `43681`. The startup check ignores proxy settings and curl configuration. Each check has a one-second limit.

| Setting                          | Default   | Function                     |
| -------------------------------- | --------- | ---------------------------- |
| `AI_AI_CAPTAIN_DECK_PORT`        | `43682`   | The port of the deck app hub |
| `AI_AI_CAPTAIN_DECK_WINDOW_SIZE` | `420,140` | The size of the deck window  |

To stop this hub, push **Control** and **C** in the terminal.

---

## 7. Change the settings of the hub

You can change these settings only when you start the hub manually. Refer to [6.2](#62-start-the-hub-manually). Put the setting before `npm start` on the same line:

```sh
AI_AI_CAPTAIN_PRECISE_FOCUS=1 npm start
```

Type the setting each time you start the hub.

| Setting                                         | Default value                                 | Function                                                   |
| ----------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------- |
| `AI_AI_CAPTAIN_PORT`                            | `43681`                                       | The network port of the hub.                               |
| `AI_AI_CAPTAIN_DATA_DIR`                        | `~/Library/Application Support/ai-ai-captain` | The folder where AI AI Captain keeps its data.             |
| `AI_AI_CAPTAIN_PRECISE_FOCUS`                   | Off                                           | Set to `1` to go to the exact window when you push a key.  |
| `AI_AI_CAPTAIN_COPILOT_HOME`                    | `~/.copilot`                                  | The Copilot data folder.                                   |
| `AI_AI_CAPTAIN_CODEX_HOME`                      | `~/.codex`                                    | The Codex data folder.                                     |
| `AI_AI_CAPTAIN_CLAUDE_HOME`                     | `~/.claude`                                   | The Claude data folder. `CLAUDE_CONFIG_DIR` also sets it.  |
| `AI_AI_CAPTAIN_JUNIE_HOME`                      | `~/.junie/sessions`                           | The Junie session folder.                                  |
| `AI_AI_CAPTAIN_JETBRAINS_INSTANCES`             | `~/.junie/instances`                          | The folder where IntelliJ IDEA records its open projects.  |
| `AI_AI_CAPTAIN_SANDBOX`                         | Off                                           | Set to `1` for tests. The hub does not scan desktop apps.  |
| `AI_AI_CAPTAIN_DISCOVERY_INTERVAL_MILLISECONDS` | `5000`                                        | The time between two scans. The minimum is `100`.          |
| `AI_AI_CAPTAIN_FOCUS_LOG`                       | Off                                           | A file path. The hub writes focus commands and skips them. |

Change a data folder only if the assistant uses a different folder.

CAUTION: DO NOT CHANGE `AI_AI_CAPTAIN_PORT` IF YOU USE A STREAM DECK. THE PLUGIN USES THE DEFAULT PORT. IF YOU CHANGE THE PORT, THE PLUGIN STARTS A SECOND HUB ON THE DEFAULT PORT.

NOTE: If you change `AI_AI_CAPTAIN_PORT`, the dashboard address also changes. Example: for port `44000`, use <http://127.0.0.1:44000>.

### 7.1 Give Accessibility permission (macOS)

These functions need Accessibility permission on macOS:

- `AI_AI_CAPTAIN_PRECISE_FOCUS=1`.
- Tab selection in Zen or Firefox.
- Claude desktop chats.

1. Open **System Settings → Privacy & Security → Accessibility**.
2. Turn on the application that runs the hub. For the plugin hub, this is the Stream Deck app. For a manual hub, this is the terminal app.
3. Start the hub again.

---

## 8. Report sessions from other assistants

AI AI Captain finds Copilot, Codex, Claude Code, and Junie sessions automatically. Another assistant needs a reporter. A reporter sends the session status to the hub.

To report a session, use the reporter command:

```sh
npm run report -- upsert --source codex --harness codex-cli --state working --label "Refactor auth" --project "$PWD" --app "IntelliJ IDEA"
```

To end a session, use this command:

```sh
npm run report -- end --id SESSION_ID --state done
```

You can also use the session API of the hub. Refer to [README.md](README.md) and `INT-03` in [intagration.md](intagration.md).

WARNING: DO NOT PUT PROMPTS, TRANSCRIPTS, OR SECRETS IN `label`, `project`, OR `metadata`. THE HUB SHOWS THESE VALUES ON THE KEYS AND ON THE DASHBOARD.

For hooks and examples, refer to [integrations/README.md](integrations/README.md).

---

## 9. Show all key variations

Use the demo to test the keys. It shows 24 keys: each of the 12 key types two times. The states change every 4 seconds.

1. Make sure that a hub runs.
2. Type this command:

   ```sh
   npm run demo:keys
   ```

3. Look at keys 1 to 24 on the Stream Deck or on the virtual deck.
4. To stop the demo, push **Control** and **C**.

When the demo stops, it removes every demo key. This includes leftover keys from an earlier demo.

To change the time between steps, add `--interval`. The unit is seconds:

```sh
npm run demo:keys -- --interval 8
```

To compare the flash intensity levels, add `--brightness`:

```sh
npm run demo:keys -- --brightness
```

Keys 1 to 5 show WAITING. Keys 6 to 10 show DONE. Intensity 0 to 4 goes from left to right. The terminal shows the name of each key. This demo does not change the saved setting of the hub.

NOTE: The demo cannot show the aged and assessed DONE keys. These keys need a real session age. The demo keys go before other session keys on the first page.

### 9.1 Play scenarios with mock agents

The sandbox starts a hub with mock agents. The mock agents are real processes with the names that the hub looks for. They write the files that the hub reads. The sandbox also runs the adapters, and `npm run demo:keys` does not.

1. Stop every other hub. The sandbox stops when a hub listens on port `43681`.
2. Type this command:

   ```sh
   npm run sandbox -- e2e/scenarios/claude-code-lifecycle.ts e2e/fixtures/claude-code/hand-written/lifecycle.recording.json
   ```

3. Open <http://127.0.0.1:43681/deck.html> to see the virtual deck.
4. Read the PASS and FAIL lines in the terminal.

To use a different port, add `--port=<number>` before the scenarios. A scenario module must export a list named `scenarios`. A recording is a `.json` file.

To play the scenarios again and again, add `--loop` before the scenarios. To play as fast as the hub allows, add `--fast`. The sandbox then ignores recorded times and pauses, and waits 1 second after each check. Add `--settle=<duration>` to change this time. Press **Control** and **C** to stop.

To see the scenarios on the physical Stream Deck, use the setup command in [9.2](#92-show-mock-agents-on-the-physical-deck).

### 9.2 Show mock agents on the physical deck

The plugin uses a hub that already answers when the plugin starts. Thus, the sandbox hub must run before the Stream Deck app starts. This command does the steps for you. It works on macOS only.

CAUTION: THE COMMAND QUITS THE STREAM DECK APP. THE REAL HUB OF THE PLUGIN STOPS WITH IT. YOUR REAL SESSIONS DISAPPEAR FROM THE DECK UNTIL THE SANDBOX STOPS.

1. Save your work in the Stream Deck app.
2. Type this command:

   ```sh
   npm run sandbox:deck
   ```

3. Look at the first keys of the Stream Deck. The mock session goes through WORKING, WAITING, WORKING, and DONE. Each state stays for 4 seconds.
4. To stop, push **Control** and **C**.

The command does these steps in sequence:

1. It quits the Stream Deck app, if the app runs.
2. It waits until port `43681` is free. If a hub still listens, it stops and tells you. It never stops a hub by force.
3. It starts the sandbox hub on port `43681` and plays the scenarios in a loop.
4. It starts the Stream Deck app.

When you stop the command, the plugin starts its own hub again after a few seconds. To play other scenarios, add them to the command:

```sh
npm run sandbox:deck -- e2e/fixtures/claude-code/hand-written/lifecycle.recording.json
```

### 9.3 Run the end-to-end tests

The end-to-end tests start the real hub and mock agents in a temporary folder. They do not change your files. The tests run on macOS and Linux. The Junie scenario runs on macOS only.

1. Install the browser for the virtual deck once:

   ```sh
   npx playwright-core install chromium
   ```

2. Type this command:

   ```sh
   npm run test:e2e
   ```

The browser runs headless, so the tests need no display. To see the browser while a test runs, set `AI_AI_CAPTAIN_E2E_HEADED=1` before the command. CI ignores this setting.

If a test fails, the message shows the scenario name, the step number, and the last sessions of the hub. The test also keeps a recording of the steps until the failure. The message gives the path of the recording. Refer to [test-harness.md](test-harness.md) for the design of the tests.

### 9.4 Write a scenario

A scenario is a list of steps. Each step does one thing: start a mock agent, change a file, or check the hub. Put a scenario in `e2e/scenarios/`. Name the file `<agent>-<topic>.ts`. Name the test `<agent>-<topic>.e2e.test.ts`.

This example runs one Codex session through working and done:

```ts
import { codex } from "../harness/codex.js";
import { scenario } from "../harness/scenario.js";

await scenario("codex short life cycle", { cli: codex({ model: "codex-model" }) })
  .step("cli", (agent) => agent.spawn())
  .step("cli", (agent) => agent.startTurn())
  .expectSession("cli", { harness: "codex-cli", state: "working" })
  .step("cli", (agent) => agent.completeTurn())
  .expectSession("cli", { state: "done" })
  .run();
```

The second argument of `scenario()` names the agents. The first argument of `.step()` and `.expectSession()` is one of these names. The editor shows the steps of that agent and the fields of a session. It rejects a name that the scenario does not have. A scenario can use more than one agent. Use a different name for each agent.

| Agent       | Import                               | Process that the hub looks for | Systems      |
| ----------- | ------------------------------------ | ------------------------------ | ------------ |
| Claude Code | `claudeCode()` and `ClaudeCodeSteps` | `claude`                       | macOS, Linux |
| Codex       | `codex()` and `CodexSteps`           | `codex`                        | macOS, Linux |
| Copilot     | `copilot()` and `CopilotSteps`       | `copilot`                      | macOS, Linux |
| Junie       | `junie()` and `JunieSteps`           | IntelliJ IDEA (`idea`)         | macOS        |

These methods check the hub and the deck:

| Method                        | Function                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| `.expectSession(key, fields)` | Wait until the session has these fields. Use `undefined` to wait until it is gone.   |
| `.deck(options)`              | Open the virtual deck in a headless browser. Use it before the deck steps.           |
| `.expectDeck(check)`          | Wait until the check passes for a snapshot of the deck keys.                         |
| `.advanceDeckClock("10m")`    | Move the clock of the deck page forward, to age a DONE key. Use `clock: "manual"`.   |
| `.pressKey(number)`           | Press a session key or an app key on the virtual deck.                               |
| `.expectFocus({ appName })`   | Wait until the hub tries to focus the application. The hub does not run the command. |
| `.wait("2s")`                 | Wait. Use it only for behavior that depends on time.                                 |

Each expectation waits up to 15 seconds. Add `{ within: "30s" }` to change the limit. Add `{ during: "5s" }` to make sure that the value does not change.

NOTE: The hub in a test sees all processes of the computer. If IntelliJ IDEA runs on your computer, the hub sees it too. Thus the Junie scenario does not check that the session disappears when the mock IDE stops.

### 9.5 Show a scenario on a virtual deck or a physical deck

The virtual deck is the page `/deck.html` of the hub. The physical deck is the Stream Deck with the plugin. Both show the sessions of the hub. Use the sandbox for both.

1. Export the scenarios from a module as `export const scenarios: ScenarioBuilder[] = [...]`. The modules `e2e/scenarios/*-lifecycle.ts` are examples. They wait 4 seconds after each state.
2. To show the scenario on the virtual deck, type this command and open <http://127.0.0.1:43681/deck.html>:

   ```sh
   npm run sandbox -- e2e/scenarios/codex-lifecycle.ts
   ```

3. To show the scenario on the physical deck, type this command. Read the CAUTION in [9.2](#92-show-mock-agents-on-the-physical-deck) first:

   ```sh
   npm run sandbox:deck -- e2e/scenarios/codex-lifecycle.ts
   ```

You can give more than one module or recording to both commands. They play the files in the order that you give them. Add `--loop` to the sandbox command to play them again and again.

To check the virtual deck in a test, use `.deck()` and `.expectDeck()` in the scenario. The test runs the browser headless. To see the browser, set `AI_AI_CAPTAIN_E2E_HEADED=1`.

### 9.6 Use a recording

A recording is a JSON file with the steps of a scenario. A recording has three parts: a header, a timeline of operations, and the expected states. The player plays the timeline and checks the expected states in sequence.

Use a recording to do these tasks:

- Play a session from an issue report again.
- Make sure that an inline scenario and a recording give the same result.
- Show the same steps on a deck, without TypeScript.

To play a recording in a test:

```ts
import { scenario } from "../harness/scenario.js";

await scenario.fromRecording("e2e/fixtures/claude-code/hand-written/lifecycle.recording.json").run();
```

To play a recording on a deck, give the file to `npm run sandbox` or `npm run sandbox:deck`.

A recording uses placeholders for values that change in each run: `{PID}`, `{SESSION}`, `{NOW}`, `{CLAUDE_HOME}`, `{CODEX_HOME}`, `{COPILOT_HOME}`, `{JUNIE_HOME}`, and `{PROJECT_1}`. A path in a recording must stay inside the temporary folder of the test.

### 9.7 Export a session to a recording

Usage:

```sh
npm run export:recording -- <codex|copilot|claude|junie> --list [--home=<folder>] [--limit=<number>]
npm run export:recording -- <codex|copilot|claude|junie> <session identifier or file> [--home=<folder>] [--out=<file>]
```

Use the export script to turn a real session into a recording. Run the script by hand. The hub does not run it. Codex, Copilot, Claude Code, and Junie sessions work.

1. Make a list of the sessions on the computer:

   ```sh
   npm run export:recording -- codex --list
   ```

   Each line has the session identifier, the time of the last change, and the size of the file. The newest session is the first line. The list shows no content. For other agents, use `copilot`, `claude`, or `junie` in place of `codex`. To show more than 20 lines, add `--limit=<number>`.

2. Choose a session. Use the time and the size to find the session that you want. A session that you just used has the newest time.
3. Type this command with the identifier from the list:

   ```sh
   npm run export:recording -- codex <session identifier>
   ```

   For another agent, use `copilot`, `claude`, or `junie` in place of `codex`.

4. Open the file that the command names. Read it.
5. Play it to check it:

   ```sh
   npm run sandbox -- codex-<short identifier>.recording.json
   ```

The list and the export read the default folders `~/.codex`, `~/.copilot`, `~/.claude`, and `~/.junie/sessions`. The variables `AI_AI_CAPTAIN_CODEX_HOME`, `AI_AI_CAPTAIN_COPILOT_HOME`, `AI_AI_CAPTAIN_CLAUDE_HOME`, and `AI_AI_CAPTAIN_JUNIE_HOME` change them. For a file that is not in these folders, give the path of the event file in place of the identifier. To use another agent folder, add `--home=<folder>`. To choose the name of the output, add `--out=<file>`. The command never overwrites a file.

The recording has the sequence of events and nothing else. It has no prompt, response, tool data, error text, model name, token count, path, or session identifier. The recording keeps the event types, the time between events, and the pairing of requests with answers. The command writes the expected states from the state reducer of the hub.

NOTE: A Claude Code export reads the transcript, because the registration file has no history. A prompt gives `busy`, and the end of a turn gives `idle`. The recording never has the state `waiting`. To record the real statuses, use the watch mode that follows. A Junie export keeps `INPUT_REQUIRED`, which the hub shows as WAITING.

NOTE: The expected states show what the current hub does with the events. If the hub is wrong, the recording is wrong too. Check that the states agree with what you saw in the real session.

To record the real statuses of a Claude Code session, watch it while it runs:

1. Open a second terminal and type this command:

   ```sh
   npm run export:recording -- claude --watch
   ```

   Add the session identifier or the process identifier when more than one session runs. The command lists them.

2. Use Claude Code as usual. The command prints each new status, for example `permission_required`.
3. Press **Control** and **C**, or end the session. The command writes `claude-<short identifier>.recording.json`.

The watch keeps only the status names and the time between changes. It never overwrites a file.

Two more ways give a recording:

- **From a failed scenario.** The error message ends with the path of a recording with the steps until the failure.
- **From an inline scenario.** Call `.toRecording()` on the scenario.

To keep a simulator correct, also make a shape file from a real session:

1. Read one real file of the agent, for example a `rollout-*.jsonl` file of Codex.
2. Write the key names and the value types of each event type to a `*.shape.json` file in `e2e/fixtures/<agent>/<version>/`. Do not write values.
3. Add a unit test that checks each event of the simulator against the shape file. `e2e/harness/codex.test.ts` is an example.

NOTE: The project has no real Copilot or Junie shape files yet. Their simulators follow the code of the adapters and the unit tests.

---

## 10. Make the plugin file for the Elgato Marketplace

1. Edit `streamdeck/marketplace.json`. Set the author, the description, and the tags.
2. Type this command:

   ```sh
   npm run pack:streamdeck
   ```

3. Find the plugin file and `listing.md` in `dist/marketplace/`.
4. In Maker Console, upload the plugin file.
5. Copy the text from `listing.md` into Maker Console.

The release workflow does steps 2 and 3 for each release that Release Please makes. It attaches the plugin file and `listing.md` to the GitHub release. Elgato has no upload API. Thus you must upload the plugin file in Maker Console manually.

For more information, refer to [streamdeck/README.md](streamdeck/README.md).

---

## 11. Install a new version

1. If you started the hub manually, stop it. Refer to [6.2](#62-start-the-hub-manually).
2. Make sure that the Stream Deck app is open.
3. Get the new source files:

   ```sh
   git pull
   ```

   CAUTION: DO NOT MOVE OR RENAME THE `ai-ai-captain` FOLDER.

4. Type these commands. Do one command at a time:

   ```sh
   npm install
   npm run build
   npm run reload:streamdeck
   ```

5. If the dashboard is open in your browser, reload the page.

Your palette, your INFO key, and your sessions stay the same.

---

## 12. Troubleshooting

For problems with the keys and the dashboard, refer to the troubleshooting section of the [User Guide](USER_GUIDE.md).

| Problem                                                         | Possible cause                                           | Action                                                                                                      |
| --------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `command not found: node` or `command not found: npm`           | Node.js is not installed.                                | Do [3.2](#32-install-nodejs). Close the terminal and open it again.                                         |
| `Stream Deck CLI not found`, or `command not found: streamdeck` | The Stream Deck command tool is not installed.           | Do [5.1](#51-install-the-stream-deck-command-tool). Then type `npm run reload:streamdeck`.                  |
| `Plugin not found: com.local.ai-ai-captain`                     | The plugin is not linked.                                | Type `npm run reload:streamdeck`. The command links the plugin.                                             |
| `npm install` or `npm run build` shows `error`.                 | The Node.js version is too old, or there is no internet. | Make sure that `node --version` shows `v24` or higher. Check the internet connection. Do the command again. |
| All keys show **UNK** for more than 30 seconds.                 | The hub cannot start.                                    | Type `npm run reload:streamdeck`.                                                                           |
| The keys show a star only.                                      | The plugin did not start correctly.                      | Type `npm run reload:streamdeck`.                                                                           |
| The terminal shows `EADDRINUSE`.                                | A hub runs already.                                      | Quit the Stream Deck app before you start the hub manually. Refer to [6.2](#62-start-the-hub-manually).     |
| The plugin stopped after you moved the `ai-ai-captain` folder.  | The link to the plugin is broken.                        | Move the folder back. Or type `npm run reload:streamdeck` from the new folder.                              |

If the problem continues, collect this data:

- The file `~/Library/Logs/ElgatoStreamDeck/StreamDeck.log`.
- The files in `streamdeck/com.local.ai-ai-captain.sdPlugin/logs/` in the project folder. They contain the messages of the plugin and the hub.
- If you started the hub manually, the text in its terminal window.

CAUTION: READ THE LOG FILES BEFORE YOU SEND THEM. REMOVE ALL PRIVATE DATA.
