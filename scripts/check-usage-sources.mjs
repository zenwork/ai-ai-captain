// Look for subscription rate-limit fields on this computer. Print only field names, numbers, and times.
// Usage: node scripts/check-usage-sources.mjs > logs/usage-sources.txt
// The script never prints message text. It reads only the newest Codex rollout and the names of Claude files.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function newest(directory, pattern, depth = 4) {
  let best;
  const walk = (path, level) => {
    let entries = [];
    try { entries = readdirSync(path, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const child = join(path, entry.name);
      if (entry.isDirectory() && level < depth) walk(child, level + 1);
      else if (entry.isFile() && pattern.test(entry.name)) {
        const time = statSync(child).mtimeMs;
        if (!best || time > best.time) best = { path: child, time };
      }
    }
  };
  walk(directory, 0);
  return best?.path;
}

// Keep only keys, numbers, booleans, and short identifier strings.
function shape(value) {
  if (Array.isArray(value)) return value.slice(0, 3).map(shape);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, shape(entry)]));
  if (typeof value === "string") return /^[\w.:+-]{1,40}$/.test(value) ? value : `<string ${value.length}>`;
  return value;
}

function findKey(value, name, path = []) {
  if (!value || typeof value !== "object") return [];
  const found = [];
  for (const [key, entry] of Object.entries(value)) {
    if (key === name) found.push({ path: [...path, key].join("."), value: entry });
    found.push(...findKey(entry, name, [...path, key]));
  }
  return found;
}

const codexHome = process.env.CODEX_HOME ?? join(homedir(), ".codex");
const rollout = newest(join(codexHome, "sessions"), /^rollout-.*\.jsonl$/);
console.log(`Codex newest rollout: ${rollout ? "found" : "not found"}`);
if (rollout) {
  const lines = readFileSync(rollout, "utf8").split("\n").filter((line) => line.includes("rate_limit"));
  console.log(`Lines with rate_limit: ${lines.length}`);
  const last = lines.at(-1);
  if (last) {
    const record = JSON.parse(last);
    console.log(`Record type: ${record.type} / ${record.payload?.type}`);
    for (const match of [...findKey(record, "rate_limits"), ...findKey(record, "rate_limit")]) console.log(`${match.path}:\n${JSON.stringify(shape(match.value), null, 2)}`);
    console.log(`Record timestamp: ${record.timestamp}`);
  }
}

const claudeHome = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
console.log(`\nClaude files that mention rate limits (names only, transcripts skipped):`);
const walk = (path, level) => {
  let entries = [];
  try { entries = readdirSync(path, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) { if (level < 3 && !["projects", "todos", "shell-snapshots", "file-history"].includes(entry.name)) walk(child, level + 1); continue; }
    if (!/\.(json|jsonl)$/.test(entry.name) || statSync(child).size > 5_000_000) continue;
    const text = readFileSync(child, "utf8");
    if (/rate_limit|five_hour|seven_day|resets_at/i.test(text)) console.log(`  ${child.replace(homedir(), "~")}`);
  }
};
walk(claudeHome, 0);
for (const name of [".claude.json"]) {
  try {
    const text = readFileSync(join(homedir(), name), "utf8");
    console.log(`  ~/${name}: ${/rate_limit|five_hour|seven_day|resets_at/i.test(text) ? "mentions rate limits" : "no rate-limit fields"}`);
    // Print the keys that mention limits, with the shape of their values only.
    const visit = (value, path) => {
      if (!value || typeof value !== "object") return;
      for (const [key, entry] of Object.entries(value)) {
        const next = path ? `${path}.${key}` : key;
        if (/rate.?limit|five.?hour|seven.?day|resets.?at|usage.?limit|overage|extra.?usage|subscription|plan/i.test(key)) console.log(`    ${next}: ${JSON.stringify(shape(entry)).slice(0, 400)}`);
        else if (next.split(".").length < 4 && !/project|history|mcp/i.test(key)) visit(entry, next);
      }
    };
    visit(JSON.parse(text), "");
  } catch { /* missing */ }
}
