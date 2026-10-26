# IntelliJ bridge

Copilot CLI and Copilot runtime sessions inside IntelliJ are tracked automatically by the hub from Copilot's local session events on macOS. Codex sessions inside JetBrains AI Assistant are also tracked from live Codex ownership and local rollout events, with a separate Codex icon and IntelliJ badge. You do not need this bridge for these sessions. Each supported conversation gets its own key: green running during work, amber waiting only for requested input/permission, and blue done when work finishes. Codex sessions without readable rollout telemetry show unknown rather than guessed activity.

For IDEA versions exposing JetBrains AI Assistant's project registry (`~/.junie/instances`), the hub also removes automatically tracked sessions when their project closes, even if the shared AI runtime stays alive. Reopening the project alone does not restore old session keys; a new session/turn trigger is required. This is hub-side and does not require installing or updating this bridge. See the main README's **Closed terminals and IntelliJ projects** section for evidence and fallback behavior.

This Kotlin IntelliJ Platform plugin is a manual fallback for other IDE workflows. It maintains one manually reported session per project. Use **Tools → AI AI Captain → Start or Update Session** when a task starts, then mark it waiting or end it from the same menu. It reports the project and selected label/model but does not read IDE chat history or prompts. It does not automatically observe JetBrains AI conversations or their lifecycle.

The hub uses the bridge's existing project path to select the matching IntelliJ project window when its key is pressed. No bridge reinstall is needed for project focus; update the hub and reload the Stream Deck plugin. The bridge reports the application name rather than an exact installation, so macOS resolves the installed IDEA version. Selecting an individual conversation tab remains unsupported.

Build with Gradle 8.13+ and JDK 21 using `gradle buildPlugin`. Set `AI_AI_CAPTAIN_IDEA_HOME` to a local IntelliJ installation to build against it without downloading another IDE; otherwise the build resolves IntelliJ IDEA Community 2025.1. Set `AI_AI_CAPTAIN_URL` before launching IntelliJ only when using a non-default hub URL.

## Install

1. Start the hub from the repository root with `npm run dev`.
2. In IntelliJ IDEA, open **Settings → Plugins**, open the gear menu, and choose **Install Plugin from Disk…**
3. Select `intellij-bridge/build/distributions/ai-ai-captain-intellij-bridge-0.1.0.zip`.
4. Restart IntelliJ when prompted.
5. To report a session, choose **Tools → AI AI Captain → AI AI Captain: Start or Update Session**. Enter a label and, optionally, the model. Use **AI AI Captain: Mark Session Waiting** and **AI AI Captain: End Session** from the same menu as the task changes or ends.

If the ZIP is missing, run `gradle buildPlugin` from `intellij-bridge/`; the ZIP is written to `build/distributions/`. This bridge is manual: it does not automatically discover JetBrains AI or Copilot conversations.
