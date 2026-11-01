import { describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
// @ts-expect-error The integration is a plain JavaScript module without types.
import { budgetFromStatusLine, statusText } from "../integrations/claude-statusline.mjs";
import { budgetInputSchema } from "./shared/budget.js";

// The documented status line input of Claude Code, with the fields that the script does not use.
const input = {
  model: { id: "claude-opus-5-5", display_name: "Opus" },
  workspace: { current_dir: "/private/project" },
  context_window: { used_percentage: 8 },
  rate_limits: { five_hour: { used_percentage: 23.5, resets_at: 1738425600 }, seven_day: { used_percentage: 41.2, resets_at: 1738857600 } },
};

describe("Claude status line reporter", () => {
  it("makes a valid Claude budget from the rate limits only", () => {
    const budget = budgetFromStatusLine(input, "max");
    expect(budgetInputSchema.parse(budget)).toEqual({
      provider: "claude", source: "claude-statusline", plan: "max",
      windows: [
        { kind: "five-hour", usedPercent: 23.5, resetsAt: "2025-02-01T16:00:00.000Z" },
        { kind: "weekly", usedPercent: 41.2, resetsAt: "2025-02-06T16:00:00.000Z" },
      ],
    });
    expect(JSON.stringify(budget)).not.toContain("private");
  });

  it("sends nothing before the first response, and 0% for a window that Claude Code dropped after its reset", () => {
    expect(budgetFromStatusLine({ model: input.model }, "max")).toBeUndefined();
    expect(budgetFromStatusLine({ rate_limits: { seven_day: input.rate_limits.seven_day } }).windows[0]).toEqual({ kind: "five-hour", usedPercent: 0 });
    expect(budgetFromStatusLine(input, "max; rm -rf /").plan).toBeUndefined();
  });

  it("prints a short status line", () => {
    expect(statusText(input)).toBe("Opus · ctx 8% · 5h 24% · wk 41%");
  });

  it("reports to the hub and prints the line when Claude Code runs it", async () => {
    const received: unknown[] = [];
    const server = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => { received.push({ method: request.method, url: request.url, body: JSON.parse(body) }); response.end("{}"); });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    const script = fileURLToPath(new URL("../integrations/claude-statusline.mjs", import.meta.url));
    const child = spawn(process.execPath, [script, "--plan", "max"], { env: { ...process.env, AI_AI_CAPTAIN_URL: `http://127.0.0.1:${port}` } });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stdin.end(JSON.stringify(input));
    await new Promise((resolve) => child.on("close", resolve));
    server.close();
    expect(output.trim()).toBe("Opus · ctx 8% · 5h 24% · wk 41%");
    expect(received).toEqual([{ method: "PUT", url: "/api/budgets/claude", body: expect.objectContaining({ provider: "claude", plan: "max" }) }]);
  });
});
