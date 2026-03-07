import { useState } from "react";
import { Link } from "react-router-dom";
import { SkiloMark, CopyIcon, ExternalLinkIcon, HamburgerIcon } from "../components/icons";

// ─── Tokens ──────────────────────────────────────────────────────────────────

const NAV_LINK = "text-sm underline decoration-stone-400/50 underline-offset-[2.5px] hover:decoration-stone-500 transition-[text-decoration-color] duration-150";
const PRIMARY_BTN = "inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded text-[#0a1a1a] text-sm font-medium whitespace-nowrap bg-emerald-100 shadow-[0_2px_0_0_#6ee7b7] active:translate-y-px active:shadow-[0_1px_0_0_#34d399] transition-[transform,box-shadow] duration-75 cursor-pointer select-none";
const FOOTER_LINK = "text-sm underline decoration-stone-400/50 underline-offset-[2.5px] hover:decoration-stone-500 transition-[text-decoration-color] duration-150";

// ─── Data ─────────────────────────────────────────────────────────────────────

const COPY_CMD = `npx skilo-cli share ./my-skill\nnpx skilo-cli add https://skilo.xyz/s/abc123`;

// ─── Page ─────────────────────────────────────────────────────────────────────

function Landing() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [terminalCopied, setTerminalCopied] = useState(false);
  const [installCopied, setInstallCopied] = useState(false);

  function handleTerminalCopy() {
    navigator.clipboard.writeText(COPY_CMD);
    setTerminalCopied(true);
    setTimeout(() => setTerminalCopied(false), 1500);
  }

  function handleInstallCopy() {
    navigator.clipboard.writeText("npm i -g skilo-cli");
    setInstallCopied(true);
    setTimeout(() => setInstallCopied(false), 1500);
  }

  return (
    <>
      {/* ── Header ── */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3 lg:px-10 lg:py-4">
          <a href="/" className="flex items-center gap-2 font-medium">
            <SkiloMark className="h-5 w-5" />
            Skilo
          </a>

          <div className="flex items-center gap-4 sm:gap-8">
            <span className="hidden items-center gap-4 text-sm sm:flex">
              <Link to="/docs" className={NAV_LINK}>Docs</Link>
              <a
                href="https://github.com/yazcaleb/skilo"
                className={NAV_LINK}
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
                <ExternalLinkIcon className="ml-1 inline-block h-3 w-3 align-baseline" />
              </a>
            </span>

            <a href="/claim" className={PRIMARY_BTN}>
              Claim a skill
            </a>

            <button
              className="-mr-2 p-2 sm:hidden"
              aria-label="Toggle menu"
              onClick={() => setMobileMenuOpen((v) => !v)}
            >
              <HamburgerIcon />
            </button>
          </div>
        </nav>

        {mobileMenuOpen && (
          <div className="border-t border-stone-100 bg-white px-5 pb-4 sm:hidden">
            <nav className="flex flex-col gap-3 pt-3 text-sm">
              <Link to="/docs" className={NAV_LINK} onClick={() => setMobileMenuOpen(false)}>Docs</Link>
              <a
                href="https://github.com/yazcaleb/skilo"
                className={NAV_LINK}
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
                <ExternalLinkIcon className="ml-1 inline-block h-3 w-3 align-baseline" />
              </a>
              <a href="/claim" className={NAV_LINK} onClick={() => setMobileMenuOpen(false)}>Claim a skill</a>
            </nav>
          </div>
        )}
      </header>

      {/* ── Main ── */}
      <main className="flex flex-col gap-4 max-w-[600px] mx-auto p-5 pt-28 pb-20 lg:p-10 lg:pt-32 lg:pb-32 leading-relaxed text-base">

        {/* ── Hero ── */}
        <div className="flex flex-col gap-2">
          <p className="text-lg font-medium text-black tracking-[-0.01em]">
            Instant skill handoff.
          </p>
          <p className="text-stone-500">
            Share a skill between agents or people with a link, code, or&nbsp;file.
          </p>

          <div className="mt-2 flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <a href="#get-started" className={PRIMARY_BTN}>
                Install CLI
              </a>
              <span className="text-sm text-stone-400">or</span>
              <button
                type="button"
                onClick={handleInstallCopy}
                className="flex cursor-pointer items-center gap-2 rounded bg-stone-100 px-3 py-2 font-mono text-sm whitespace-nowrap transition-colors hover:bg-stone-200 active:bg-stone-300"
              >
                <span>{installCopied ? "Copied!" : "npm i -g skilo-cli"}</span>
                <CopyIcon className="h-4 w-4 text-stone-500 shrink-0" />
              </button>
            </div>

            <p className="text-xs text-stone-400">
              No signup required for basic sharing. Made by an agent or a human.
            </p>
          </div>
        </div>

        {/* ── Terminal demo ── */}
        <div className="mt-6" id="get-started">
          <div className="overflow-hidden rounded-xl border border-stone-800/80 shadow-lg shadow-stone-900/5">
            <div className="flex items-center justify-between border-b border-stone-800/60 bg-stone-900 px-4 py-2.5">
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-stone-700" />
                <div className="h-2.5 w-2.5 rounded-full bg-stone-700" />
                <div className="h-2.5 w-2.5 rounded-full bg-stone-700" />
              </div>
              <button
                type="button"
                onClick={handleTerminalCopy}
                className="flex cursor-pointer items-center gap-1.5 text-xs text-stone-500 transition-colors duration-150 hover:text-stone-300"
              >
                <CopyIcon className="h-3.5 w-3.5" />
                {terminalCopied ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="bg-stone-950 px-5 py-5 font-mono text-[13px] leading-6">
              <div>
                <span className="text-stone-600">$ </span>
                <span className="text-stone-200">npx skilo-cli share ./my-skill</span>
              </div>
              <div className="pl-4 text-emerald-400/70">&rarr; skilo.xyz/s/abc123</div>
              <div className="h-4" />
              <div>
                <span className="text-stone-600">$ </span>
                <span className="text-stone-200">npx skilo-cli add https://skilo.xyz/s/abc123</span>
              </div>
              <div className="pl-4 text-stone-500">
                Skill installed.
                <span className="cursor-blink ml-0.5 inline-block h-[14px] w-[2px] bg-stone-500 align-text-bottom" />
              </div>
            </div>
          </div>
        </div>

        {/* ── Features ── */}
        <div className="mt-8 flex flex-col gap-4">
          <p className="font-medium">How it works</p>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            <li>
              <span className="font-medium">Share.</span> Create a link, code, or file from any skill in seconds. No account needed.
            </li>
            <li>
              <span className="font-medium">Install.</span> Hand skills between agents and people with one command, anywhere.
            </li>
            <li>
              <span className="font-medium">Trust.</span> Inspect and verify exactly what runs before you add it.
            </li>
          </ul>

          <p className="font-medium">What you can share</p>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            <li>Claude Code skills and custom slash commands</li>
            <li>Agent workflows and tool configurations</li>
            <li>Reusable prompts and system instructions</li>
            <li>MCP server setups and integrations</li>
          </ul>
        </div>

        {/* ── Bottom CTA ── */}
        <p className="mt-8 text-stone-500">
          Open source. MIT licensed. Built for the agent ecosystem.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <p className="text-black">Ready to share your first skill?</p>
          <a href="#get-started" className={`${PRIMARY_BTN} w-fit`}>
            Install CLI
          </a>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-2 p-5 pt-0 text-sm text-stone-500 lg:p-10 lg:pt-0">
        <Link to="/docs" className={FOOTER_LINK}>Docs</Link>
        <a
          href="https://github.com/yazcaleb/skilo"
          className={FOOTER_LINK}
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
          <ExternalLinkIcon className="ml-1 inline-block h-3 w-3 align-baseline" />
        </a>
      </footer>
    </>
  );
}

export default Landing;
