import { useState } from "react";
import { Link } from "react-router-dom";
import { CopyIcon } from "../components/icons";
import {
  Claude,
  Codex,
  Cursor,
  Amp,
  Windsurf,
  OpenCode,
  Cline,
  RooCode,
  OpenClaw,
} from "@lobehub/icons";

const PRIMARY_BTN = "inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded text-[#0a1a1a] text-sm font-medium whitespace-nowrap bg-emerald-100 shadow-[0_2px_0_0_#6ee7b7] active:translate-y-px active:shadow-[0_1px_0_0_#34d399] transition-[transform,box-shadow] duration-75 cursor-pointer select-none";

function Landing() {
  const [installCopied, setInstallCopied] = useState(false);

  function handleInstallCopy() {
    navigator.clipboard.writeText("npx skilo-cli");
    setInstallCopied(true);
    setTimeout(() => setInstallCopied(false), 1500);
  }

  return (
      <main className="flex flex-col gap-4 max-w-[600px] mx-auto p-5 pt-28 pb-20 lg:p-10 lg:pt-32 lg:pb-32 leading-relaxed text-base">

        {/* ── Hero ── */}
        <div className="flex flex-col gap-2">
          <p className="text-lg font-medium text-black tracking-[-0.01em]">
            Share agent skills with a link. No repo required.
          </p>
          <p className="text-stone-500">
            Skilo turns any <code className="rounded bg-stone-100 px-1 py-0.5 font-mono text-[13px]">SKILL.md</code> folder into a link or pack, then routes installs into the right tool for humans and agents.
          </p>

          <div className="mt-3 flex items-center gap-3">
            <div className="flex items-center gap-2">
              <code className="rounded bg-stone-100 px-3 py-2 font-mono text-sm whitespace-nowrap">
                npx skilo-cli
              </code>
              <button type="button" onClick={handleInstallCopy} className={PRIMARY_BTN}>
                <CopyIcon className="h-4 w-4" />
                {installCopied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          <p className="text-xs text-stone-400 mt-1">
            First successful interactive runs bootstrap the global <code className="rounded bg-stone-100 px-1 py-0.5 font-mono text-[11px]">skilo</code> binary. No account required.{" "}
            <Link to="/docs" className="underline decoration-stone-300 underline-offset-[2px] hover:decoration-stone-400 transition-[text-decoration-color]">
              Read the docs&nbsp;&rarr;
            </Link>
          </p>
        </div>

        {/* ── Terminal ── */}
        <div className="mt-6">
          <div className="overflow-hidden rounded-xl border border-stone-800/80 shadow-lg shadow-stone-900/5">
            <div className="flex items-center gap-1.5 border-b border-stone-800/60 bg-stone-900 px-4 py-2.5">
              <div className="h-2.5 w-2.5 rounded-full bg-stone-700" />
              <div className="h-2.5 w-2.5 rounded-full bg-stone-700" />
              <div className="h-2.5 w-2.5 rounded-full bg-stone-700" />
            </div>
            <div className="bg-stone-950 px-5 py-5 font-mono text-[13px] leading-6">
              <div>
                <span className="text-stone-600">$ </span>
                <span className="text-stone-200">npx skilo-cli share ./code-reviewer</span>
              </div>
              <div className="pl-4 text-emerald-400/70">&rarr; skilo.xyz/s/a3xK9mP2</div>
              <div className="h-4" />
              <div>
                <span className="text-stone-600">$ </span>
                <span className="text-stone-200">skilo add skilo.xyz/s/a3xK9mP2</span>
              </div>
              <div className="pl-4 text-stone-500">
                &#10003; Detected Codex, installed code-reviewer
              </div>
              <div className="h-4" />
              <div>
                <span className="text-stone-600">$ </span>
                <span className="text-stone-200">skilo pack ./reviewer flrabbit/original-landing-page-builder --name &quot;Starter pack&quot;</span>
              </div>
              <div className="pl-4 text-emerald-400/70">
                &rarr; skilo.xyz/p/abc123
                <span className="cursor-blink ml-0.5 inline-block h-[14px] w-[2px] bg-stone-500 align-text-bottom" />
              </div>
            </div>
          </div>
        </div>

        {/* ── Features ── */}
        <div className="mt-8 flex flex-col gap-5">
          <p className="font-medium">How it works</p>

          <div className="flex flex-col gap-4">
            <div>
              <p className="text-sm">
                <span className="font-medium">Share</span>
              </p>
              <p className="text-stone-500 text-sm mt-1">
                <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">skilo share &lt;path&gt;</code> publishes any SKILL.md directory and returns a link. Add <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">--password</code>, <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">--expires</code>, or <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">--one-time</code> for access control.
              </p>
            </div>

            <div>
              <p className="text-sm">
                <span className="font-medium">Add</span>
              </p>
              <p className="text-stone-500 text-sm mt-1">
                <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">skilo add &lt;link|ref|repo&gt;</code> downloads, verifies, auto-detects installed tools, and installs into the right place. Run <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">skilo inspect</code> first when you want a preflight.
              </p>
            </div>

            <div>
              <p className="text-sm">
                <span className="font-medium">Pack</span>
              </p>
              <p className="text-stone-500 text-sm mt-1">
                <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">skilo pack</code> bundles a curated set of skills into one link so a person or agent can install a whole setup in one command.
              </p>
            </div>

            <div>
              <p className="text-sm">
                <span className="font-medium">Inputs that just work</span>
              </p>
              <p className="text-stone-500 text-sm mt-1">
                Links, packs, registry refs, GitHub repos, bundles, and local paths all resolve through the same <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">skilo add</code> flow. Humans can start with <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">npx skilo-cli</code>. Agents can start with <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">npx skilo-cli --json</code> or just fetch the root site.
              </p>
            </div>
          </div>
        </div>

        {/* ── Supported tools ── */}
        <div className="mt-10">
          <p className="text-xs font-medium uppercase tracking-widest text-stone-400 mb-4">Works with</p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            {[
              { Icon: Claude, name: "Claude Code" },
              { Icon: Codex, name: "Codex" },
              { Icon: Cursor, name: "Cursor" },
              { Icon: Amp, name: "Amp" },
              { Icon: Windsurf, name: "Windsurf" },
              { Icon: OpenCode, name: "OpenCode" },
              { Icon: Cline, name: "Cline" },
              { Icon: RooCode, name: "Roo" },
              { Icon: OpenClaw, name: "OpenClaw" },
            ].map(({ Icon, name }) => (
              <span key={name} className="flex items-center gap-1.5 text-stone-400">
                <Icon size={16} />
                <span className="text-xs">{name}</span>
              </span>
            ))}
            <span className="text-xs text-stone-300">and more</span>
          </div>
        </div>
      </main>
  );
}

export default Landing;
