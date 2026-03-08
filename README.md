# Skilo

Skilo is a tiny sharing layer for agent skills. Turn a `SKILL.md` folder into a link, then install it into Claude Code, Codex, Cursor, Amp, Windsurf, OpenCode, Cline, Roo, OpenClaw, and other agents with one command.

[![npm version](https://badge.fury.io/js/skilo-cli.svg)](https://www.npmjs.com/package/skilo-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

```
$ npx skilo-cli share ./my-skill
🔗 https://skilo.xyz/s/a3xK9mP2

$ npx skilo-cli add https://skilo.xyz/s/a3xK9mP2
✓ Installed @anonymous/my-skill
```

## Why Skilo?

Current skill sharing usually means repos, manifests, or manual copy-paste. Skilo keeps the social layer simple: send a skill like a link, not like a project.

**The difference from Vercel's skills.sh:** While skills.sh is discovery-focused with leaderboards, Skilo is transfer-focused. It's the obvious answer for sharing a skill directly when there is no repo flow, no team manifest, and no desire to sign up first.

## Features

- **⚡ Share instantly** - Create a link in seconds, no registration required
- **🌐 Install anywhere** - Add into Claude Code, Codex, Cursor, Amp, Windsurf, OpenCode, Cline, Roo, or OpenClaw with explicit target flags
- **🔒 Trust what you install** - Inspect, verify checksums, then add with confidence
- **⏱️ Expiring links** - One-time use, time-limited, or max-uses links
- **🔐 Password protection** - Extra security for sensitive skills
- **✍️ Signed bundles** - Ed25519 signatures for verified publishers

## Quick Start

### Install

```bash
npm install -g skilo-cli
# or use without installing:
npx skilo-cli <command>
```

### Share a skill

```bash
# Basic share
skilo share ./my-skill

# One-time link (expires after first use)
skilo share ./my-skill --one-time

# Expires in 1 hour
skilo share ./my-skill --expires 1h

# Max 5 uses
skilo share ./my-skill --uses 5

# Password protected
skilo share ./my-skill --password
```

### Install a skill

```bash
# From a share link into Claude Code
skilo add https://skilo.xyz/s/a3xK9mP2 --cc

# Into OpenCode
skilo add https://skilo.xyz/s/a3xK9mP2 --oc

# Into Codex, Cursor, and Roo
skilo add https://skilo.xyz/s/a3xK9mP2 --codex --cursor --roo

# From namespace/name
skilo add namespace/skill-name

# From GitHub
skilo import github:user/repo

# From .skl file
skilo import ./skill.skl
```

### Inspect before installing

```bash
skilo inspect https://skilo.xyz/s/a3xK9mP2
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `skilo share <path>` | Create a shareable link |
| `skilo add <skill>` | Install a skill from a share link, registry ref, or other source |
| `skilo inspect <skill>` | View skill details without installing |
| `skilo export [path]` | Export to .skl file |
| `skilo import <source>` | Import from GitHub, .skl, or local path |
| `skilo publish [path]` | Publish to the registry |
| `skilo init [name]` | Create a new skill |
| `skilo validate` | Validate SKILL.md |

## Supported Tools

Skilo installs into these native skill directories:

| Tool | Directory |
|------|-----------|
| Claude Code | `~/.claude/skills/` |
| Codex | `~/.agents/skills/`, `~/.codex/skills/` |
| Cursor | `~/.cursor/skills/` |
| Amp | `~/.config/agents/skills/` |
| Windsurf | `~/.codeium/windsurf/skills/` |
| OpenCode | `~/.config/opencode/skills/` |
| Cline | `~/.cline/skills/` |
| Roo | `~/.roo/skills/` |
| OpenClaw | `~/.openclaw/skills/` |

## .skl File Format

.skl files are signed, compressed bundles for offline sharing:

```
skill.skl (tar.gz)
├── SKILL.md           # Required manifest
├── index.js           # Entry point
├── src/               # Source files
└── .skilo-manifest    # Signature + metadata
```

## Trust & Verification

Skilo uses multiple mechanisms to help you trust what you install:

- **Anonymous** - Skills published without authentication. Safe to try in isolated environments.
- **Claimed** - A user has claimed ownership of an anonymous skill.
- **Verified** - Publisher identity has been confirmed via email or GitHub.

All skills have SHA-256 checksums. Verified skills are also cryptographically signed with Ed25519.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────┐
│   skilo.xyz     │────▶│ skilo API Worker │────▶│   D1    │
│  (Cloudflare    │     │  (Cloudflare     │     │  (SQL)  │
│   Pages)        │◀────│   Worker)        │◀────├─────────┤
└─────────────────┘     └──────────────────┘     │   R2    │
                                                  │(Bundles)│
                                                  ├─────────┤
                                                  │   KV    │
                                                  │(Cache)  │
                                                  └─────────┘
```

## Self-Hosting

Skilo is fully open source and can be self-hosted:

```bash
# 1. Clone the repo
git clone https://github.com/yazcaleb/skilo.git
cd skilo

# 2. Create Cloudflare resources
pnpm dlx wrangler d1 create skilo
pnpm dlx wrangler r2 bucket create skilo-bundles
pnpm dlx wrangler kv namespace create "SKILLPACK_KV"

# 3. Update wrangler.toml with your IDs

# 4. Push schema to D1
pnpm dlx wrangler d1 execute skilo --file=schema.sql --remote

# 5. Deploy
pnpm --filter @skilo/api deploy
pnpm --filter @skilo/site deploy
```

## Contributing

Contributions welcome! Please read our [Contributing Guide](CONTRIBUTING.md).

## License

MIT © [yazcaleb](https://github.com/yazcaleb)
