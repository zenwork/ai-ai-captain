// Look for the JetBrains AI quota on this computer. Print only file names, setting names, numbers, dates, and short codes.
// Usage: node scripts/check-jetbrains-quota.mjs > logs/jetbrains-quota.txt
// The script never prints text values. A long or free-text value shows as <text N>, where N is its length.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

const home = homedir();
const roots =
  platform() === "darwin"
    ? [join(home, "Library", "Application Support", "JetBrains"), join(home, "Library", "Caches", "JetBrains")]
    : platform() === "win32"
      ? [
          join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "JetBrains"),
          join(process.env.LOCALAPPDATA ?? join(home, "AppData", "Local"), "JetBrains"),
        ]
      : [join(home, ".config", "JetBrains"), join(home, ".cache", "JetBrains")];

const keyword = /quota|credit|top.?up|ai.?plan|subscription|licen[cs]e.?ai|ai.?assistant|grazie|usage.?limit|remaining|refill|reset/i;
const skipDirectories = new Set([
  "plugins",
  "index",
  "caches",
  "jcef_cache",
  "log",
  "logs",
  "tmp",
  "frameworks",
  "jdbc-drivers",
  "full-line",
  "projects",
  "LocalHistory",
  "conversations",
  "chats",
  "workspace",
]);
const maximumBytes = 2_000_000;
const found = [];

function safe(value) {
  const text = String(value).trim();
  if (/^-?\d+(\.\d+)?$/.test(text)) return text;
  if (/^(true|false)$/i.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}([T ][\d:.]+Z?([+-]\d{2}:?\d{2})?)?$/.test(text)) return text;
  // One word without spaces, for example a type name or a duration such as PT720H.
  if (/^[A-Za-z][A-Za-z0-9_.-]{0,31}$/.test(text)) return text;
  return `<text ${text.length}>`;
}

function scanXml(path, text) {
  // Report the components and options whose names mention the quota, and the options inside such components.
  for (const component of text.matchAll(/<component name="([^"]+)"([^>]*)>([\s\S]*?)<\/component>/g)) {
    const [, name, , body] = component;
    const relevant = keyword.test(name);
    for (const option of body.matchAll(/<(option|entry|property)\b([^>]*)\/?>/g)) {
      const attributes = Object.fromEntries([...option[2].matchAll(/(\w+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
      const label = attributes.name ?? attributes.key ?? "?";
      if (!relevant && !keyword.test(label)) continue;
      const value = attributes.value ?? "";
      found.push(`${path}\n    component ${name} · ${label} = ${value === "" ? "<empty>" : safe(value)}`);
    }
    if (relevant && !/<(option|entry|property)\b/.test(body)) found.push(`${path}\n    component ${name} · (no options)`);
  }
  for (const property of text.matchAll(/<property name="([^"]+)" value="([^"]*)"/g)) {
    if (keyword.test(property[1])) found.push(`${path}\n    property ${property[1]} = ${safe(property[2])}`);
  }
}

function scanJson(path, text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return;
  }
  const visit = (entry, trail) => {
    if (!entry || typeof entry !== "object") return;
    for (const [key, child] of Object.entries(entry)) {
      const next = trail ? `${trail}.${key}` : key;
      if (keyword.test(key))
        found.push(
          `${path}\n    ${next} = ${child && typeof child === "object" ? JSON.stringify(child, (_, inner) => (inner && typeof inner === "object" ? inner : safe(inner))).slice(0, 400) : safe(child)}`,
        );
      else if (trail.split(".").length < 6) visit(child, next);
    }
  };
  visit(value, "");
}

function walk(directory, depth) {
  let entries = [];
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (depth < 5 && !skipDirectories.has(entry.name)) walk(path, depth + 1);
      continue;
    }
    if (!/\.(xml|json|properties)$/i.test(entry.name)) continue;
    let size = 0;
    try {
      size = statSync(path).size;
    } catch {
      continue;
    }
    if (size > maximumBytes) continue;
    const text = readFileSync(path, "utf8");
    if (!keyword.test(text)) continue;
    const shown = path.replace(home, "~");
    if (/\.json$/i.test(entry.name)) scanJson(shown, text);
    else if (/\.xml$/i.test(entry.name)) scanXml(shown, text);
    else
      for (const line of text.split("\n")) {
        const match = line.match(/^\s*([\w.-]+)\s*[=:]\s*(.*)$/);
        if (match && keyword.test(match[1])) found.push(`${shown}\n    ${match[1]} = ${safe(match[2])}`);
      }
  }
}

// With --quota, decode the AIAssistantQuotaManager2 values and print their keys, numbers, and dates only.
if (process.argv.includes("--quota")) {
  const decode = (value) =>
    value
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#10;/g, "\n")
      .replace(/&amp;/g, "&");
  const shape = (value) => {
    if (Array.isArray(value)) return value.slice(0, 5).map(shape);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, shape(entry)]));
    return typeof value === "string" ? safe(value) : value;
  };
  for (const root of roots.slice(0, 1)) {
    let products = [];
    try {
      products = readdirSync(root);
    } catch {
      continue;
    }
    for (const product of products) {
      const path = join(root, product, "options", "AIAssistantQuotaManager2.xml");
      let text;
      try {
        text = readFileSync(path, "utf8");
      } catch {
        continue;
      }
      console.log(`${path.replace(home, "~")} (changed ${statSync(path).mtime.toISOString()})`);
      for (const option of text.matchAll(/<option name="([^"]+)" value="([^"]*)"/g)) {
        const raw = decode(option[2]);
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = undefined;
        }
        console.log(`  ${option[1]}: ${parsed === undefined ? safe(raw) : JSON.stringify(shape(parsed), null, 2).replace(/\n/g, "\n  ")}`);
      }
      const other = [...text.matchAll(/<(\w+)\b[^>]*>/g)].map((match) => match[1]).filter((tag) => !["application", "component", "option"].includes(tag));
      if (other.length) console.log(`  other elements: ${[...new Set(other)].join(", ")}`);
    }
  }
  process.exit(0);
}

for (const root of roots) {
  console.log(
    `Folder ${root.replace(home, "~")}: ${(() => {
      try {
        return (
          readdirSync(root)
            .filter((name) => !name.startsWith("."))
            .join(", ") || "empty"
        );
      } catch {
        return "not found";
      }
    })()}`,
  );
  walk(root, 0);
}
console.log(`\nMatches (${found.length}):`);
for (const line of [...new Set(found)].slice(0, 300)) console.log(line);
