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
            Skill handoff for humans and agents.
          </p>
          <p className="text-stone-500">
            Share a skill, install it into the right tool, or point an agent at Skilo and let it figure out the next step quickly.
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
                &#10003; Installed code-reviewer
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
                <span className="font-medium">Install</span>
              </p>
              <p className="text-stone-500 text-sm mt-1">
                <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">skilo add &lt;link&gt;</code> downloads, verifies the SHA-256 checksum, and installs. Run <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">skilo inspect</code> to review content before installing.
              </p>
            </div>

            <div>
              <p className="text-sm">
                <span className="font-medium">Route automatically</span>
              </p>
              <p className="text-stone-500 text-sm mt-1">
                <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">skilo add</code> and <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">skilo import</code> accept links, refs, bundles, GitHub sources, and local paths. Use target flags like <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">--cc</code>, <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">--codex</code>, or <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">--oc</code> to land in the right tool.
              </p>
            </div>

            <div>
              <p className="text-sm">
                <span className="font-medium">Start cleanly</span>
              </p>
              <p className="text-stone-500 text-sm mt-1">
                Humans can start with <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">npx skilo-cli</code>. Agents should use <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">npx skilo-cli --json</code> or read <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">/llms.txt</code>.
              </p>
            </div>

            <div>
              <p className="text-sm">
                <span className="font-medium">Scale up</span>
              </p>
              <p className="text-stone-500 text-sm mt-1">
                <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">skilo share claude</code> discovers and shares every skill from a tool at once. It also supports <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">cursor</code>, <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">codex</code>, <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">amp</code>, and the rest of the native directory matrix.
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
