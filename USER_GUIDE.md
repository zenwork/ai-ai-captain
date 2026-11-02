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
8. [Known limitations](#8-known-limitations)
9. [Troubleshooting](#9-troubleshooting)

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
- Claude desktop chats (experimental). Refer to [6.6](#66-ai-assistants).

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

On Windows, Codex and GitHub Copilot sessions do not show. Refer to [8.3](#83-windows).

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
| Darkest blue, ✓✓  | DONE     | You pushed the key after the AI finished.               | Nothing. You saw this result.                  |
| Purple            | STARTING | The session starts.                                     | Wait.                                          |
| Red               | FAILED   | The session has an error.                               | Go to the session and look at the error.       |
| Gray              | UNK      | The status is not known, or the hub does not run.       | Read [9. Troubleshooting](#9-troubleshooting). |
| Not applicable    | APP      | AI AI Captain finds the app but cannot track its chats. | Push the key to open the app.                  |

The large symbol on the key shows the type of assistant. A small badge shows the host. A green `>_` is a terminal. A pink `IJ` is IntelliJ IDEA. A blue app window is a desktop app.

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

### 5.7 Mark a result as seen

When a DONE key flashes, push it one time. The application of the session opens. The key also stops flashing and changes to the darkest blue with a double check (✓✓). This shows that you saw the result. This works for all session types.

The key stays like this until the status of the session changes, for example when the session starts new work. The next DONE flashes again. The dashboard shows the same color.

### 5.8 Hide a session

You can hide a DONE, FAILED, or UNK session that you do not need now. This works for all session types.

1. Push the key of the session two times quickly, within 0.4 seconds.

The key goes away, and the other keys move up. The session comes back when its status changes, for example when it starts new work. The dashboard virtual deck also hides it.

You cannot hide a STARTING, WORKING, or WAITING session. A single push on a DONE, FAILED, or UNK key waits 0.4 seconds before it shows the application, so the plugin can see a second push. Keys in other states respond at once. Refer to [8.1](#81-all-operating-systems).

To show all key variations on your Stream Deck, use the key demo. Refer to the [Developer Guide](DEVELOPER_GUIDE.md).

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

For tab selection in Zen or Firefox, give Accessibility permission to the Stream Deck app. Refer to [6.5](#65-give-accessibility-permission-macos). Zen must show the dashboard tab in a browser window. A tab in an inactive workspace can cause a new tab to open.

### 6.3 Add keys that change the settings

You can add three setting keys to the Stream Deck. The virtual deck does not show these keys.

1. Open the Stream Deck app.
2. In the action list, find **AI AI Captain**.
3. Drag **Toggle Info Keys**, **Cycle Theme**, or **Cycle Brightness** onto a key.

Push **Toggle Info Keys** to turn the info keys on or off. Push **Cycle Theme** to select the next palette. Push **Cycle Brightness** to select the next flash intensity level. The dashboard shows the same settings.

### 6.4 Add subscription budget keys

A budget key shows how much of an AI subscription you used and when the limit resets.

1. Open the Stream Deck app.
2. In the action list, find **AI AI Captain**.
3. Drag **AI Budget: Claude**, **AI Budget: OpenAI**, **AI Budget: GitHub Copilot**, or **AI Budget: JetBrains AI** onto a key.

Push a budget key to open the usage page of the provider.

#### Where each key gets its values

| Key            | Source                                       | When the key updates                                              |
| -------------- | -------------------------------------------- | ----------------------------------------------------------------- |
| OpenAI         | Codex log files on this computer. Automatic  | After Codex runs on this computer. The hub reads every 30 seconds |
| Claude         | Claude Code status line                      | After each Claude Code response                                   |
| Claude         | Usage page of the Claude desktop app (macOS) | Every 1.5 seconds, but only while the page is open                |
| GitHub Copilot | `report budget` command or the API           | When you report values                                            |
| JetBrains AI   | `report budget` command or the API           | When you report values                                            |

A key without values shows dashed bars and "?".

#### Set up the Claude key

The Claude status line is a script in the GitHub project. To use it, you must have a copy of the project and Node.js 24 or later. Refer to the [Developer Guide](DEVELOPER_GUIDE.md).

1. Add this line to `~/.claude/settings.json`. Use the path of your copy of the project and the name of your plan:

   ```json
   "statusLine": { "type": "command", "command": "node /path/to/ai-ai-captain/integrations/claude-statusline.mjs --plan max" }
   ```

2. Start Claude Code and send a prompt. The status line shows the model, the context use, and the two limits.

If you use only the Claude desktop app, open **Settings → Usage** in the app from time to time. While the page is open, the hub reads the two limits from it. This needs Accessibility access, as for the Claude desktop sessions.

#### Report values

For keys without an automatic source, report the values that the usage page of the provider shows. The `report` command needs a copy of the GitHub project. For example:

```sh
npm run report -- budget jetbrains --plan "ai pro" --credits-used 6.1 --credits-total 20 --monthly-reset 22d
npm run report -- budget copilot --plan pro --credits-used 420 --credits-total 1500 --monthly-reset 19d
```

The hub keeps reported values in `budgets.json` in its data folder, so they stay after a restart. Refer to `INT-12` in [intagration.md](intagration.md) for all options.

A budget key shows the last values that a source gave. For the limits of each source, refer to [8. Known limitations](#8-known-limitations).

### 6.5 Give Accessibility permission (macOS)

These functions need Accessibility permission on macOS:

- Tab selection in Zen or Firefox.
- Claude desktop chats and tasks.
- Opening a Claude task from its key.
- The Claude limits from the Usage page of the Claude desktop app.

1. Open **System Settings → Privacy & Security → Accessibility**.
2. Turn on the Stream Deck app.
3. Quit the Stream Deck app and open it again.

NOTE: IntelliJ IDEA project windows work without this permission.

### 6.6 AI assistants

Most assistants need no setup. Copilot, Codex, Claude Code, and Junie sessions show automatically when the assistant runs.

#### Junie

Junie sessions show when their project is open in IntelliJ IDEA. The key shows the JetBrains AI mark. The key shows WORKING, DONE, or FAILED. It does not show WAITING.

#### Claude Code and Claude desktop chats

The Claude mark identifies the assistant. The badge identifies the terminal, IntelliJ IDEA, or the desktop app. If the runtime does not report approval status, the key cannot show WAITING.

Claude desktop chat support is experimental. To use it, do these steps:

1. Give Accessibility permission to the Stream Deck app. Refer to [6.5](#65-give-accessibility-permission-macos).
2. Open a chat, Claude Code task, or Cowork task in the Claude desktop app.
3. On the dashboard, look for the session and its state details.

The app must show the conversation URL or task URL and English controls. Each chat or task in the sidebar list that is running, waiting, or done also gets a key. Idle items, a hidden sidebar, and items outside the visible list are not tracked. If no conversation ID is available, Claude stays under **Other detected apps** on the dashboard and shows an APP key.

When an item goes out of the list, its key goes away after 15 seconds. The 15 seconds stop a key from going away while the app sorts its list again.

A DONE item flashes only when the hub sees it finish and the app shows it as unread. An item that you opened in the app, or that was DONE when the hub started, does not flash.

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

## 8. Known limitations

This section tells you what AI AI Captain cannot do, and where it can show old or incomplete information. Most limits come from the assistants: AI AI Captain can show only what an assistant writes on your computer or shows on the screen.

The limits are in groups by operating system. In each group, they are in groups by AI platform.

### 8.1 All operating systems

#### AI AI Captain

- A new version of an assistant can change the files that AI AI Captain reads. Then a key can show **UNK**, or a session can stop showing until AI AI Captain gets an update.
- A visit to a session in its application does not stop its DONE flash. Only a push on the DONE key stops it. The flash also stops after 10 minutes, or when new work starts.
- You cannot hide a STARTING, WORKING, or WAITING session.
- A single push on a DONE, FAILED, or UNK key waits 0.4 seconds before it shows the application.
- The session list of the dashboard still shows hidden sessions. In the virtual deck, you cannot hide a session.
- In terminals, a push on a session key does not select the terminal tab or the conversation.
- The default profile is for the Stream Deck XL only. On other models, you must put the actions on the keys yourself.
- A budget key shows the last values that a source gave. It is not a live view of your account.
- When the reset time of a budget window passes, the key shows 0% for that window. If you used the assistant somewhere that the key cannot see, the real use is higher.
- The Claude status line and the `report` command need a copy of the GitHub project. The Claude status line also needs Node.js 24 or later.

#### Anthropic Claude

- **Claude Code sessions.** A key can show WAITING only if Claude Code reports that it waits. Sessions on another computer or in the cloud do not show.
- **Info key.** Claude sessions show no freedom or approval. For Claude Code, the context use is for a window of 200,000 tokens. With a model that has a larger window, the bar shows too much use.
- **Budget key, status line.** It works only in Claude Code in a terminal, with a Claude Pro or Max plan. With an API key, Claude Code gives no limits. Before the first response of a session, there are no values.
- **Budget key, other Claude use.** The Claude desktop app, Cowork tasks, and claude.ai chats do not run the status line. Their use shows on the key only after the status line or the Usage page (macOS) gives new values.
- **Status line setting.** The AI AI Captain status line replaces a status line that you set before in `~/.claude/settings.json`.

#### OpenAI Codex and ChatGPT

- **Codex sessions.** Codex does not write every approval pause. A key can show WORKING while Codex waits for you. A Codex session without a log history shows **UNK**.
- **ChatGPT.** Plain ChatGPT chats are not tracked.
- **Budget key.** The key reads only Codex on this computer. It does not see use in ChatGPT, in Codex on other computers, or in the cloud until Codex runs again on this computer.

#### GitHub Copilot

- In IntelliJ IDEA, several conversations can use one Copilot runtime. Copilot agents that do not write the local event files do not show.
- Copilot sessions show no info key data, unless a reporter gives it.
- **Budget key.** There is no automatic source. You must report the values yourself. Automatic values would need the login token of your account, and AI AI Captain does not use account tokens.

#### JetBrains AI and Junie

- **Junie sessions.** The key never shows WAITING. A Junie session does not show when its project is closed in IntelliJ IDEA.
- **IntelliJ IDEA.** A push on a session key does not select the AI chat in the project window.
- **Budget key.** There is no automatic source. You must report the values yourself. IntelliJ IDEA does not keep the current JetBrains AI credits in a file, and AI AI Captain does not use account tokens.

#### Microsoft Copilot

- Plain Microsoft Copilot chats are not tracked.

#### Other assistants

- They do not show automatically. They need a reporter, and a reporter needs a copy of the GitHub project.

### 8.2 macOS

#### Anthropic Claude

- **Claude desktop app.** Support is experimental. It needs Accessibility permission. Refer to [6.5](#65-give-accessibility-permission-macos).
- The app must be in English.
- Only the items in the visible **Chats and tasks** list show. Items under **View all**, items that a filter hides, and **Idle** items do not show. If you hide the sidebar, the keys go away.
- When Claude gives a chat or a task a new title, the item gets a new key in a new position.
- Keys show a short code, not the title. You cannot see which chat or task a key is for until you push it.
- An update of the app can change its labels. Then items can show **UNK** or stop showing.
- The info key shows no tokens or context use. It shows the model only after you open the chat or task once.
- A task key moves the mouse pointer to the task for a moment. If the task is not visible in the sidebar, the key cannot open it.
- **Budget key, Usage page.** The hub reads the page only while it is open. The page must be in English. The page does not show the plan, so the key shows the plan from `--plan` of the status line, or "?".

#### OpenAI ChatGPT and Microsoft Copilot

- These desktop apps show an APP key only.

### 8.3 Windows

#### AI AI Captain

- A push on a session key only brings the application to the front. It does not select the window, the project, or the conversation.
- A push on the INFO key does not use the dashboard tab again. It can open a new tab.
- The action icons and the default key images in the Stream Deck app are not tested on Windows.

#### Anthropic Claude

- The hub does not find the Claude desktop app. Its chats and tasks get no key, not even an APP key.
- The Usage page of the Claude desktop app is not a source for the budget key. Only the Claude status line updates it.

#### OpenAI Codex and ChatGPT

- Codex sessions do not show. The hub finds Codex sessions from the files that Codex keeps open, and the hub cannot list open files on Windows.
- The ChatGPT app gets no key, not even an APP key.
- The budget key still reads the Codex log files.

#### GitHub Copilot

- Copilot sessions do not show, for the same reason as Codex sessions.

#### JetBrains AI and Junie

- Junie sessions do not show. The hub finds the IntelliJ IDEA of a Junie session by its macOS application path only.
- For other sessions in IntelliJ IDEA, a push on a session key does not open the project window. It brings IntelliJ IDEA to the front.

#### Microsoft Copilot

- The Microsoft Copilot app gets no key, not even an APP key.

### 8.4 Linux

#### AI AI Captain

- The Stream Deck app does not run on Linux. Use the dashboard and the virtual deck.
- A push on a session key needs `xdotool` and an X11 session. It only brings the application to the front.
- A push on the INFO key does not use the dashboard tab again.

#### Anthropic Claude, OpenAI ChatGPT, and Microsoft Copilot

- The hub does not find desktop apps. They get no key, not even an APP key.

#### JetBrains AI and Junie

- Junie sessions do not show. The hub finds the IntelliJ IDEA of a Junie session by its macOS application path only.
- For other sessions in IntelliJ IDEA, a push on a session key does not open the project window. It brings IntelliJ IDEA to the front.

---

## 9. Troubleshooting

| Problem                                              | Possible cause                                                                                    | Action                                                                                                                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| All keys show **UNK**.                               | The hub starts or restarts. Or the hub cannot start.                                              | Wait 30 seconds. If the problem continues, quit the Stream Deck app and open it again.                                                                       |
| One key shows **UNK**.                               | AI AI Captain cannot read the status of this session.                                             | On the dashboard, open **State details & evidence** for this session.                                                                                        |
| The keys show a star only.                           | The plugin did not start correctly.                                                               | Quit the Stream Deck app and open it again. If the problem continues, install it again.                                                                      |
| The profile **AI AI Captain XL** is not in the list. | The plugin is not installed, or the Stream Deck is not an XL.                                     | Do [3.1](#31-install-the-plugin-file) again. Make sure that you use a Stream Deck XL.                                                                        |
| The dashboard does not open.                         | The Stream Deck app is not open, or the address is wrong.                                         | Open the Stream Deck app. Use <http://127.0.0.1:43681>.                                                                                                      |
| An APP key shows instead of a session.               | AI AI Captain cannot track the chats of this app.                                                 | Push the key to open the app.                                                                                                                                |
| A budget key shows dashed bars and "?".              | The key has no source, or its source gave no values yet.                                          | Refer to [6.4](#64-add-subscription-budget-keys). For OpenAI, run Codex once. For Claude, send a prompt in Claude Code, or open Settings → Usage in the app. |
| A budget key shows old values.                       | The key shows the last values of its source.                                                      | Run the source again, or open the Usage page. Refer to [8. Known limitations](#8-known-limitations).                                                         |
| A session does not show on the keys.                 | AI AI Captain cannot find this type of session.                                                   | Look at **Other detected apps** on the dashboard. Refer to [6.6](#66-ai-assistants).                                                                         |
| A key shows an alert when you push it.               | AI AI Captain cannot go to the session. The project is moved or deleted, or the session is stale. | Open the session manually. For a stale session, refer to [5.6](#56-remove-a-stale-key).                                                                      |

If the problem continues, open an issue on <https://github.com/zenwork/ai-ai-captain/issues>. Attach the log files of the Stream Deck app:

| System  | Log folder                          |
| ------- | ----------------------------------- |
| macOS   | `~/Library/Logs/ElgatoStreamDeck/`  |
| Windows | `%APPDATA%\Elgato\StreamDeck\logs\` |

The plugin logs also contain the messages of the hub. Find them in the `logs` folder of the plugin, in the plugin folder of the Stream Deck app.

CAUTION: READ THE LOG FILES BEFORE YOU SEND THEM. REMOVE ALL PRIVATE DATA.
