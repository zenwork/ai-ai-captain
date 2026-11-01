# AI AI Captain – User Guide

This guide is for users of the AI AI Captain Stream Deck plugin. It tells you how to install, start, use, and configure the plugin.

To build AI AI Captain from the GitHub project, use the [Developer Guide](DEVELOPER_GUIDE.md).

## Contents

1. [About AI AI Captain](#1-about-ai-ai-captain)
2. [What you must have](#2-what-you-must-have)
3. [Install the plugin](#3-install-the-plugin)
4. [Start and stop AI AI Captain](#4-start-and-stop-ai-ai-captain)
5. [Use the keys and the dashboard](#5-use-the-keys-and-the-dashboard)
6. [Configure AI AI Captain](#6-configure-ai-ai-captain)
7. [Install a new version](#7-install-a-new-version)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. About AI AI Captain

AI AI Captain shows the status of your AI assistant sessions. It shows the status on a Stream Deck XL and in a web browser.

AI AI Captain has three parts:

| Part               | Function                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Hub                | A program that runs on your computer. It finds the AI sessions and records their status. The Stream Deck plugin starts it. |
| Dashboard          | A web page. It shows all sessions with their full names and details.                                                       |
| Stream Deck plugin | It shows one session on each key of the Stream Deck XL.                                                                    |

AI AI Captain finds these sessions automatically:

- GitHub Copilot CLI and GitHub Copilot in IntelliJ IDEA.
- Codex CLI, Codex in the ChatGPT desktop app, and Codex in JetBrains AI Assistant.
- Claude Code in the terminal, in IntelliJ IDEA, and in the Claude desktop app.
- Junie in IntelliJ IDEA.
- Claude desktop chats (experimental). Refer to [6.5](#65-ai-assistants).

AI AI Captain shows an APP key for an app that it finds but cannot track. Examples are plain ChatGPT chats and Microsoft Copilot.

AI AI Captain keeps all data on your computer. It does not keep your prompts or your conversations.

---

## 2. What you must have

| Item                   | Requirement                                     |
| ---------------------- | ----------------------------------------------- |
| Computer               | macOS 13 or later, or Windows 10 or later       |
| Elgato Stream Deck app | Version 7.1 or later                            |
| Stream Deck            | Stream Deck XL (32 keys), connected with USB    |
| Web browser            | A current version of Safari, Chrome, or Firefox |

You do not have to install Node.js. The Stream Deck app runs the plugin and the hub.

NOTE: The Stream Deck app does not run on Linux. On Linux, use the hub and the dashboard from the GitHub project. Refer to the [Developer Guide](DEVELOPER_GUIDE.md).

These functions work on macOS only:

- Claude desktop chats.
- Use of the dashboard tab again when you push the INFO key.
- Focus on the correct IntelliJ IDEA project window.

On Windows, Codex and Copilot sessions use lock files only, because Windows cannot list open files.

---

## 3. Install the plugin

### 3.1 Install the plugin file

1. Install the Stream Deck app from <https://www.elgato.com/downloads>.
2. Connect the Stream Deck XL to the computer.
3. Open the Stream Deck app. Make sure that it shows your Stream Deck XL.
4. Get the plugin file `com.local.ai-ai-captain.streamDeckPlugin`. Use one of these sources:
   - The Elgato Marketplace.
   - The release page of the GitHub project: <https://github.com/zenwork/ai-ai-captain/releases>.
5. Double-click the plugin file.
6. In the Stream Deck app, confirm the installation.

### 3.2 Select the AI AI Captain profile

The plugin installs the profile **AI AI Captain XL**.

1. In the Stream Deck app, find the profile list at the top of the window.
2. Select the profile **AI AI Captain XL**.

The Stream Deck XL has this layout:

| Keys    | Function                                                        |
| ------- | --------------------------------------------------------------- |
| 1 to 30 | One AI session on each key. APP keys follow after the sessions. |
| 31      | Previous page                                                   |
| 32      | Next page                                                       |

---

## 4. Start and stop AI AI Captain

### 4.1 Start AI AI Captain

The plugin starts the hub automatically. You do not start the hub yourself.

1. Open the Stream Deck app.
2. Wait approximately 5 seconds.

The keys show your AI sessions. AI AI Captain runs while the Stream Deck app runs.

NOTE: If the hub stops because of an error, the plugin starts it again. During this time, the keys show a gray question mark (**UNK**).

To start AI AI Captain when you log in, set the Stream Deck app to start at login:

- On macOS, make sure that **Elgato Stream Deck** is in **System Settings → General → Login Items**.
- On Windows, turn on the start-at-login option in the preferences of the Stream Deck app.

### 4.2 Open the dashboard

1. Open your web browser.
2. Go to <http://127.0.0.1:43681>.

You can also push the INFO key. Refer to [6.2](#62-add-a-key-that-opens-the-dashboard).

### 4.3 Use the virtual deck

The hub shows a virtual Stream Deck XL at <http://127.0.0.1:43681/deck.html>. It has the same keys and key numbers as the Stream Deck.

- The grid becomes larger when you have more sessions. The maximum is 8 columns by 4 rows.
- Push a key to go to its session or app.
- When the keys do not fit, use the PREV and NEXT keys to change the page.
- To change the key size, push the **−**, **Auto**, or **+** button under the deck.
- To show all keys in one row, push **Single row**.

The page saves these settings in the browser.

To keep the deck above other windows, do these steps:

1. Open the virtual deck in a browser that supports Document Picture-in-Picture.
2. Click **Keep on top**.
3. Keep the original page open.

The floating window keeps the deck controls and the live updates. To return the deck to the original page, click **Return to deck** or close the floating window.

If the browser does not support this function, the button is disabled. The page then shows an explanation.

To install the virtual deck as an app, do these steps:

1. Open the address in Chrome or Edge.
2. Click the install icon in the address bar, or select **Install AI AI Captain Deck**.

NOTE: The virtual deck works only while the Stream Deck app runs.

### 4.4 Stop AI AI Captain

1. Click the Stream Deck icon in the menu bar (macOS) or in the system tray (Windows).
2. Click **Quit**.

The plugin and the hub stop. The dashboard is not available until you start the Stream Deck app again.

---

## 5. Use the keys and the dashboard

### 5.1 Key colors and labels

Each key shows one session. The color and the label show the status.

| Color             | Label    | Meaning                                                 | What to do                                     |
| ----------------- | -------- | ------------------------------------------------------- | ---------------------------------------------- |
| Green             | WORKING  | The AI is working.                                      | Wait.                                          |
| Amber, slow blink | WAITING  | The AI needs your answer or your permission.            | Go to the session and answer.                  |
| Blue, flashes     | DONE     | The AI finished its work.                               | Look at the result.                            |
| Dark blue         | DONE     | The AI finished more than 10 minutes ago.               | Look at the result when you have time.         |
| Purple            | STARTING | The session starts.                                     | Wait.                                          |
| Red               | FAILED   | The session has an error.                               | Go to the session and look at the error.       |
| Gray              | UNK      | The status is not known, or the hub does not run.       | Read [8. Troubleshooting](#8-troubleshooting). |
| Not applicable    | APP      | AI AI Captain finds the app but cannot track its chats. | Push the key to open the app.                  |

The large symbol on the key shows the type of assistant. A small badge shows the host. `>_` is a terminal. `IJ` is IntelliJ IDEA. An app window is a desktop app.

### 5.2 Go to a session

Push the key of the session. The computer shows the application of the session. On macOS, IntelliJ IDEA shows the correct project window.

### 5.3 Find the details of a session

1. Look at the number on the key.
2. Find the same number on the dashboard.
3. To see why a session has its status, click **State details & evidence**.

### 5.4 See more than 30 sessions

Push key 32 to see the next page. Push key 31 to see the previous page.

### 5.5 When a key goes away

- When you close a session, its key goes away after 10 seconds.
- When you close a terminal or an IntelliJ IDEA project, its keys go away after approximately 2 seconds.
- The other keys do not move.

### 5.6 Remove a stale key

A stale key shows an alert when you push it. The session does not exist any more.

1. Push the key. The key shows the alert.
2. Push the key again within 10 seconds.

The hub removes the session. An automatic adapter can show the session again if its source files change.

### 7.7 Hide a session

You can hide a DONE, FAILED, or UNK session that you do not need now. This works for all session types.

1. Push the key of the session two times quickly, within 0.4 seconds.

The key goes away, and the other keys move up. The session comes back when its status changes, for example when it starts new work. The dashboard virtual deck also hides it.

You cannot hide a STARTING, WORKING, or WAITING session. A single push on a DONE, FAILED, or UNK key waits 0.4 seconds before it shows the application, so the plugin can see a second push. Keys in other states respond at once.

### 7.7 Show all key variations (demo)

Use the demo to test the keys. It shows 24 keys: each of the 12 key types two times. The states change every 4 seconds.

1. Make sure that the hub runs.
2. Type `npm run demo:keys`.
3. Look at keys 1 to 24 on the Stream Deck.
4. To stop the demo, push Ctrl+C. The demo removes every demo key, including leftover keys from the brightness demo.

To change the time between steps, type `npm run demo:keys -- --interval 8`. The unit is seconds.

To compare flash intensity, type `npm run demo:keys -- --brightness`. Keys 1 to 5 show WAITING. Keys 6 to 10 show DONE. Intensity 0 to 4 goes from left to right. Higher levels make bright phases brighter and dim phases darker. The Terminal names each key. Push Ctrl+C to remove every demo key, including leftover keys from the 24-key demo. This demo does not change the saved hub setting.

Use **Flash intensity** in the dashboard to change the saved setting. You do not need to rebuild or reload the Stream Deck plugin.

NOTE: The demo cannot show the aged and assessed DONE keys. These keys need real session age. The demo keys go before other session keys on the first page.

---

## 6. Configure AI AI Captain

### 6.1 Change the appearance of the keys

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

4. Find **Flash intensity** near the top of the page.
5. Select a level:

   | Level | Meaning                |
   | ----- | ---------------------- |
   | 0     | Palette colors         |
   | 1     | Increased contrast     |
   | 2     | Default stronger flash |
   | 3     | High contrast          |
   | 4     | Full color range       |

The dashboard preview changes immediately. The Stream Deck keys change in approximately two seconds. AI AI Captain keeps both settings after a restart.

NOTE: Use **Signal** or **Porcelain** if it is difficult for you to see the colors.

### 6.2 Add a key that opens the dashboard

You can add a purple **INFO** key. This key opens the dashboard in your browser.

1. Open the Stream Deck app.
2. In the action list, find **AI AI Captain**, then **Open AI AI Captain Dashboard**.
3. Drag the action onto a key.

The INFO key stays at its position. Session keys do not use this position.

On macOS, the INFO key first tries to select the dashboard tab that is open in your default browser. If this fails, the INFO key opens the dashboard through the default browser. This can open a new tab. The INFO key shows an exclamation mark only if both methods fail.

For tab selection in Zen or Firefox, give Accessibility permission to the Stream Deck app. Refer to [6.4](#64-give-accessibility-permission-macos). Zen must show the dashboard tab in a browser window. A tab in an inactive workspace can cause a new tab to open.

### 6.3 Add keys that change the settings

You can add three setting keys to the Stream Deck. The virtual deck does not show these keys.

1. Open the Stream Deck app.
2. In the action list, find **AI AI Captain**.
3. Drag **Toggle Info Keys**, **Cycle Theme**, or **Cycle Brightness** onto a key.

### 8.2.2 Add subscription budget keys

A budget key shows how much of an AI subscription you used and when the limit resets.

1. Open the Stream Deck app.
2. In the action list, find **AI AI Captain**.
3. Drag **AI Budget: Claude**, **AI Budget: OpenAI**, **AI Budget: GitHub Copilot**, or **AI Budget: JetBrains AI** onto a key.

Push a budget key to open the usage page of the provider.

#### Where each key gets its values

| Key            | Source                                              | When the key updates                                     |
|----------------|-----------------------------------------------------|----------------------------------------------------------|
| OpenAI         | Codex log files on this computer. Automatic         | After Codex runs on this computer. The hub reads every 30 seconds |
| Claude         | Claude Code status line                             | After each Claude Code response                          |
| Claude         | Usage page of the Claude desktop app (macOS)        | Every 1.5 seconds, but only while the page is open       |
| GitHub Copilot | `report budget` command or the API                  | When you report values                                   |
| JetBrains AI   | `report budget` command or the API                  | When you report values                                   |

A key without values shows dashed bars and "?".

#### Set up the Claude key

1. Add this line to `~/.claude/settings.json`. Use the path of your copy of the project and the name of your plan:

   ```json
   "statusLine": { "type": "command", "command": "node /path/to/ai-ai-captain/integrations/claude-statusline.mjs --plan max" }
   ```

2. Start Claude Code and send a prompt. The status line shows the model, the context use, and the two limits.

If you use only the Claude desktop app, open **Settings → Usage** in the app from time to time. While the page is open, the hub reads the two limits from it. This needs Accessibility access, as for the Claude desktop sessions.

#### Report values

For keys without an automatic source, report the values that the usage page of the provider shows. For example:

```sh
npm run report -- budget jetbrains --plan "ai pro" --credits-used 6.1 --credits-total 20 --monthly-reset 22d
npm run report -- budget copilot --plan pro --credits-used 420 --credits-total 1500 --monthly-reset 19d
```

The hub keeps reported values in `budgets.json` in its data folder, so they stay after a restart. Refer to `INT-12` in [intagration.md](intagration.md) for all options.

#### Limits

A budget key shows the last value that a source gave. It is not a live view of your account.

- **OpenAI.** The key reads only Codex on this computer. It does not see use in ChatGPT, in Codex on other computers, or in the cloud until Codex runs again on this computer.
- **Claude status line.** It works only in Claude Code in a terminal, with a Claude Pro or Max plan. With an API key, Claude Code gives no limits. Claude Code gives the limits only after the first response of a session. The Claude desktop app, Cowork tasks, and claude.ai chats do not run the status line.
- **Claude Usage page.** The app shows the page only while it is open, so the hub can read it only then. When you close the page, the key keeps the last values. The page must be in English. The page does not show the plan: the key uses the plan from `--plan` of the status line.
- **Shared Claude limits.** Claude Code, the desktop app, Cowork, and claude.ai use the same limits. Use in one place shows on the key only after the status line or the Usage page gives new values.
- **GitHub Copilot and JetBrains AI.** There is no automatic source. Automatic values would need the login token of your account, and AI AI Captain does not use account tokens. IntelliJ IDEA does not keep the current JetBrains AI credits in a file.
- **After a reset.** When the reset time of a window passes, the key shows that window at 0% until the source gives new values.
- **Status line setting.** The AI AI Captain status line replaces a status line that you set before in `~/.claude/settings.json`.

### 8.2.3 Make the plugin file for the Elgato Marketplace

The dashboard shows the same settings.

### 6.4 Give Accessibility permission (macOS)

These functions need Accessibility permission on macOS:

- Tab selection in Zen or Firefox.
- Claude desktop chats.

1. Open **System Settings → Privacy & Security → Accessibility**.
2. Turn on the Stream Deck app.
3. Quit the Stream Deck app and open it again.

NOTE: IntelliJ IDEA project windows work without this permission.

### 6.5 AI assistants

Most assistants need no setup. Copilot, Codex, Claude Code, and Junie sessions show automatically when the assistant runs.

#### Junie

Junie sessions show when their project is open in IntelliJ IDEA. The key shows the JetBrains AI mark. The key shows WORKING, DONE, or FAILED. It does not show WAITING.

#### Claude Code and Claude desktop chats

The Claude mark identifies the assistant. The badge identifies the terminal, IntelliJ IDEA, or the desktop app. If the runtime does not report approval status, the key cannot show WAITING.

Claude desktop chat support is experimental. To use it, do these steps:

1. Give Accessibility permission to the Stream Deck app. Refer to [6.4](#64-give-accessibility-permission-macos).
2. Open a chat, Claude Code task, or Cowork task in the Claude desktop app.
3. On the dashboard, look for the session and its state details.

The app must show the conversation URL or task URL and English controls. Each chat or task in the sidebar list that is running, waiting, or done also gets a key. Idle items, a hidden sidebar, and items outside the visible list are not tracked. If no conversation ID is available, Claude stays under **Other detected apps** on the dashboard and shows an APP key.

A chat key opens its conversation through the Claude link. A task key opens that task in the sidebar and brings the Claude app to the front. If the task is not visible in the sidebar, the key only brings the app to the front. Keys show a short code, not the chat or task title. AI AI Captain does not read message text or change Claude settings.

#### Other assistants

An assistant that is not in this list needs a reporter. A reporter needs the GitHub project. Refer to the [Developer Guide](DEVELOPER_GUIDE.md).

---

## 7. Install a new version

1. Get the new plugin file. Refer to [3.1](#31-install-the-plugin-file).
2. Double-click the plugin file.
3. In the Stream Deck app, confirm the update.
4. If the dashboard is open in your browser, reload the page.

Your palette, your INFO key, and your sessions stay the same.

---

## 8. Troubleshooting

| Problem                                              | Possible cause                                                                                    | Action                                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| All keys show **UNK**.                               | The hub starts or restarts. Or the hub cannot start.                                              | Wait 30 seconds. If the problem continues, quit the Stream Deck app and open it again.  |
| One key shows **UNK**.                               | AI AI Captain cannot read the status of this session.                                             | On the dashboard, open **State details & evidence** for this session.                   |
| The keys show a star only.                           | The plugin did not start correctly.                                                               | Quit the Stream Deck app and open it again. If the problem continues, install it again. |
| The profile **AI AI Captain XL** is not in the list. | The plugin is not installed, or the Stream Deck is not an XL.                                     | Do [3.1](#31-install-the-plugin-file) again. Make sure that you use a Stream Deck XL.   |
| The dashboard does not open.                         | The Stream Deck app is not open, or the address is wrong.                                         | Open the Stream Deck app. Use <http://127.0.0.1:43681>.                                 |
| An APP key shows instead of a session.               | AI AI Captain cannot track the chats of this app.                                                 | Push the key to open the app.                                                           |
| A budget key shows dashed bars and "?".                         | The key has no source, or its source gave no values yet.                                          | Refer to 8.2.2. For OpenAI, run Codex once. For Claude, send a prompt in Claude Code, or open Settings → Usage in the app. |
| A budget key shows old values.                                  | The key shows the last values of its source.                                                      | Run the source again, or open the Usage page. Refer to the limits in 8.2.2.                                      |
| A session does not show on the keys.                 | AI AI Captain cannot find this type of session.                                                   | Look at **Other detected apps** on the dashboard. Refer to [6.5](#65-ai-assistants).    |
| A key shows an alert when you push it.               | AI AI Captain cannot go to the session. The project is moved or deleted, or the session is stale. | Open the session manually. For a stale session, refer to [5.6](#56-remove-a-stale-key). |

If the problem continues, open an issue on <https://github.com/zenwork/ai-ai-captain/issues>. Attach the log files of the Stream Deck app:

| System  | Log folder                          |
| ------- | ----------------------------------- |
| macOS   | `~/Library/Logs/ElgatoStreamDeck/`  |
| Windows | `%APPDATA%\Elgato\StreamDeck\logs\` |

The plugin logs also contain the messages of the hub. Find them in the `logs` folder of the plugin, in the plugin folder of the Stream Deck app.

CAUTION: READ THE LOG FILES BEFORE YOU SEND THEM. REMOVE ALL PRIVATE DATA.
