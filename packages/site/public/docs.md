# Documentation

## Quick start

Start with npx. Every `npx skilo-cli ...` run refreshes the global `skilo` binary in the background, and the installed `skilo` command keeps itself updated too.

```
$ npx skilo-cli share ./code-reviewer
→ skilo.xyz/s/a3xK9mP2
$ skilo add skilo.xyz/s/a3xK9mP2
✓ Installed code-reviewer
$ skilo pack ./code-reviewer flrabbit/original-landing-page-builder --name "Starter pack"
→ skilo.xyz/p/abc123
```

No account required. Skilo is free and will stay free as long as we fit inside Cloudflare's free tier. Skills and share links never expire unless you set an expiration. You can claim them later with `skilo claim`.

Want a real namespace? Run `skilo login yaz` once. That creates a publishing identity and stores an API key locally. Use `skilo login --token sk_...` to restore an existing account.

Skilo is transfer-first. The main flows are `share`, `add`, `sync`, and `pack`. Public search exists, but it is secondary.

Agents should prefer `npx skilo-cli --json` or `https://skilo.xyz/llms.txt`.

## CLI commands

### `skilo share <path>`

Create a shareable link for a local skill directory. Publishes the skill and returns a URL.

- `--one-time` — link expires after first use
- `--expires 2h` — auto-expire after a duration (m, h, d)
- `--uses 5` — limit total downloads
- `--password` — require a password to access
- `--listed` — make the underlying skill public and searchable first

`skilo share` is transfer-first. Local shares default to unlisted even when you're logged in.

### `skilo share <tool>`

Share all skills from an AI tool at once. Supported tools: `claude`, `codex`, `cursor`, `opencode`, `amp`, `windsurf`, `cline`, `roo`, or `all`.

- `-y` — skip interactive selection, share everything

### `skilo add <skill>`

Install a skill or pack. Accepts a share URL, pack URL, namespace/name, .skl file, GitHub URL, or local path.

- If exactly one supported tool is detected, Skilo installs there automatically.
- If multiple tools are detected, interactive runs prompt once.
- Non-interactive runs should pass explicit flags or set `SKILO_TARGETS`.
- If nothing is detected, Skilo falls back to Claude Code.
- Pack links open an all-selected picker in TTY mode. Use `--only reviewer,planner` or `--skip debugger` in non-interactive runs.

Tool names also work as local sources. Examples:

- `skilo add claude --oc --all`
- `skilo import claude --skill reviewer --oc`
- `skilo sync claude opencode`

### `skilo sync <from> <to>`

Copy skills from one tool into another tool without going through a repo.

- `skilo sync claude opencode`
- `skilo sync claude codex --all`
- `skilo sync codex cursor --skill reviewer`

### `skilo pack [sources...]`

Turn multiple skills, links, refs, or repo sources into one pack link.

- `skilo pack ./reviewer ./planner --name "Daily kit"`
- `skilo pack skilo.xyz/s/abc123 vercel-labs/skills@find-skills`
- `skilo add skilo.xyz/p/abc123` to install the resulting pack

### `skilo publish`

Publish the current directory to the registry. Reads SKILL.md for metadata.

- `--listed` — publish publicly under your namespace
- `--unlisted` — publish direct-link only

### `skilo login <username>`

Create a publishing identity with a username and save an API key locally.

- `skilo login yaz`
- `skilo login --token sk_...`

### `skilo list --published`

List skills under your logged-in namespace, including public vs unlisted visibility.

### `skilo search <query>`

Search public skills by name or description. Use this when you want discovery, not for the main transfer loop.

### `skilo inspect <skill>`

View a skill's SKILL.md, checksum, and metadata without installing.

### `skilo pack [sources...]`

Create a shareable pack from multiple skills, links, refs, or repo sources. Returns a single pack URL.

- `--name <name>` — name the pack
- Supports the same `--one-time`, `--expires`, `--uses`, `--password` options as share

### `skilo export` / `skilo import <source>`

Export to a .skl file for offline sharing, or import from a .skl file, GitHub repo, or local path.

### `skilo init [name]`

Scaffold a new skill directory with a SKILL.md template.

### `skilo validate`

Check the current directory's SKILL.md for errors before publishing.

### `skilo audit [source]`

Run a trust audit on installed skills or local bundles. Checks for hardcoded secrets, prompt exfiltration, and other risks.

### `skilo deprecate <skill> [message]`

Mark a skill as deprecated. Requires authentication.

### `skilo yank <skill@version> [reason]`

Remove a specific version from the registry. Requires authentication.

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

## Claiming skills

When you publish without being logged in, you get an anonymous namespace and a claim token. The CLI saves it to `~/.skilo/claims/` automatically.

1. **Publish a skill.** Run `skilo publish` without logging in. You'll get an anonymous namespace and claim token.
2. **Save the token.** It's saved to `~/.skilo/claims/` and printed in the terminal.
3. **Log in and claim.** Run `skilo login your-name`, then claim ownership:

```
skilo claim @namespace/skill-name --token YOUR_TOKEN
```

After logging in you can also publish directly under your namespace without the anonymous claim flow.

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

## Privacy

Skills are published anonymously by default and stored as unlisted until you explicitly make them public. Skilo does not log IP addresses, user agents, or referrer data. All data is stored on Cloudflare D1 and R2.

## Rate limits

- Publishing — 50 req/hr per IP
- Sharing — 100 links/hr per IP
- Installing / resolving — 1,000 req/hr per IP
- Packing — 20 packs/hr per IP
- Password-protected links — 5 attempts/hr per link

Exceeded limits return `429` with a `retryAfter` value in seconds.
