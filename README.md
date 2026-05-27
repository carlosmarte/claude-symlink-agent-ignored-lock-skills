<!-- gen-readme:auto -->
# claude-symlink-agent-ignored-lock-skills

A skill repository for Claude Code that demonstrates the **vendored-skill** convention end
to end. Skills this repo *authors* live under `.agents/skills/<name>/` and are mirrored into
`.claude/skills/<name>` as relative symlinks so the Claude Code harness auto-discovers them.
Skills this repo merely *vendors* from upstream (the `agent-skill-kit-*` toolkit, plus the
helper skills that build and link this tree) are pinned in [`skills-lock.json`](skills-lock.json),
`.gitignore`d, and re-fetched with `npx skills add` rather than committed. The README below
lists only what the repo owns.

## Skills

| Skill | What it does |
|-------|--------------|
| [`skills-lock-gitignore-prune`](.agents/skills/skills-lock-gitignore-prune/SKILL.md) | Resync skills-lock.json with .gitignore by removing any skill entry whose files are git-ignored. |

## Install

### Per skill — `npx skills add`

Install any single skill into Claude Code:

```bash
npx skills add carlosmarte/claude-symlink-agent-ignored-lock-skills \
  --skill skills-lock-gitignore-prune -a claude-code
```

### Relink after install — symlink bootstrap

This repo has no root `install.sh`. Once skills are on disk (cloned or vendored), recreate the
`.claude/skills/<name>` symlinks from their `.agents/skills/<name>` sources with the bundled
[`claude-symlink-agent-individual-skills`](.claude/skills/claude-symlink-agent-individual-skills/SKILL.md)
linker:

```bash
# Mirror every .agents/skills/<name> into .claude/skills/<name>
./.claude/skills/claude-symlink-agent-individual-skills/install.sh

# Preview without writing
./.claude/skills/claude-symlink-agent-individual-skills/install.sh --dry-run
```

## Layout

```
.agents/skills/<name>/SKILL.md                          # source of truth for each skill
.claude/skills/<name> -> ../../.agents/skills/<name>    # relative symlink (harness-discovered)
skills-lock.json                                        # pins vendored skills (source + hash)
.gitignore                                              # keeps vendored skills out of the commit
```
