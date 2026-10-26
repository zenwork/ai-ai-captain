# AI AI Captain – User Guide

This guide tells you how to build, install, start, and configure AI AI Captain.

The text uses [ASD-STE100 Simplified Technical English](https://www.asd-ste100.org/).

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

AI AI Captain shows the status of your AI assistant sessions.

It shows the status on a Stream Deck XL and in a web browser.

AI AI Captain has three parts:

| Part               | Function                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Hub                | A program that runs on your computer. It finds the AI sessions and records their status. The Stream Deck plugin starts it. |
| Dashboard          | A web page. It shows all sessions with their full names and details.                                                       |
| Stream Deck plugin | It shows one session on each key of the Stream Deck XL.                                                                    |

AI AI Captain finds these sessions automatically on macOS:

- GitHub Copilot CLI.
- GitHub Copilot in IntelliJ IDEA.
- Codex CLI.
- Codex in JetBrains AI Assistant.

AI AI Captain keeps all data on your computer. It does not keep your prompts or your conversations.

---

## 2. What you must have

### 2.1 Equipment

- A Mac computer with macOS.
- An Elgato Stream Deck XL (32 keys).
- A USB connection between the Stream Deck XL and the Mac.

NOTE: You can use the dashboard without a Stream Deck.

### 2.2 Software

| Software               | Minimum version     | Where to get it                        |
| ---------------------- | ------------------- | -------------------------------------- |
| Node.js                | 24                  | <https://nodejs.org>                   |
| Elgato Stream Deck app | 7.1                 | <https://www.elgato.com/downloads>     |
| A web browser          | Any current version | For example Safari, Chrome, or Firefox |

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

A window with a text prompt opens. This is the Terminal.

To do a command:

1. Type the command or paste it into the Terminal.
2. Push **Return**.
3. Wait until the prompt shows again.

NOTE: Copy the commands from this guide. This prevents typing errors.

### 3.2 Install Node.js

1. Go to <https://nodejs.org>.
2. Download the macOS installer for version 24 or higher.
3. Open the downloaded file.
4. Follow the instructions on the screen.
5. In the Terminal, type this command:

   ```sh
   node --version
   ```

6. Make sure that the result starts with `v24` or a higher number.

### 3.3 Install the Stream Deck app

1. Go to <https://www.elgato.com/downloads>.
2. Download the Stream Deck app for macOS.
3. Install the app.
4. Connect the Stream Deck XL to the Mac.
5. Open the Stream Deck app.
6. Make sure that the app shows your Stream Deck XL.

### 3.4 Get the AI AI Captain files

You get the AI AI Captain folder from the person who gives you the software.

1. Put the `ai-ai-captain` folder in your home folder.

   Example: `/Users/your-name/ai-ai-captain`

2. In the Terminal, go to the folder:

   ```sh
   cd ~/ai-ai-captain
   ```

CAUTION: DO NOT MOVE OR RENAME THE `ai-ai-captain` FOLDER AFTER YOU INSTALL THE PLUGIN. IF YOU MOVE THE FOLDER, THE STREAM DECK PLUGIN STOPS.

NOTE: All commands in sections 4 to 9 must start in the `ai-ai-captain` folder. If you open a new Terminal window, type `cd ~/ai-ai-captain` again.

---

## 4. Build AI AI Captain

The build makes the programs from the source files. You do the build one time. You do it again only when you get a new version.

1. Go to the `ai-ai-captain` folder:

   ```sh
   cd ~/ai-ai-captain
   ```

2. Download the necessary components:

   ```sh
   npm install
   ```

   This can take some minutes.

3. Build AI AI Captain:

   ```sh
   npm run build
   ```

4. Make sure that the Terminal shows no lines with the word `error`.

NOTE: Lines with the word `warn` are usually not a problem.

---

## 5. Install the Stream Deck plugin

Do this procedure one time only.

### 5.1 Install the Stream Deck command tool

1. Type this command:

   ```sh
   npm install -g @elgato/cli
   ```

2. If the Terminal shows `EACCES` or `permission denied`, type this command:

   ```sh
   sudo npm install -g @elgato/cli
   ```

3. When the Terminal asks for a password, type your Mac password and push **Return**.

   NOTE: The Terminal does not show the password when you type it.

### 5.2 Connect the plugin to the Stream Deck app

1. Make sure that the Stream Deck app is open.
2. Type these commands. Do one command at a time:

   ```sh
   streamdeck dev
   streamdeck link streamdeck/com.local.ai-ai-captain.sdPlugin
   streamdeck restart com.local.ai-ai-captain
   ```

### 5.3 Select the AI AI Captain profile

1. Open the Stream Deck app.
2. Find the profile list at the top of the window.
3. Select the profile **AI AI Captain XL**.

The Stream Deck XL now has this layout:

| Keys    | Function                   |
| ------- | -------------------------- |
| 1 to 30 | One AI session on each key |
| 31      | Previous page of sessions  |
| 32      | Next page of sessions      |

NOTE: The plugin starts the hub automatically. Refer to [6.1](#61-start-ai-ai-captain).

---

## 6. Start and stop AI AI Captain

### 6.1 Start AI AI Captain

The Stream Deck plugin starts the hub automatically. You do not start the hub in the Terminal.

1. Open the Stream Deck app.
2. Wait approximately 5 seconds.

The keys show your AI sessions. AI AI Captain runs while the Stream Deck app runs.

NOTE: If the hub stops because of an error, the plugin starts it again automatically. During this time, the keys show a gray question mark (**UNK**).

To start AI AI Captain automatically when you log in to the Mac:

1. Open **System Settings**.
2. Click **General**, then **Login Items**.
3. Make sure that **Elgato Stream Deck** is in the list. If it is not in the list, click **+** and add it.

### 6.2 Open the dashboard

1. Open your web browser.
2. Go to this address:

   <http://127.0.0.1:43681>

The dashboard shows all sessions that the hub finds.

You can also push the INFO key to open the dashboard. Refer to [8.2](#82-add-a-key-that-opens-the-dashboard).

### 6.3 Stop AI AI Captain

1. Click the Stream Deck icon in the menu bar at the top of the screen.
2. Click **Quit**.

The plugin and the hub stop. The dashboard is not available until you start the Stream Deck app again.

### 6.4 Start the hub manually (optional)

Do this procedure only if one of these conditions is true:

- You use AI AI Captain without a Stream Deck.
- You must change a setting of the hub. Refer to [8.3](#83-change-the-settings-of-the-hub).

1. Quit the Stream Deck app. Refer to [6.3](#63-stop-ai-ai-captain).
2. Open the Terminal.
3. Type these commands:

   ```sh
   cd ~/ai-ai-captain
   npm start
   ```

4. Keep the Terminal window open.
5. Open the Stream Deck app.

The plugin finds the hub that runs in the Terminal and uses it. The plugin does not start a second hub.

CAUTION: IF YOU CLOSE THE TERMINAL WINDOW, THE HUB STOPS. THE STREAM DECK PLUGIN THEN STARTS ITS OWN HUB WITH THE DEFAULT SETTINGS.

To stop the manual hub:

1. Click the Terminal window that runs the hub.
2. Push **Control** and **C** at the same time.

---

## 7. Use the dashboard and the keys

### 7.1 Key colors and labels

Each key shows one session. The color and the label show the status.

| Color             | Label    | Meaning                                                    | What to do                                       |
| ----------------- | -------- | ---------------------------------------------------------- | ------------------------------------------------ |
| Green             | WORKING  | The AI is working.                                         | Wait.                                            |
| Amber, slow blink | WAITING  | The AI needs your answer or your permission.               | Go to the session and answer.                    |
| Blue, flashes     | DONE     | The AI finished its work.                                  | Look at the result.                              |
| Dark blue         | DONE     | The AI finished more than 10 minutes ago.                  | Look at the result when you have time.           |
| Purple            | STARTING | The session starts.                                        | Wait.                                            |
| Red               | FAILED   | The session has an error.                                  | Go to the session and look at the error.         |
| Gray              | UNK      | AI AI Captain does not know the status, or the hub does not run. | Read [10. Troubleshooting](#10-troubleshooting). |

The large symbol on the key shows the type of assistant. A small badge shows the application. `>_` is a terminal. `IJ` is IntelliJ IDEA.

### 7.2 Go to a session

1. Push the key of the session.

The Mac shows the application of the session. For IntelliJ IDEA, it shows the correct project window.

### 7.3 Find the details of a session

1. Look at the number on the key.
2. Find the same number on the dashboard.

The dashboard shows the name, the project, the model, and the application.

To see why a session has its status:

1. On the dashboard, find the session.
2. Click **State details & evidence**.

### 7.4 See more than 30 sessions

1. Push key 32 to see the next page.
2. Push key 31 to see the previous page.

### 7.5 When a key goes away

- When you close a session, its key goes away after 10 seconds.
- When you close a terminal or an IntelliJ IDEA project, its keys go away after approximately 2 seconds.
- The other keys do not move.

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
2. In the action list on the right side, find **AI AI Captain**.
3. Find **Open AI AI Captain Dashboard**.
4. Drag it onto a key of your choice.

   You can put it on an **AI Session** key. You can also put it on a different page.

The INFO key stays at its position. Session keys do not use this position.

On macOS, INFO first tries to select the existing dashboard tab in your default browser.
If this fails, INFO opens the dashboard through the default browser. This fallback can create a new tab.
INFO shows an exclamation mark only if the fallback also fails.

For Zen or Firefox tab reuse, enable Accessibility access for the application that runs the hub.
Use **System Settings → Privacy & Security → Accessibility**. Then restart the hub.
Zen must expose the dashboard tab in a browser window. Tabs hidden in inactive workspaces can cause a new tab to open.

### 8.3 Change the settings of the hub

You can change some settings only when you start the hub manually. Refer to [6.4](#64-start-the-hub-manually-optional). Put the setting before `npm start` on the same line.

Example:

```sh
AI_AI_CAPTAIN_PRECISE_FOCUS=1 npm start
```

You must type the setting each time you start the hub. The hub that the Stream Deck plugin starts always uses the default values.

| Setting                       | Default value                           | Function                                                                    |
| ----------------------------- | --------------------------------------- | --------------------------------------------------------------------------- |
| `AI_AI_CAPTAIN_PORT`                | `43681`                                 | The network port of the hub.                                                |
| `AI_AI_CAPTAIN_DATA_DIR`            | `~/Library/Application Support/ai-ai-captain` | The folder where AI AI Captain keeps its data.                                    |
| `AI_AI_CAPTAIN_PRECISE_FOCUS`       | Off                                     | Set to `1` to go to the exact application window when you push a key.       |
| `AI_AI_CAPTAIN_COPILOT_HOME`        | `~/.copilot`                            | The Copilot data folder. Change it only if Copilot uses a different folder. |
| `AI_AI_CAPTAIN_CODEX_HOME`          | `~/.codex`                              | The Codex data folder. Change it only if Codex uses a different folder.     |
| `AI_AI_CAPTAIN_JETBRAINS_INSTANCES` | `~/.junie/instances`                    | The folder where IntelliJ IDEA records its open projects.                   |
| `AI_AI_CAPTAIN_JUNIE_HOME`          | `~/.junie/sessions`                     | The Junie session folder. Change it only if Junie uses a different folder.  |

CAUTION: DO NOT CHANGE `AI_AI_CAPTAIN_PORT` IF YOU USE A STREAM DECK. THE PLUGIN USES THE DEFAULT PORT. IF YOU CHANGE THE PORT, THE PLUGIN STARTS A SECOND HUB ON THE DEFAULT PORT.

NOTE: If you change `AI_AI_CAPTAIN_PORT`, the dashboard address also changes. Example: for port `44000`, use <http://127.0.0.1:44000>.

### 8.4 Give Accessibility permission

If you use `AI_AI_CAPTAIN_PRECISE_FOCUS=1`, macOS can ask for Accessibility permission.

1. When macOS shows the request, click **Open System Settings**.
2. Find **Terminal** in the list.
3. Set the switch to on.
4. Stop the hub and start it again.

NOTE: IntelliJ IDEA project windows work without this permission.

### 8.5 Other AI assistants

#### Claude Code and desktop chat

Claude Code CLI and IntelliJ sessions appear automatically when the runtime writes supported live registrations.
Local Code runtimes hosted by the Claude desktop app use the same adapter.
The root is `AI_AI_CAPTAIN_CLAUDE_HOME`, then `CLAUDE_CONFIG_DIR`, then `~/.claude`. No hook or bridge installation is required.

Junie sessions in IntelliJ IDEA appear automatically when their project is open.
The hub reads `~/.junie/sessions`. Set `AI_AI_CAPTAIN_JUNIE_HOME` to use a different folder.
The key shows the JetBrains AI mark. The hub shows WORKING, DONE, or FAILED. It does not show WAITING for Junie.

The Claude mark identifies the harness. Its badge identifies the terminal, IntelliJ, or desktop app.
A runtime that omits approval status cannot show that pause. Missing model metadata stays **Not observed**.

Regular desktop chat support is experimental:

1. Open **System Settings → Privacy & Security → Accessibility**.
2. Enable the application that runs the hub.
3. Restart the hub.
4. Expose an existing chat in the Claude desktop app.
5. Check the dashboard for the session and its state details.

The app must expose the conversation URL and supported English controls. Hidden chats and remote Code runtimes are not tracked.
Unsupported controls show UNK. If no conversation ID is exposed, Claude remains under **Other detected apps** with an explanation.

A chat key requests that conversation through its Claude deep link. It does not mark DONE as assessed.
AI AI Captain does not read composer values or message text. It does not retain conversation content or change Claude settings.

Other unsupported harnesses still need a lifecycle reporter. See [integration instructions](integrations/README.md).

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

   The last command restarts the plugin. The plugin then starts the new hub.

5. If the dashboard is open in your browser, reload the page.

Your palette, your INFO key, and your sessions stay the same.

---

## 10. Troubleshooting

| Problem                                                                   | Possible cause                                                                        | Action                                                                                                                        |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| The Terminal shows `command not found: node` or `command not found: npm`. | Node.js is not installed.                                                             | Do the procedure in [3.2](#32-install-nodejs). Then close the Terminal and open it again.                                     |
| The Terminal shows `command not found: streamdeck`.                       | The Stream Deck command tool is not installed.                                        | Do the procedure in [5.1](#51-install-the-stream-deck-command-tool).                                                          |
| `npm install` or `npm run build` shows `error`.                           | The Node.js version is too old, or there is no internet connection.                   | Make sure that `node --version` shows `v24` or higher. Make sure that the internet connection operates. Do the command again. |
| All keys show a gray question mark (**UNK**).                             | The hub starts or restarts. Or the hub cannot start.                                  | Wait 30 seconds. If the problem continues, type `npm run reload:streamdeck` in the `ai-ai-captain` folder.                          |
| One key shows **UNK**.                                                    | AI AI Captain cannot read the status of this session.                                       | On the dashboard, open **State details & evidence** for this session. Read the explanation.                                   |
| The keys show a star only.                                                | The plugin did not start correctly.                                                   | Type `npm run reload:streamdeck` in the `ai-ai-captain` folder.                                                                     |
| The dashboard does not open in the browser.                               | The Stream Deck app is not open, or the address is not correct.                       | Open the Stream Deck app. Make sure that the address is <http://127.0.0.1:43681>.                                             |
| The Terminal shows `EADDRINUSE`.                                          | A hub runs already. The Stream Deck plugin or a different Terminal window started it. | Quit the Stream Deck app before you start the hub manually. Refer to [6.4](#64-start-the-hub-manually-optional).              |
| A session does not show on the keys.                                      | AI AI Captain cannot find this type of session automatically.                               | Look at the section **Other detected apps** on the dashboard. Refer to [8.5](#85-other-ai-assistants).                        |
| A key shows an alert when you push it.                                    | AI AI Captain cannot go to the project. The project folder is possibly moved or deleted.    | Open the session manually.                                                                                                    |
| A key shows an alert, and the session does not exist any more.            | The session is stale. The hub cannot go to it.                                              | Push the key again within 10 seconds. The hub removes the stale session.                                                      |
| The plugin stopped after you moved the `ai-ai-captain` folder.                  | The link to the plugin is broken.                                                     | Move the folder back. Or do the procedure in [5.2](#52-connect-the-plugin-to-the-stream-deck-app) again from the new folder.  |

If `npm run reload:streamdeck` reports `Stream Deck CLI not found`, type `npm install -g @elgato/cli`. Run `npm run reload:streamdeck` again.

If the CLI reports `Plugin not found: com.local.ai-ai-captain`, run `npm run reload:streamdeck`. The command rebuilds the plugin, links it, and restarts it.

If the problem continues, send this information to your technical contact:

- The file `~/Library/Logs/ElgatoStreamDeck/StreamDeck.log`.
- The files in the folder `~/ai-ai-captain/streamdeck/com.local.ai-ai-captain.sdPlugin/logs`. These files contain the messages of the plugin and the hub.
- If you started the hub manually, the text in its Terminal window.
