#!/usr/bin/env node
// Prune skills-lock.json entries whose skill lives at a git-ignored path.
//
// Ignore resolution is delegated to `git check-ignore`, so the full set of git
// ignore sources is honored (.gitignore at any level, .git/info/exclude, the
// global core.excludesFile) and all pattern semantics — globs like
// `agent-skill-kit-*`, negations, directory rules — behave exactly as git does.
//
// For each lock entry we test several candidate paths and prune the entry if
// ANY of them is ignored:
//   - the recorded skillPath               (e.g. .agents/skills/<name>/SKILL.md)
//   - its parent directory                 (e.g. .agents/skills/<name>)
//   - the Claude mirror of the same name   (e.g. .claude/skills/<name>)
// Checking the .claude mirror is what catches an "outlier" entry whose source
// path is tracked but whose mirrored copy is ignored (or vice-versa).
//
// Zero dependencies. Requires the `git` CLI and a git work tree.
//
// Usage:
//   node prune-lock.mjs [--dry-run] [--lock <path>] [--strict] [root]
//
//   --dry-run   Report KEEP/PRUNE verdicts; do not write the file.
//   --lock P    Path to the lockfile (default <root>/skills-lock.json).
//   --strict    Only test the recorded skillPath (+ its dir); skip the
//               .claude mirror heuristic.
//   root        Repo root to resolve relative paths against and run git in
//               (default: `git rev-parse --show-toplevel`, else $PWD).

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

function parseArgs(argv) {
  const opts = { dryRun: false, strict: false, lock: null, root: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--strict") opts.strict = true;
    else if (a === "--lock") opts.lock = argv[++i];
    else if (a === "-h" || a === "--help") opts.help = true;
    else if (a.startsWith("--")) fail(`unknown flag: ${a}`);
    else opts.root = a;
  }
  return opts;
}

function fail(msg) {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(2);
}

function gitRoot(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
    }).trim();
  } catch {
    return cwd;
  }
}

// True iff `relPath` (relative to root) is ignored by git.
function isIgnored(root, relPath) {
  try {
    execFileSync("git", ["check-ignore", "-q", "--", relPath], { cwd: root });
    return true; // exit 0 => ignored
  } catch (err) {
    if (err && err.status === 1) return false; // exit 1 => not ignored
    fail(
      `git check-ignore failed for "${relPath}" (status ${err && err.status}). ` +
        `Is this a git work tree with git installed?`,
    );
  }
}

function toRepoRel(root, p) {
  const abs = isAbsolute(p) ? p : join(root, p);
  return relative(root, abs) || ".";
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(
      "Usage: node prune-lock.mjs [--dry-run] [--lock <path>] [--strict] [root]\n",
    );
    return;
  }

  const root = resolve(opts.root || gitRoot(process.cwd()));
  const lockPath = opts.lock
    ? resolve(opts.lock)
    : join(root, "skills-lock.json");

  let raw;
  try {
    raw = readFileSync(lockPath, "utf8");
  } catch {
    fail(`cannot read lockfile: ${lockPath}`);
  }

  let lock;
  try {
    lock = JSON.parse(raw);
  } catch (e) {
    fail(`lockfile is not valid JSON: ${e.message}`);
  }
  if (!lock || typeof lock.skills !== "object" || lock.skills === null) {
    fail(`lockfile has no "skills" object`);
  }

  const kept = {};
  const verdicts = [];
  for (const [name, entry] of Object.entries(lock.skills)) {
    const candidates = new Set();
    const skillPath = entry && entry.skillPath;
    if (skillPath) {
      candidates.add(toRepoRel(root, skillPath));
      candidates.add(toRepoRel(root, dirname(skillPath)));
    }
    if (!opts.strict) {
      candidates.add(`.claude/skills/${name}`);
      candidates.add(`.agents/skills/${name}`);
    }

    let hit = null;
    for (const c of candidates) {
      if (isIgnored(root, c)) {
        hit = c;
        break;
      }
    }

    if (hit) {
      verdicts.push({ name, action: "PRUNE", reason: hit });
    } else {
      verdicts.push({ name, action: "KEEP", reason: skillPath || "(tracked)" });
      kept[name] = entry;
    }
  }

  const pruned = verdicts.filter((v) => v.action === "PRUNE");
  const width = verdicts.reduce((m, v) => Math.max(m, v.name.length), 0);
  for (const v of verdicts) {
    const tag = v.action === "PRUNE" ? "PRUNE" : "keep ";
    const note = v.action === "PRUNE" ? `ignored: ${v.reason}` : v.reason;
    process.stdout.write(`  ${tag}  ${v.name.padEnd(width)}  ${note}\n`);
  }

  process.stdout.write(
    `\n${pruned.length} pruned, ${Object.keys(kept).length} kept` +
      ` (of ${verdicts.length})\n`,
  );

  if (pruned.length === 0) {
    process.stdout.write("lockfile already in sync with .gitignore.\n");
    return;
  }

  if (opts.dryRun) {
    process.stdout.write("\n--dry-run: lockfile not modified.\n");
    return;
  }

  const out = { ...lock, skills: kept };
  writeFileSync(lockPath, JSON.stringify(out, null, 2) + "\n");
  process.stdout.write(`\nwrote ${lockPath}\n`);
}

main();
