import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
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

type Resolved =
  | { type: "skill"; token: string }
  | { type: "pack"; token: string }
  | { type: "cmd"; input: string };

function parseInput(raw: string): Resolved | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const bare = trimmed.replace(/^https?:\/\/(www\.)?/, "");

  const skillMatch = bare.match(/^(?:skilo\.xyz)?\/s\/([a-zA-Z0-9_-]+)/);
  if (skillMatch) return { type: "skill", token: skillMatch[1] };

  const packMatch = bare.match(/^(?:skilo\.xyz)?\/p\/([a-zA-Z0-9_-]+)/);
  if (packMatch) return { type: "pack", token: packMatch[1] };

  return { type: "cmd", input: trimmed };
}

function Landing() {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [installCopied, setInstallCopied] = useState(false);
  const [addCopied, setAddCopied] = useState(false);

  const resolved = useMemo(() => parseInput(input), [input]);

  function handleInstallCopy() {
    navigator.clipboard.writeText("npx skilo-cli");
    setInstallCopied(true);
    setTimeout(() => setInstallCopied(false), 1500);
  }

  function handleAddCopy() {
    if (resolved?.type !== "cmd") return;
    navigator.clipboard.writeText(`npx skilo-cli add ${resolved.input}`);
    setAddCopied(true);
    setTimeout(() => setAddCopied(false), 1500);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!resolved) return;
    if (resolved.type === "skill") navigate(`/s/${resolved.token}`);
    else if (resolved.type === "pack") navigate(`/p/${resolved.token}`);
    else handleAddCopy();
  }

  return (
      <main className="flex flex-col gap-4 max-w-[600px] mx-auto p-5 pt-28 pb-20 lg:p-10 lg:pt-32 lg:pb-32 leading-relaxed text-base">

        {/* ── Hero ── */}
        <p className="text-lg font-medium text-black tracking-[-0.01em]">
          Share agent skills with a link. No repo required.
        </p>

        {/* ── Paste box ── */}
        <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste a skill link, repo, or ref"
            className="w-full rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm outline-none focus:border-stone-400 placeholder:text-stone-400 transition-colors"
            autoComplete="off"
            spellCheck={false}
          />

          {resolved && (
            <div className="flex items-center gap-2 min-w-0">
              {resolved.type === "skill" && (
                <Link
                  to={`/s/${resolved.token}`}
                  className="text-sm font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
                >
                  Open skill &rarr;
                </Link>
              )}
              {resolved.type === "pack" && (
                <Link
                  to={`/p/${resolved.token}`}
                  className="text-sm font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
                >
                  Open pack &rarr;
                </Link>
              )}
              {resolved.type === "cmd" && (
                <>
                  <code className="rounded bg-stone-100 px-2.5 py-1.5 font-mono text-[13px] truncate min-w-0">
                    npx skilo-cli add {resolved.input}
                  </code>
                  <button type="button" onClick={handleAddCopy} className={PRIMARY_BTN}>
                    <CopyIcon className="h-4 w-4" />
                    {addCopied ? "Copied" : "Copy"}
                  </button>
                </>
              )}
            </div>
          )}
        </form>

        {/* ── CLI ── */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-stone-400">or run</span>
          <code className="rounded bg-stone-100 px-3 py-2 font-mono text-sm whitespace-nowrap">
            npx skilo-cli
          </code>
          <button type="button" onClick={handleInstallCopy} className={PRIMARY_BTN}>
            <CopyIcon className="h-4 w-4" />
            {installCopied ? "Copied" : "Copy"}
          </button>
        </div>

        <p className="text-xs text-stone-400">
          No account required.{" "}
          <Link to="/docs" className="underline decoration-stone-300 underline-offset-[2px] hover:decoration-stone-400 transition-[text-decoration-color]">
            Read the docs&nbsp;&rarr;
          </Link>
        </p>

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
                <span className="text-stone-200">npx skilo-cli share claude</span>
              </div>
              <div className="pl-4 text-emerald-400/70">&rarr; skilo.xyz/p/kX7mN2pQ</div>
              <div className="h-4" />
              <div>
                <span className="text-stone-600">$ </span>
                <span className="text-stone-200">skilo add skilo.xyz/p/kX7mN2pQ</span>
              </div>
              <div className="pl-4 text-stone-500">
                &#10003; Installed 3 skills into Codex
                <span className="cursor-blink ml-0.5 inline-block h-[14px] w-[2px] bg-stone-500 align-text-bottom" />
              </div>
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
