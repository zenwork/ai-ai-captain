import { randomUUID } from "node:crypto";
import { stdin } from "node:process";
import { sessionInputSchema, type SessionState } from "./shared/session.js";
import { hookEndsSession, hookSessionId, stateForHook } from "./shared/hooks.js";

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function usage(): never {
  console.error("Usage: npm run report -- upsert --source codex --state working --label 'Code review' [--id ID --model MODEL --tokens-used N --context-percent N --freedom limited|full --approval asks|never --project PATH --app APP --bundle-id ID --pid PID]");
  console.error("       npm run report -- end --id ID [--state done|failed]");
  console.error("       npm run report -- hook claude-code|codex-cli|copilot-cli EVENT");
  process.exit(2);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const baseUrl = process.env.AI_AI_CAPTAIN_URL ?? "http://127.0.0.1:43681";
  if (command === "upsert") {
    const id = option(args, "--id") ?? randomUUID();
    const state = option(args, "--state") ?? "working";
    const input = sessionInputSchema.parse({
      id,
      source: option(args, "--source") ?? "cli",
      harness: option(args, "--harness"),
      model: option(args, "--model"),
      ...(option(args, "--tokens-used") ? { tokensUsed: Number(option(args, "--tokens-used")) } : {}),
      ...(option(args, "--context-percent") ? { contextUsedPercent: Number(option(args, "--context-percent")) } : {}),
      freedom: option(args, "--freedom"),
      approval: option(args, "--approval"),
      label: option(args, "--label") ?? "AI session",
      state: state as SessionState,
      ended: false,
      project: option(args, "--project"),
      ...((option(args, "--app") || option(args, "--bundle-id") || option(args, "--pid")) ? { focusTarget: {
        ...(option(args, "--app") ? { appName: option(args, "--app") } : {}),
        ...(option(args, "--bundle-id") ? { bundleId: option(args, "--bundle-id") } : {}),
        ...(option(args, "--pid") ? { pid: Number(option(args, "--pid")) } : {}),
      } } : {}),
    });
    await request(`${baseUrl}/api/sessions/${encodeURIComponent(id)}`, "PUT", input);
    console.info(id);
    return;
  }
  if (command === "end") {
    const id = option(args, "--id");
    if (!id) usage();
    const state = option(args, "--state") ?? "done";
    if (state !== "done" && state !== "failed") usage();
    await request(`${baseUrl}/api/sessions/${encodeURIComponent(id)}/end`, "POST", { state });
    return;
  }
  if (command === "hook") {
    const [harness, eventName] = args;
    if (!harness || !eventName) usage();
    const event = await readInput();
    const sessionId = hookSessionId(event, option(args, "--id"));
    const source = harness.replace(/-cli$/, "");
    const state = stateForHook(eventName, event);
    const requestBody = sessionInputSchema.parse({
      id: `${source}:${sessionId}`,
      source,
      harness,
      label: `${harness} session`,
      state,
      ended: hookEndsSession(eventName),
      ...(event.cwd || event.workspace ? { project: String(event.cwd ?? event.workspace) } : {}),
      ...(event.model ? { model: String(event.model) } : {}),
      ...((option(args, "--app") || option(args, "--bundle-id")) ? { focusTarget: {
        ...(option(args, "--app") ? { appName: option(args, "--app") } : {}),
        ...(option(args, "--bundle-id") ? { bundleId: option(args, "--bundle-id") } : {}),
      } } : {}),
    });
    await request(`${baseUrl}/api/sessions/${encodeURIComponent(requestBody.id)}`, "PUT", requestBody);
    return;
  }
  usage();
}

async function readInput(): Promise<Record<string, unknown>> {
  let data = "";
  for await (const chunk of stdin) data += chunk;
  if (!data.trim()) return {};
  try {
    const value: unknown = JSON.parse(data);
    return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

async function request(url: string, method: string, body: unknown): Promise<void> {
  const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`AI AI Captain returned ${response.status}: ${await response.text()}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
