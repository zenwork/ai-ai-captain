# AI AI Captain – User Guide

This guide tells you how to build, install, start, and configure AI AI Captain.

## Contents

1. [About AI AI Captain](#1-about-ai-ai-captain)
2. [What you must have](#2-what-you-must-have)
3. [Prepare the computer](#3-prepare-the-computer)
4. [Build AI AI Captain](#4-build-ai-ai-captain)
5. [Install the Stream Deck plugin](#5-install-the-stream-deck-plugin)
6. [Start and stop AI AI Captain](#6-start-and-stop-ai-ai-captain)
7. [Use the dashboard and the keys](#7-use-the-dashboard-and-the-keys)
8. [Configure AI AI Captain](#8-configure-ai-ai-captain)
9. [Install a new version](#9-install-a-new-version)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. About AI AI Captain

AI AI Captain shows the status of your AI assistant sessions. It shows the status on a Stream Deck XL and in a web browser.

AI AI Captain has three parts:

| Part               | Function                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Hub                | A program that runs on your computer. It finds the AI sessions and records their status. The Stream Deck plugin starts it. |
| Dashboard          | A web page. It shows all sessions with their full names and details.                                                       |
| Stream Deck plugin | It shows one session on each key of the Stream Deck XL.                                                                    |

AI AI Captain finds these sessions automatically on macOS:

- GitHub Copilot CLI and GitHub Copilot in IntelliJ IDEA.
- Codex CLI, Codex in the ChatGPT desktop app, and Codex in JetBrains AI Assistant.
- Claude Code in the terminal, in IntelliJ IDEA, and in the Claude desktop app.
- Junie in IntelliJ IDEA.
- Claude desktop chats (experimental). Refer to [8.5](#85-other-ai-assistants).

AI AI Captain shows an APP key for an app that it detects but cannot track. Examples are plain ChatGPT chats and Microsoft Copilot.

AI AI Captain keeps all data on your computer. It does not keep your prompts or your conversations.

---

## 2. What you must have

### 2.1 Equipment

- A Mac computer with macOS.
- An Elgato Stream Deck XL (32 keys), connected with USB.

NOTE: You can use the dashboard without a Stream Deck.

### 2.2 Software

| Software               | Minimum version     | Where to get it                    |
| ---------------------- | ------------------- | ---------------------------------- |
| Node.js                | 24                  | <https://nodejs.org>               |
| Elgato Stream Deck app | 7.1                 | <https://www.elgato.com/downloads> |
| A web browser          | Any current version | Safari, Chrome, or Firefox         |

### 2.3 Access

- You must have an administrator account on the Mac.
- You must have a connection to the internet during the build.

---

## 3. Prepare the computer

### 3.1 Open the Terminal

You type all commands in this guide in the Terminal app.

1. Push **Command (⌘)** and **Space** at the same time.
2. Type `Terminal`.
3. Push **Return**.

To do a command, type or paste it, and push **Return**. Wait until the prompt shows again.

### 3.2 Install Node.js

1. Download the macOS installer for version 24 or higher from <https://nodejs.org>.
2. Open the file and follow the instructions on the screen.
3. In the Terminal, type this command:

   ```sh
   node --version
   ```

4. Make sure that the result starts with `v24` or a higher number.

### 3.3 Install the Stream Deck app

1. Download the Stream Deck app for macOS from <https://www.elgato.com/downloads>.
2. Install the app.
3. Connect the Stream Deck XL to the Mac.
4. Open the Stream Deck app. Make sure that it shows your Stream Deck XL.

### 3.4 Get the AI AI Captain files

1. Put the `ai-ai-captain` folder in your home folder. Example: `/Users/your-name/ai-ai-captain`.
2. In the Terminal, go to the folder:

   ```sh
   cd ~/ai-ai-captain
   ```

CAUTION: DO NOT MOVE OR RENAME THE `ai-ai-captain` FOLDER AFTER YOU INSTALL THE PLUGIN. IF YOU MOVE THE FOLDER, THE STREAM DECK PLUGIN STOPS.

NOTE: Start all commands in sections 4 to 9 in the `ai-ai-captain` folder. In a new Terminal window, type `cd ~/ai-ai-captain` again.

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

3. Make sure that the Terminal shows no lines with the word `error`.

NOTE: Lines with the word `warn` are usually not a problem.

---

## 5. Install the Stream Deck plugin

Do this procedure one time only.

### 5.1 Install the Stream Deck command tool

1. Type this command:

   ```sh
   npm install -g @elgato/cli
   ```

2. If the Terminal shows `EACCES` or `permission denied`, type `sudo npm install -g @elgato/cli`. Type your Mac password when the Terminal asks for it.

NOTE: The Terminal does not show the password when you type it.

### 5.2 Connect the plugin to the Stream Deck app

1. Make sure that the Stream Deck app is open.
2. Type this command:

   ```sh
   npm run reload:streamdeck
   ```

The command builds the plugin, enables developer mode, links the plugin, and restarts it.

### 5.3 Select the AI AI Captain profile

1. In the Stream Deck app, find the profile list at the top of the window.
2. Select the profile **AI AI Captain XL**.

The Stream Deck XL has this layout:

| Keys    | Function                                                        |
| ------- | --------------------------------------------------------------- |
| 1 to 30 | One AI session on each key. APP keys follow after the sessions. |
| 31      | Previous page                                                   |
| 32      | Next page                                                       |

---

## 6. Start and stop AI AI Captain

### 6.1 Start AI AI Captain

The Stream Deck plugin starts the hub automatically. You do not start the hub in the Terminal.

1. Open the Stream Deck app.
2. Wait approximately 5 seconds.

The keys show your AI sessions. AI AI Captain runs while the Stream Deck app runs.

NOTE: If the hub stops because of an error, the plugin starts it again. During this time, the keys show a gray question mark (**UNK**).

To start AI AI Captain when you log in to the Mac, make sure that **Elgato Stream Deck** is in **System Settings → General → Login Items**.

### 6.2 Open the dashboard

1. Open your web browser.
2. Go to <http://127.0.0.1:43681>.

You can also push the INFO key. Refer to [8.2](#82-add-a-key-that-opens-the-dashboard).

### 6.3 Stop AI AI Captain

1. Click the Stream Deck icon in the menu bar.
2. Click **Quit**.

The plugin and the hub stop. The dashboard is not available until you start the Stream Deck app again.

### 6.4 Start the hub manually (optional)

Do this procedure only if one of these conditions is true:

- You use AI AI Captain without a Stream Deck.
- You must change a setting of the hub. Refer to [8.3](#83-change-the-settings-of-the-hub).

1. Quit the Stream Deck app. Refer to [6.3](#63-stop-ai-ai-captain).
2. In the Terminal, type this command:

   ```sh
   npm start
   ```

3. Keep the Terminal window open.
4. Open the Stream Deck app.

The plugin finds the hub that runs in the Terminal and uses it.

CAUTION: IF YOU CLOSE THE TERMINAL WINDOW, THE HUB STOPS. THE STREAM DECK PLUGIN THEN STARTS ITS OWN HUB WITH THE DEFAULT SETTINGS.

To stop the manual hub, click its Terminal window. Push **Control** and **C** at the same time.

---

## 7. Use the dashboard and the keys

### 7.1 Key colors and labels

Each key shows one session. The color and the label show the status.

| Color             | Label    | Meaning                                                   | What to do                                       |
| ----------------- | -------- | --------------------------------------------------------- | ------------------------------------------------ |
| Green             | WORKING  | The AI is working.                                        | Wait.                                            |
| Amber, slow blink | WAITING  | The AI needs your answer or your permission.              | Go to the session and answer.                    |
| Blue, flashes     | DONE     | The AI finished its work.                                 | Look at the result.                              |
| Dark blue         | DONE     | The AI finished more than 10 minutes ago.                 | Look at the result when you have time.           |
| Purple            | STARTING | The session starts.                                       | Wait.                                            |
| Red               | FAILED   | The session has an error.                                 | Go to the session and look at the error.         |
| Gray              | UNK      | The status is not known, or the hub does not run.         | Read [10. Troubleshooting](#10-troubleshooting). |
| Not applicable    | APP      | AI AI Captain detects the app but cannot track its chats. | Push the key to open the app.                    |

The large symbol on the key shows the type of assistant. A small badge shows the host. `>_` is a terminal. `IJ` is IntelliJ IDEA. An app window is a desktop app.

### 7.2 Go to a session

Push the key of the session. The Mac shows the application of the session. For IntelliJ IDEA, it shows the correct project window.

### 7.3 Find the details of a session

1. Look at the number on the key.
2. Find the same number on the dashboard.
3. To see why a session has its status, click **State details & evidence**.

### 7.4 See more than 30 sessions

Push key 32 to see the next page. Push key 31 to see the previous page.

### 7.5 When a key goes away

- When you close a session, its key goes away after 10 seconds.
- When you close a terminal or an IntelliJ IDEA project, its keys go away after approximately 2 seconds.
- The other keys do not move.

### 7.6 Remove a stale key

A stale key shows an alert when you push it, and the session does not exist any more.

1. Push the key. The key shows the alert.
2. Push the key again within 10 seconds.

The hub removes the session. An automatic adapter can show the session again if its source files change.

---

## 8. Configure AI AI Captain

### 8.1 Change the colors of the keys

1. Open the dashboard.
2. Find **Icon palette** near the top of the page.
3. Select a palette:

   | Palette         | Description                         |
   | --------------- | ----------------------------------- |
   | Fjord (default) | The standard colors                 |
   | Nocturne        | Dark colors                         |
   | Ember & Ice     | Warm and cold colors                |
   | Signal          | High contrast on a dark background  |
   | Porcelain       | High contrast on a light background |

The dashboard changes immediately. The Stream Deck keys change in approximately 2 seconds. AI AI Captain keeps your selection after a restart.

NOTE: Use **Signal** or **Porcelain** if it is difficult for you to see the colors.

### 8.2 Add a key that opens the dashboard

You can add a purple **INFO** key. This key opens the dashboard in your browser.

1. Open the Stream Deck app.
2. In the action list, find **AI AI Captain**, then **Open AI AI Captain Dashboard**.
3. Drag it onto a key of your choice.

The INFO key stays at its position. Session keys do not use this position.

On macOS, INFO first tries to select the existing dashboard tab in your default browser. If this fails, INFO opens the dashboard through the default browser. This can create a new tab. INFO shows an exclamation mark only if both methods fail.

For Zen or Firefox tab reuse, give Accessibility permission to the application that runs the hub. Refer to [8.4](#84-give-accessibility-permission). Zen must show the dashboard tab in a browser window. Tabs in inactive workspaces can cause a new tab to open.

### 8.3 Change the settings of the hub

You can change these settings only when you start the hub manually. Refer to [6.4](#64-start-the-hub-manually-optional). Put the setting before `npm start` on the same line.

```sh
AI_AI_CAPTAIN_PRECISE_FOCUS=1 npm start
```

Type the setting each time you start the hub. The hub that the Stream Deck plugin starts always uses the default values.

| Setting                             | Default value                                 | Function                                                  |
| ----------------------------------- | --------------------------------------------- | --------------------------------------------------------- |
| `AI_AI_CAPTAIN_PORT`                | `43681`                                       | The network port of the hub.                              |
| `AI_AI_CAPTAIN_DATA_DIR`            | `~/Library/Application Support/ai-ai-captain` | The folder where AI AI Captain keeps its data.            |
| `AI_AI_CAPTAIN_PRECISE_FOCUS`       | Off                                           | Set to `1` to go to the exact window when you push a key. |
| `AI_AI_CAPTAIN_COPILOT_HOME`        | `~/.copilot`                                  | The Copilot data folder.                                  |
| `AI_AI_CAPTAIN_CODEX_HOME`          | `~/.codex`                                    | The Codex data folder.                                    |
| `AI_AI_CAPTAIN_CLAUDE_HOME`         | `~/.claude`                                   | The Claude data folder. `CLAUDE_CONFIG_DIR` also sets it. |
| `AI_AI_CAPTAIN_JUNIE_HOME`          | `~/.junie/sessions`                           | The Junie session folder.                                 |
| `AI_AI_CAPTAIN_JETBRAINS_INSTANCES` | `~/.junie/instances`                          | The folder where IntelliJ IDEA records its open projects. |

Change a data folder only if the assistant uses a different folder.

CAUTION: DO NOT CHANGE `AI_AI_CAPTAIN_PORT` IF YOU USE A STREAM DECK. THE PLUGIN USES THE DEFAULT PORT. IF YOU CHANGE THE PORT, THE PLUGIN STARTS A SECOND HUB ON THE DEFAULT PORT.

NOTE: If you change `AI_AI_CAPTAIN_PORT`, the dashboard address also changes. Example: for port `44000`, use <http://127.0.0.1:44000>.

### 8.4 Give Accessibility permission

macOS can ask for Accessibility permission. This applies to `AI_AI_CAPTAIN_PRECISE_FOCUS=1`, tab reuse for Zen or Firefox, and Claude desktop chats.

1. Open **System Settings → Privacy & Security → Accessibility**.
2. Turn on the application that runs the hub. For the Stream Deck plugin, this is the Stream Deck app. For a manual hub, this is Terminal.
3. Restart the hub.

NOTE: IntelliJ IDEA project windows work without this permission.

### 8.5 Other AI assistants

Most assistants need no setup. Copilot, Codex, Claude Code, and Junie sessions appear automatically when the assistant runs.

#### Junie

Junie sessions appear when their project is open in IntelliJ IDEA. The key shows the JetBrains AI mark. It shows WORKING, DONE, or FAILED. It does not show WAITING.

#### Claude Code and Claude desktop chats

The Claude mark identifies the assistant. Its badge identifies the terminal, IntelliJ, or the desktop app. If the runtime does not report approval status, the key cannot show WAITING.

Claude desktop chat support is experimental:

1. Give Accessibility permission to the application that runs the hub. Refer to [8.4](#84-give-accessibility-permission).
2. Open an existing chat in the Claude desktop app.
3. Check the dashboard for the session and its state details.

The app must show the conversation URL and English controls. Hidden chats and remote Code sessions are not tracked. If no conversation ID is available, Claude stays under **Other detected apps** on the dashboard and shows an APP key.

A chat key opens that conversation through its Claude link. AI AI Captain does not read message text or change Claude settings.

#### Other assistants

An unsupported assistant needs a lifecycle reporter. Refer to the [integration instructions](integrations/README.md).

---

## 9. Install a new version

1. If you started the hub manually, stop it. Refer to [6.4](#64-start-the-hub-manually-optional).
2. Make sure that the Stream Deck app is open.
3. Replace the files in the `ai-ai-captain` folder with the new files.

   CAUTION: DO NOT MOVE OR RENAME THE `ai-ai-captain` FOLDER.

4. Type these commands. Do one command at a time:

   ```sh
   cd ~/ai-ai-captain
   npm install
   npm run build
   npm run reload:streamdeck
   ```

5. If the dashboard is open in your browser, reload the page.

Your palette, your INFO key, and your sessions stay the same.

---

## 10. Troubleshooting

| Problem                                                         | Possible cause                                                                                    | Action                                                                                                           |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `command not found: node` or `command not found: npm`           | Node.js is not installed.                                                                         | Do [3.2](#32-install-nodejs). Close the Terminal and open it again.                                              |
| `Stream Deck CLI not found`, or `command not found: streamdeck` | The Stream Deck command tool is not installed.                                                    | Do [5.1](#51-install-the-stream-deck-command-tool). Then type `npm run reload:streamdeck`.                       |
| `Plugin not found: com.local.ai-ai-captain`                     | The plugin is not linked.                                                                         | Type `npm run reload:streamdeck`. The command links the plugin.                                                  |
| `npm install` or `npm run build` shows `error`.                 | The Node.js version is too old, or there is no internet.                                          | Make sure that `node --version` shows `v24` or higher. Check the internet connection. Do the command again.      |
| All keys show **UNK**.                                          | The hub starts or restarts. Or the hub cannot start.                                              | Wait 30 seconds. If the problem continues, type `npm run reload:streamdeck`.                                     |
| One key shows **UNK**.                                          | AI AI Captain cannot read the status of this session.                                             | On the dashboard, open **State details & evidence** for this session.                                            |
| The keys show a star only.                                      | The plugin did not start correctly.                                                               | Type `npm run reload:streamdeck`.                                                                                |
| The dashboard does not open.                                    | The Stream Deck app is not open, or the address is wrong.                                         | Open the Stream Deck app. Use <http://127.0.0.1:43681>.                                                          |
| The Terminal shows `EADDRINUSE`.                                | A hub runs already.                                                                               | Quit the Stream Deck app before you start the hub manually. Refer to [6.4](#64-start-the-hub-manually-optional). |
| An APP key shows instead of a session.                          | AI AI Captain cannot track the chats of this app.                                                 | Push the key to open the app.                                                                                    |
| A session does not show on the keys.                            | AI AI Captain cannot find this type of session.                                                   | Look at **Other detected apps** on the dashboard. Refer to [8.5](#85-other-ai-assistants).                       |
| A key shows an alert when you push it.                          | AI AI Captain cannot go to the session. The project is moved or deleted, or the session is stale. | Open the session manually. For a stale session, refer to [7.6](#76-remove-a-stale-key).                          |
| The plugin stopped after you moved the `ai-ai-captain` folder.  | The link to the plugin is broken.                                                                 | Move the folder back. Or type `npm run reload:streamdeck` from the new folder.                                   |

If the problem continues, send this information to your technical contact:

- The file `~/Library/Logs/ElgatoStreamDeck/StreamDeck.log`.
- The files in `~/ai-ai-captain/streamdeck/com.local.ai-ai-captain.sdPlugin/logs`. They contain the messages of the plugin and the hub.
- If you started the hub manually, the text in its Terminal window.
