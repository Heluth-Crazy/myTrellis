// Build the inventory used to recognize files written by upstream Trellis.
//
// Usage: node scripts/build-legacy-catalog.mjs [version...]
// TL_FIXTURES may point at a durable cache. The default is intentionally a
// disposable OS temp location for developers who do not provide one.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheRoot = process.env.TL_FIXTURES ?? path.join(os.tmpdir(), "trellis-lite-fixtures");
const versions = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : [
      "0.3.10", "0.4.0", "0.5.19", "0.6.0-beta.0", "0.6.0-beta.10", "0.6.0-beta.23",
      "0.6.0", "0.6.5", "0.6.10", "0.6.17", "0.7.0-beta.0", "0.7.0-beta.1",
      "0.7.0-beta.2", "0.7.0-beta.3", "0.7.0-beta.4",
    ];
const platforms = [
  "claude", "cursor", "opencode", "codex", "kilo", "kiro", "gemini", "antigravity", "devin",
  "qoder", "codebuddy", "copilot", "droid", "dsh", "pi", "reasonix", "zcode", "omp", "trae",
  "grok", "kimi", "snow", "iflow",
];

function installPackage(args) {
  if (process.platform !== "win32") return execFileSync("npm", args, { stdio: "inherit" });
  // Batch wrappers cannot be execFile'd on Windows. Run npm's JS entrypoint
  // directly so paths with spaces remain arguments, without a shell.
  const wrappers = execFileSync("where.exe", ["npm.cmd"], { encoding: "utf8" }).trim().split(/\r?\n/);
  const candidates = [process.env.npm_execpath, ...wrappers.map(wrapper => path.join(path.dirname(wrapper), "node_modules", "npm", "bin", "npm-cli.js"))];
  const cli = candidates.find(candidate => candidate && fs.existsSync(candidate));
  if (!cli) throw new Error("Cannot locate npm-cli.js; run the generator using npm exec -- node scripts/build-legacy-catalog.mjs");
  return execFileSync(process.execPath, [cli, ...args], { stdio: "inherit" });
}

function fixtureComplete(fixtureDir, version) {
  return fs.existsSync(path.join(fixtureDir, ".git"))
    && fs.existsSync(path.join(fixtureDir, ".trellis"))
    && fs.existsSync(path.join(fixtureDir, "AGENTS.md"))
    && fs.existsSync(path.join(cacheRoot, "fixtures", `${version}.init.log`));
}

function packageBin(packageJsonPath) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const bin = typeof packageJson.bin === "string" ? packageJson.bin : packageJson.bin?.trellis;
  if (typeof bin !== "string") {
    throw new Error(`Cannot find trellis binary in ${packageJsonPath}`);
  }
  return path.join(path.dirname(packageJsonPath), bin);
}

function supportedPlatforms(bin) {
  const result = spawnSync(process.execPath, [bin, "init", "--help"], { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error(`Could not read upstream init help: ${result.error?.message ?? result.stderr}`);
  }
  const flags = new Set(`${result.stdout}\n${result.stderr}`.matchAll(/--([a-z][a-z0-9-]*)\b/g).map((m) => m[1]));
  return platforms.filter((platform) => flags.has(platform));
}

function ensureFixture(version) {
  if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version)) throw new Error(`Invalid fixture version: ${version}`);
  const packageDir = path.join(cacheRoot, "pkgs", version);
  const fixtureDir = path.join(cacheRoot, "fixtures", version);
  if (fixtureComplete(fixtureDir, version)) return fixtureDir;
  const packageJsonPath = path.join(packageDir, "node_modules", "@mindfoldhq", "trellis", "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    fs.mkdirSync(packageDir, { recursive: true });
    installPackage(["install", "--prefix", packageDir, `@mindfoldhq/trellis@${version}`, "--no-audit", "--no-fund", "--silent"]);
  }
  if (fs.existsSync(fixtureDir)) {
    const relative = path.relative(path.resolve(cacheRoot, "fixtures"), path.resolve(fixtureDir));
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || fs.lstatSync(fixtureDir).isSymbolicLink()) throw new Error(`Unsafe fixture rebuild path: ${fixtureDir}`);
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }

  const bin = packageBin(packageJsonPath);
  const selectedPlatforms = supportedPlatforms(bin);
  fs.mkdirSync(fixtureDir, { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: fixtureDir });
  const result = spawnSync(process.execPath, [bin, "init", "-y", "-u", "tester", ...selectedPlatforms.map((platform) => `--${platform}`)], {
    cwd: fixtureDir,
    encoding: "utf8",
    timeout: 300_000,
    input: "",
    env: { ...process.env, CI: "1", NO_COLOR: "1" },
  });
  fs.writeFileSync(path.join(cacheRoot, "fixtures", `${version}.init.log`), `${result.stdout}\n${result.stderr}`);
  if (result.error || result.status !== 0) {
    throw new Error(`Upstream init failed for ${version}: ${result.error?.message ?? result.stderr}`);
  }
  console.log(`${version}: ${selectedPlatforms.length} platform flags`);
  return fixtureDir;
}

function isProtectedOrBlockFile(relativePath, content) {
  if (relativePath === "AGENTS.md") return true;
  if (relativePath.startsWith(".trellis/spec/") || relativePath.startsWith(".trellis/tasks/") || relativePath.startsWith(".trellis/workspace/")) {
    return true;
  }
  return /<!-- TRELLIS(?::[A-Z0-9-]+)?:START -->/.test(content)
    && /<!-- TRELLIS(?::[A-Z0-9-]+)?:END -->/.test(content);
}

function normalizedHash(content) {
  const normalized = content
    .replaceAll("\r\n", "\n")
    .replaceAll("python3 ", "python ");
  return createHash("sha256").update(normalized).digest("hex");
}

function collectFixture(root, catalogPaths) {
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      const fullPath = path.join(directory, entry.name);
      const relativePath = path.relative(root, fullPath).split(path.sep).join("/");
      const stat = fs.lstatSync(fullPath);
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        visit(fullPath);
      } else if (stat.isFile()) {
        const content = fs.readFileSync(fullPath, "utf8");
        if (!isProtectedOrBlockFile(relativePath, content)) {
          const hashes = catalogPaths.get(relativePath) ?? new Set();
          hashes.add(normalizedHash(content));
          catalogPaths.set(relativePath, hashes);
        }
      }
    }
  }
  visit(root);
}

const catalogPaths = new Map();
for (const version of versions) {
  collectFixture(ensureFixture(version), catalogPaths);
}

const catalog = {
  versions: [...versions].sort(),
  paths: Object.fromEntries([...catalogPaths.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([relativePath, hashes]) => [relativePath, [...hashes].sort()])),
};
const outputPath = path.join(repoRoot, "src", "legacy", "catalog.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(catalog)}\n`);
console.log(`Wrote ${Object.keys(catalog.paths).length} paths from ${catalog.versions.length} versions to ${outputPath}`);
