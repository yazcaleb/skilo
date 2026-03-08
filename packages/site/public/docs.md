# Documentation

## Quick start

Start with npx. The first successful interactive run also installs the global `skilo` binary for later use.

```
$ npx skilo-cli share ./code-reviewer
→ skilo.xyz/s/a3xK9mP2
$ skilo add skilo.xyz/s/a3xK9mP2
✓ Installed code-reviewer
$ skilo pack ./code-reviewer flrabbit/original-landing-page-builder --name "Starter pack"
→ skilo.xyz/p/abc123
```

No account required. Skills are published anonymously by default. You can claim them later with `skilo claim`.

Agents should prefer `npx skilo-cli --json` or `https://skilo.xyz/llms.txt`.

## CLI commands

### `skilo share <path>`

Create a shareable link for a local skill directory. Publishes the skill and returns a URL.

- `--one-time` — link expires after first use
- `--expires 2h` — auto-expire after a duration (m, h, d)
- `--uses 5` — limit total downloads
- `--password` — require a password to access

### `skilo share <tool>`

Share all skills from an AI tool at once. Supported tools: `claude`, `codex`, `cursor`, `opencode`, `amp`, `windsurf`, `cline`, `roo`, or `all`.

- `-y` — skip interactive selection, share everything

### `skilo add <skill>`

Install a skill or pack. Accepts a share URL, pack URL, namespace/name, .skl file, GitHub URL, or local path.

- If exactly one supported tool is detected, Skilo installs there automatically.
- If multiple tools are detected, interactive runs prompt once.
- Non-interactive runs should pass explicit flags or set `SKILO_TARGETS`.
- If nothing is detected, Skilo falls back to Claude Code.

### `skilo publish`

Publish the current directory to the registry. Reads SKILL.md for metadata.

### `skilo search <query>`

Search the registry for skills by name or description.

### `skilo inspect <skill>`

View a skill's SKILL.md, checksum, and metadata without installing.

### `skilo export` / `skilo import <source>`

Export to a .skl file for offline sharing, or import from a .skl file, GitHub repo, or local path.

## SKILL.md format

Every skill is a directory with a SKILL.md file. The file uses YAML frontmatter for metadata and markdown for the skill content.

```yaml
---
name: my-skill
description: What this skill does
version: 0.1.0
author: your-name
---

# my-skill

Instructions for the agent...
```

Fields: `name` and `description` are required. `version`, `author`, `homepage`, `repository`, and `keywords` are optional.

## Trust and verification

Every published skill has a SHA-256 checksum. The CLI verifies integrity on install.

- **Anonymous** — published without an account. Inspect before installing.
- **Claimed** — a user has claimed ownership with `skilo claim`.
- **Verified** — publisher identity confirmed. Skill is cryptographically signed.

Use `skilo inspect` to review a skill's content and checksum before you install.

## Supported tools

Skilo discovers skills from these directories:

| Tool | Directory |
|---|---|
| Claude Code | `~/.claude/skills/` |
| Codex | `~/.agents/skills/`, `~/.codex/skills/` |
| Cursor | `~/.cursor/skills/` |
| Amp | `~/.config/agents/skills/` |
| Windsurf | `~/.codeium/windsurf/skills/` |
| OpenCode | `~/.config/opencode/skills/` |
| Cline | `~/.cline/skills/` |
| Roo | `~/.roo/skills/` |
| OpenClaw | `~/.openclaw/skills/` |
