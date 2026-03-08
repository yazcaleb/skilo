# Changelog

> All notable changes to Skilo, generated from the commit history.

## 2026-03-08

### Changed

- Wire pack subset API to selection UI (`56b18da`)
- Bump body text contrast from stone-500 to stone-600 (`f2c68b2`)
- Redesign skill and pack pages (`40eb931`)
- Auto-refresh the Skilo CLI bootstrap (`0ec39ce`)
- Streamline auth and publish visibility (`0912b50`)
- Polish changelog styling and ignore Wrangler state (`093c902`)
- Streamline add flow and install detection (`e09ee48`)
- Stabilize generated changelog (`a3db895`)
- Extract shared Layout for consistent header/footer (`a101bed`)
- Polish repo metadata and contribution docs (`4754c7e`)
- Serve markdown by default for agent fetches (`6d1a955`)
- Align site onboarding with npx bootstrap (`03b8494`)
- Auto-install CLI after npx bootstrap (`1e753c5`)
- Simplify terminal demo, add react-grab dev tool (`1e88b7d`)
- Improve agent-first CLI UX (`f1bfe63`)
- Auto-serve markdown to LLMs via Pages Function (`2b74a8a`)
- Improve agent and zero-arg entrypoints (`6dc1cda`)
- Refine CLI output for humans and agents (`54b537c`)
- Redesign site with stone/emerald aesthetic (`2f62ef3`)
- Point site API to stable worker host (`f86e6ea`)
- Use stable worker host for CLI API default (`2422692`)
- Rename CLI package back to skilo-cli (`9354d95`)
- Redesign landing page with ami-inspired minimal layout (`5ef64f9`)
- Update site with npm install instructions (`e24419b`)
- Publish skilo-cli@1.0.0 to npm (`4d151cf`)
- Prepare cli package for npm publish (`1fdfdbd`)

### Added

- Add subset-aware pack installs (`fe66443`)
- Add tool-to-tool skill sync flows (`919140b`)
- Add first-class curated skill packs (`c33436b`)
- Add Vercel-style repo skill compatibility (`89cce5f`)
- Add syntax highlighting for code blocks (`81c267c`)
- Add auto-generated changelog page (`7daab58`)
- Add supported tool icons to landing page (`0c967e6`)
- Add llmstxt.org-compatible markdown for all pages (`9cfcf4e`)
- Add emerald accent to logo, fix favicon/OG/metadata (`d8516df`)
- Add llms.txt and official Skilo skill (`e92d686`)
- Support native installs for all tools (`70273cd`)
- Add explicit agent install targets (`abefba0`)
- Support share URLs and refs in add/import (`c56b5a2`)
- Add skill packs and scope CLI package (`8e440aa`)
- Add comprehensive README with install docs (`6f3d192`)
- Add Skilo v2: web presence, enhanced sharing, import/export, signing (`1dbfbc8`)
- Add short memorable anon names (2-letter prefix + noun) (`4b5bb0b`)
- Add anon publishing with claim tokens (`07cd2ce`)
- Add publishing lifecycle, trust & ops commands (`5406ccf`)

### Removed

- Remove llms.txt badge from landing page (`55fefe6`)
- Remove dot separator from anon names (ancat not an.cat) (`2003234`)

### Fixed

- Fix share flow end to end (`459c3de`)
- Fix npm package metadata for CLI publish (`75b695f`)
- Fix CLI share launcher and local skill support (`8adf6c0`)

## 2026-03-07

### Changed

- Initial commit: skilo - npm-like registry for Agent Skills (`9a98e05`)

