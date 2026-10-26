import { homedir } from "node:os";
import { join } from "node:path";
import type { Client } from "../shared/session.js";
import { ClientRegistry } from "./clients.js";
import { CopilotTracker } from "./copilot.js";
import { CodexTracker } from "./codex.js";
import { JunieTracker } from "./junie.js";
import { ClaudeTracker } from "./claude.js";
import { ClaudeDesktopTracker } from "./claude-desktop.js";
import { HostLifetimes } from "./lifetimes.js";
import { listProcesses, type ProcessInfo } from "./processes.js";
import { SessionStore } from "./store.js";

const candidates = [
  { key: "chatgpt", name: "ChatGPT", appBundle: "ChatGPT.app", executable: "ChatGPT", bundleId: "com.openai.chat" },
  { key: "claude", name: "Claude", appBundle: "Claude.app", executable: "Claude", bundleId: "com.anthropic.claudefordesktop" },
  { key: "copilot", name: "Copilot", appBundle: "Copilot.app", executable: "Copilot", bundleId: "com.microsoft.copilot" },
];

export function matchesMainAppProcess(processName: string, appBundle: string, executable: string): boolean {
  const normalized = processName.toLowerCase();
  const executablePath = `/${appBundle}/Contents/MacOS/${executable}`.toLowerCase();
  return normalized.endsWith(executablePath) || normalized.includes(`${executablePath} `);
}

export async function discoverDesktopApps(registry: ClientRegistry, processes?: ProcessInfo[], claudeChatsAvailable = false, claudeStatus = "unavailable"): Promise<void> {
  if (process.platform !== "darwin") return;
  const inventory = processes ?? await listProcesses();
  const clients: Client[] = [];
  for (const candidate of candidates) {
    if (candidate.key === "claude" && claudeChatsAvailable) continue;
    const match = inventory.find((process) => matchesMainAppProcess(process.name, candidate.appBundle, candidate.executable));
    const id = `desktop:${candidate.key}`;
    if (!match) continue;
    clients.push({
      id,
      name: candidate.name,
      focusTarget: { pid: match.pid, bundleId: candidate.bundleId, appName: candidate.name },
      sessionTracking: "unavailable",
      ...(candidate.key === "claude" ? { trackingDetails: claudeStatus === "permission-denied"
        ? "Claude chat tracking needs Accessibility access for the application that runs the hub."
        : "No exposed Claude chat provides supported session metadata. Hidden chats and remote Code sessions are not tracked." } : {}),
    });
  }
  registry.replace(clients);
}

export function startSessionDiscovery(store: SessionStore, clients: ClientRegistry, dataDirectory?: string): ReturnType<typeof setInterval> | undefined {
  if (process.platform !== "darwin") return undefined;
  const copilot = new CopilotTracker(store, join(process.env.AI_AI_CAPTAIN_COPILOT_HOME ?? join(homedir(), ".copilot"), "session-state"));
  const codex = new CodexTracker(store, process.env.AI_AI_CAPTAIN_CODEX_HOME ?? process.env.CODEX_HOME ?? join(homedir(), ".codex"));
  const claude = new ClaudeTracker(store, process.env.AI_AI_CAPTAIN_CLAUDE_HOME ?? process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"));
  const junie = new JunieTracker(store, process.env.AI_AI_CAPTAIN_JUNIE_HOME ?? join(homedir(), ".junie", "sessions"));
  const claudeDesktop = new ClaudeDesktopTracker(store);
  const hosts = new HostLifetimes(process.env.AI_AI_CAPTAIN_JETBRAINS_INSTANCES ?? join(homedir(), ".junie", "instances"), dataDirectory ? join(dataDirectory, "host-lifetimes.json") : undefined);
  let scanning = false;
  const scan = async () => {
    if (scanning) return;
    scanning = true;
    try {
      const processes = await listProcesses();
      const lifetimes = await hosts.scan(processes);
      await Promise.all([
        copilot.scan(processes, lifetimes).catch(() => copilot.unavailable()),
        codex.scan(processes, lifetimes).catch(() => codex.unavailable()),
        claude.scan(processes, lifetimes).catch(() => claude.unavailable()),
        junie.scan(processes, lifetimes).catch(() => junie.unavailable()),
        claudeDesktop.scan(processes).catch(() => claudeDesktop.unavailable()),
      ]);
      await discoverDesktopApps(clients, processes, claudeDesktop.hasSessions, claudeDesktop.status);
    } catch {
      copilot.unavailable();
      codex.unavailable();
      claude.unavailable();
      junie.unavailable();
      claudeDesktop.unavailable();
    } finally {
      scanning = false;
    }
  };
  void scan();
  const timer = setInterval(() => void scan(), 1500);
  timer.unref?.();
  return timer;
}
