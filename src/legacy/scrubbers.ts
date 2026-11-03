/** Pure, ownership-aware cleanup for legacy Trellis shared configuration. */

export interface StructuredScrubResult {
  content: string;
  fullyEmpty: boolean;
}

type JsonObject = Record<string, unknown>;
type HookMode = "nested" | "flat";

const NESTED_HOOK_FILES = new Set([
  ".claude/settings.json",
  ".codex/hooks.json",
  ".gemini/settings.json",
  ".factory/settings.json",
  ".codebuddy/settings.json",
  ".qoder/settings.json",
  ".trae/hooks.json",
  ".iflow/settings.json",
]);
const FLAT_HOOK_FILES = new Set([
  ".cursor/hooks.json",
  ".github/copilot/hooks.json",
  ".github/hooks/trellis.json",
]);

const TOML_COMMENTS = new Set([
  "Project-scoped Codex defaults for Trellis workflows.",
  "Codex loads this after ~/.codex/config.toml when you work in this project.",
  "Codex merges this layer after the user-level config when the project",
  "is marked as a trusted project. To trust this project, add it under",
  "`[projects]` in ~/.codex/config.toml, e.g.:",
  '[projects."/abs/path/to/this/repo"]',
  'trust_level = "trusted"',
  "Keep AGENTS.md as the primary project instruction file.",
  "NOTE: Trellis's SessionStart + UserPromptSubmit hooks require opt-in.",
  "Add the following to your USER-level config at ~/.codex/config.toml",
  "(not this project file — features.* must be enabled globally):",
  "[features]",
  "hooks = true",
  "codex_hooks = true",
  "Without this flag, hooks.json is ignored and Trellis context won't",
  "be injected into Codex sessions.",
  "Codex hooks (`hooks.json` in this directory) only fire when the user",
  "has enabled them in their USER-level config: `[features].hooks = true`",
  "in ~/.codex/config.toml (Codex 0.129+; legacy name: `codex_hooks = true`,",
  "still works but emits a deprecation warning on 0.129+). Project-level",
  "config.toml cannot set feature flags; they must be user-level.",
  "Codex 0.129+ additionally gates each installed hook behind a one-time",
  "`/hooks` TUI review; until the user approves it, the hook stays inactive.",
  "NOTE: Trellis intentionally does NOT write a [features.multi_agent_v2]",
  "block here. Codex CLI changed `features` deserialization between 0.130",
  "and 0.131: the structured table form (with max_concurrent_threads_per_session",
  "/ *_wait_timeout_ms) is only accepted by 0.131+. On 0.130 and earlier —",
  "including the codex CLI bundled inside the Codex desktop app — it fails",
  "with `data did not match any variant of untagged enum FeatureToml`, which",
  "aborts the entire config load and blocks Codex from starting. Codex's own",
  "default for multi_agent_v2 is used instead; tune it in your user-level",
  "config if needed.",
  "Pin the subagent recursion depth explicitly instead of relying on Codex's",
  "default. #445 removed the per-agent `[features] multi_agent = false` guard",
  "(the #240/#241 wait_agent-deadlock structural fix) because native subagent",
  "dispatch already caps recursion via `agents.max_depth` — but that key is",
  "global/user-level, not settable inside an individual agent's .toml. Pinning",
  "it here means an upstream default change, or a user's own global override,",
  "can't silently reopen the recursion the #240/#241 fix closed. Project config",
  "(this file) takes precedence over user-level `~/.codex/config.toml`.",
]);

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseObject(content: string): JsonObject | undefined {
  try {
    const value: unknown = JSON.parse(content);
    return isObject(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function jsonResult(root: JsonObject, original: string, changed: boolean): StructuredScrubResult {
  if (!changed) return { content: original, fullyEmpty: false };
  const fullyEmpty = Object.keys(root).length === 0;
  return { content: JSON.stringify(root, null, 2) + "\n", fullyEmpty };
}

function commandOf(value: unknown): string | undefined {
  if (!isObject(value)) return undefined;
  for (const key of ["command", "bash", "powershell"]) {
    const candidate = value[key];
    if (typeof candidate === "string") return candidate;
  }
  return undefined;
}

function isTrellisCommand(command: string, deletedPaths: readonly string[]): boolean {
  const normalized = command.replace(/\\/g, "/").trim();
  if (/^(?:echo|printf|Write-Output|Write-Host)\s/i.test(normalized)) return false;
  if (/(?:^|[\s"'])\.trellis\//.test(normalized)) return true;
  const tokens = (normalized.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map(token => token.replace(/^["']|["',;]$/g, ''));
  return deletedPaths.some((path) => {
    const target = path.replace(/\\/g, "/");
    if (!target.includes("/hooks/")) return false;
    return tokens.some(token => token === target || token.endsWith(`/${target}`));
  });
}

function scrubHooks(content: string, deletedPaths: readonly string[], mode: HookMode, dropVersionWhenEmpty = false): StructuredScrubResult {
  const root = parseObject(content);
  if (!root) return { content, fullyEmpty: false };
  let changed = false;
  if (isObject(root.statusLine) && commandOf(root.statusLine) && isTrellisCommand(commandOf(root.statusLine)!, deletedPaths)) {
    delete root.statusLine;
    changed = true;
  }
  if (!isObject(root.hooks)) return jsonResult(root, content, changed);

  for (const event of Object.keys(root.hooks)) {
    const entries = root.hooks[event];
    if (!Array.isArray(entries)) continue;
    const kept = mode === "flat"
      ? entries.filter((entry) => !commandOf(entry) || !isTrellisCommand(commandOf(entry)!, deletedPaths))
      : entries.flatMap((entry) => {
          if (!isObject(entry) || !Array.isArray(entry.hooks)) return [entry];
          const hooks = entry.hooks.filter((hook) => !commandOf(hook) || !isTrellisCommand(commandOf(hook)!, deletedPaths));
          if (hooks.length === entry.hooks.length) return [entry];
          return hooks.length === 0 ? [] : [{ ...entry, hooks }];
        });
    if (kept.length === 0 && entries.length > 0) {
      delete root.hooks[event];
      changed = true;
    } else {
      if (kept.length !== entries.length || kept.some((value, index) => value !== entries[index])) changed = true;
      root.hooks[event] = kept;
    }
  }
  if (Object.keys(root.hooks).length === 0) {
    delete root.hooks;
    if (dropVersionWhenEmpty && root.version === 1) delete root.version;
  }
  return jsonResult(root, content, changed);
}

function scrubOpencode(content: string): StructuredScrubResult {
  const root = parseObject(content);
  if (!root) return { content, fullyEmpty: false };
  let changed = false;
  if (isObject(root.dependencies)) {
    if ("@opencode-ai/plugin" in root.dependencies) {
      delete root.dependencies["@opencode-ai/plugin"];
      changed = true;
    }
    if (Object.keys(root.dependencies).length === 0) delete root.dependencies;
  }
  return jsonResult(root, content, changed);
}

function scrubPi(content: string): StructuredScrubResult {
  const root = parseObject(content);
  if (!root) return { content, fullyEmpty: false };
  let changed = "enableSkillCommands" in root;
  delete root.enableSkillCommands;
  for (const [key, owned] of [["extensions", "./extensions/trellis/index.ts"], ["skills", "./skills"], ["prompts", "./prompts"]] as const) {
    if (!Array.isArray(root[key])) continue;
    const normalizedOwned = owned.replace(/^\.\//, "");
    const values = root[key].filter((value) => typeof value !== "string" || value.replace(/^\.\//, "") !== normalizedOwned);
    if (values.length !== root[key].length) changed = true;
    if (values.length === 0) delete root[key]; else root[key] = values;
  }
  if (Array.isArray(root.packages)) {
    const values = root.packages.filter((value) => value !== "npm:pi-subagents" && (!isObject(value) || value.source !== "npm:pi-subagents"));
    if (values.length !== root.packages.length) changed = true;
    if (values.length === 0) delete root.packages; else root.packages = values;
  }
  return jsonResult(root, content, changed);
}

function scrubCodexToml(content: string): StructuredScrubResult {
  let changed = false;
  const lines = content.split(/\r?\n/).filter((line) => {
    if (/^\s*project_doc_fallback_filenames\s*=/.test(line)) { changed = true; return false; }
    const comment = line.trim().match(/^#\s?(.*)$/)?.[1]?.trim();
    const keep = comment === undefined || (comment.length > 0 && !TOML_COMMENTS.has(comment));
    if (!keep) changed = true;
    return keep;
  });
  const output: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\s*\[agents\]\s*$/.test(lines[index] ?? "")) { output.push(lines[index] ?? ""); continue; }
    const body: string[] = [];
    while (index + 1 < lines.length && !/^\s*\[/.test(lines[index + 1] ?? "")) {
      index += 1;
      if (!/^\s*max_depth\s*=\s*1\s*(?:#.*)?$/.test(lines[index] ?? "")) body.push(lines[index] ?? "");
      else changed = true;
    }
    if (body.some((line) => line.trim() !== "" && !line.trim().startsWith("#"))) output.push("[agents]", ...body);
    else output.push(...body.filter((line) => line.trim() !== ""));
  }
  if (!changed) return { content, fullyEmpty: false };
  const compact = output.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { content: compact === "" ? "" : `${compact}\n`, fullyEmpty: compact === "" };
}

function scrubCopilotGuidance(content: string): StructuredScrubResult {
  const start = "<!-- TRELLIS:COPILOT-GUIDANCE:START -->";
  const end = "<!-- TRELLIS:COPILOT-GUIDANCE:END -->";
  const first = content.indexOf(start);
  const last = first === -1 ? -1 : content.indexOf(end, first + start.length);
  if (first === -1 || last === -1) return { content, fullyEmpty: false };
  const result = content.slice(0, first) + content.slice(last + end.length);
  return { content: result, fullyEmpty: result.trim() === "" };
}

function scrubGitattributes(content: string): StructuredScrubResult {
  // Upstream appends this complete stanza to an existing user-owned file.
  const stanza = [
    '# Trellis: append-only developer journals should merge cleanly across',
    '# parallel sessions/worktrees — each session only appends a new block, so',
    '# there is nothing to actually conflict on.',
    '#',
    '# Do NOT add a rule for workspace/*/index.md here — it is fully regenerated',
    '# every session, so a real conflict there is expected and safe to resolve by',
    '# picking either side (task state lives in task.json, not index.md). See',
    '# .trellis/spec/cli/backend/directory-structure.md for details.',
    '.trellis/workspace/*/journal-*.md merge=union',
  ].join(content.includes('\r\n') ? '\r\n' : '\n');
  const result = content.replace(stanza, '').replace(/^\.trellis\/workspace\/\*\/journal-\*\.md\s+merge=union[^\S\r\n]*(?:\r?\n|$)/gm, '');
  return { content: result, fullyEmpty: result.trim() === '' && result !== content };
}

function scrubZcode(content: string, deletedPaths: readonly string[]): StructuredScrubResult {
  const root = parseObject(content);
  if (!root || !isObject(root.hooks) || !isObject(root.hooks.events)) return { content, fullyEmpty: false };
  const input = JSON.stringify({ hooks: root.hooks.events });
  const cleaned = scrubHooks(input, deletedPaths, 'nested');
  if (cleaned.content === input) return { content, fullyEmpty: false };
  const events = parseObject(cleaned.content)?.hooks;
  if (isObject(events)) root.hooks.events = events;
  else {
    delete root.hooks.events;
    if (root.hooks.enabled === true) delete root.hooks.enabled;
  }
  if (!Object.keys(root.hooks).length) delete root.hooks;
  return jsonResult(root, content, true);
}

function scrubSnow(content: string, deletedPaths: readonly string[]): StructuredScrubResult {
  const root = parseObject(content);
  if (!root) return { content, fullyEmpty: false };
  const input = JSON.stringify({ hooks: root });
  const cleaned = scrubHooks(input, deletedPaths, 'nested');
  if (cleaned.content === input) return { content, fullyEmpty: false };
  const events = parseObject(cleaned.content)?.hooks;
  return jsonResult(isObject(events) ? events : {}, content, true);
}

/** Return undefined when the path has no structured legacy format. */
export function scrubStructured(relative: string, content: string, deletedPaths: readonly string[]): StructuredScrubResult | undefined {
  const path = relative.replace(/\\/g, "/");
  if (NESTED_HOOK_FILES.has(path)) return scrubHooks(content, deletedPaths, "nested");
  if (FLAT_HOOK_FILES.has(path)) return scrubHooks(content, deletedPaths, "flat", path === ".github/hooks/trellis.json");
  if (path === ".opencode/package.json") return scrubOpencode(content);
  if (path === ".pi/settings.json") return scrubPi(content);
  if (path === ".codex/config.toml") return scrubCodexToml(content);
  if (path === ".github/copilot-instructions.md") return scrubCopilotGuidance(content);
  if (path === '.gitattributes') return scrubGitattributes(content);
  if (path === '.zcode/config.json') return scrubZcode(content, deletedPaths);
  if (/^\.snow\/hooks\/(?:onSessionStart|onUserMessage|beforeSubAgentStart)\.json$/.test(path)) return scrubSnow(content, deletedPaths);
  return undefined;
}
