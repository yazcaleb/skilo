import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CopyIcon } from "../components/icons";
import { api } from "../api/skilo";
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
  Vercel,
} from "@lobehub/icons";

const PRIMARY_BTN =
  "inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded text-[#0a1a1a] text-sm font-medium whitespace-nowrap bg-emerald-100 hover:bg-emerald-200/70 shadow-[0_2px_0_0_#6ee7b7] active:translate-y-px active:shadow-[0_1px_0_0_#34d399] transition-[transform,box-shadow,background-color] duration-75 cursor-pointer select-none";

type ResolvedLine = {
  ref: string;
  label: string;
  nav?: string;
};

function parseLine(raw: string): ResolvedLine | null {
  const trimmed = raw.trim().replace(/^[-*]\s+/, "");
  if (!trimmed) return null;

  const bare = trimmed.replace(/^https?:\/\/(www\.)?/, "");

  const skillMatch = bare.match(/^skilo\.xyz\/s\/([a-zA-Z0-9_-]+)/);
  if (skillMatch) {
    return {
      ref: `skilo.xyz/s/${skillMatch[1]}`,
      label: skillMatch[1],
      nav: `/s/${skillMatch[1]}`,
    };
  }

  const packMatch = bare.match(/^skilo\.xyz\/p\/([a-zA-Z0-9_-]+)/);
  if (packMatch) {
    return {
      ref: `skilo.xyz/p/${packMatch[1]}`,
      label: packMatch[1],
      nav: `/p/${packMatch[1]}`,
    };
  }

  const ghMatch = bare.match(
    /^github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?(?:\/tree\/[^/]+(?:\/(.+?))?)?(?:\/?$)/
  );
  if (ghMatch) {
    const [, org, repo, path] = ghMatch;
    if (path) {
      const clean = path.replace(/\/$/, "");
      return { ref: `${org}/${repo}:${clean}`, label: `${repo}/${clean}` };
    }
    return { ref: `${org}/${repo}`, label: `${org}/${repo}` };
  }

  const shMatch = bare.match(/^skills\.sh\/([^/\s]+)\/([^/\s]+)\/([^/\s]+)/);
  if (shMatch) return { ref: trimmed, label: shMatch[3] };

  const shortMatch = trimmed.match(
    /^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)@([a-zA-Z0-9_.-]+)$/
  );
  if (shortMatch) return { ref: trimmed, label: shortMatch[3] };

  return { ref: trimmed, label: trimmed };
}

function parseInput(raw: string): ResolvedLine[] {
  return raw
    .split(/\n/)
    .map((line) => parseLine(line))
    .filter((value): value is ResolvedLine => value !== null);
}

function shortLabel(ref: string): string {
  const at = ref.lastIndexOf("@");
  if (at > 0) return ref.slice(at + 1);
  const colon = ref.indexOf(":");
  if (colon > 0) {
    return ref
      .slice(ref.lastIndexOf("/", colon - 1) + 1)
      .replace(":", "/");
  }
  return ref;
}

interface PackResult {
  token: string;
  url: string;
  count: number;
  items: Array<{ ref: string; token: string; url: string }>;
}

function Landing() {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [installCopied, setInstallCopied] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [copied, setCopied] = useState(false);
  const [packing, setPacking] = useState(false);
  const [packResult, setPackResult] = useState<PackResult | null>(null);
  const [stats, setStats] = useState<{ skills: number; installs: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resolved = useMemo(() => parseInput(input), [input]);
  const isMulti = resolved.length > 1;
  const single = resolved.length === 1 ? resolved[0] : null;

  const singleCmd = useMemo(() => {
    if (resolved.length !== 1) return "";
    return `npx skilo-cli add ${resolved[0].ref}`;
  }, [resolved]);

  useEffect(() => {
    api.getStats().then((nextStats) => {
      if (nextStats.skills > 0 || nextStats.installs > 0) {
        setStats(nextStats);
      }
    });
  }, []);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`;
  }, [input]);

  useEffect(() => {
    setPackResult(null);
    setCopied(false);
  }, [input]);

  function handleSingleCopy() {
    navigator.clipboard.writeText(singleCmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handlePackCopy() {
    if (packing || resolved.length < 2) return;
    setPacking(true);
    try {
      const pack = await api.createRefPack(resolved.map((line) => line.ref));
      setPackResult({
        ...pack,
        items:
          pack.items ||
          resolved.map((line) => ({
            ref: line.ref,
            token: "",
            url: line.ref,
          })),
      });
      navigator.clipboard.writeText(`npx skilo-cli add ${pack.url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const fallback = `npx skilo-cli add ${resolved.map((line) => line.ref).join(" ")}`;
      navigator.clipboard.writeText(fallback);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } finally {
      setPacking(false);
    }
  }

  function handleInstallCopy() {
    navigator.clipboard.writeText("npx skilo-cli");
    setInstallCopied(true);
    setTimeout(() => setInstallCopied(false), 1500);
  }

  function handlePromptCopy() {
    navigator.clipboard.writeText(
      "Read https://skilo.xyz/llms.txt and share my skills with Skilo."
    );
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 1500);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (single?.nav) navigate(single.nav);
    else if (single) handleSingleCopy();
    else if (isMulti) handlePackCopy();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !input.includes("\n")) {
      event.preventDefault();
      if (single?.nav) navigate(single.nav);
      else if (single) handleSingleCopy();
    }
  }

  function reset() {
    setInput("");
    setPackResult(null);
    setCopied(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  return (
    <main className="flex max-w-[600px] mx-auto flex-col p-5 pb-20 pt-28 text-base lg:p-10 lg:pb-32 lg:pt-36">
      <h1 className="text-[22px] font-medium leading-snug tracking-[-0.02em] text-black">
        Share agent skills with a link
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-stone-600">
        Paste one skill, link, repo, or several lines to make a pack. Install anywhere in one command.
      </p>

      {!packResult ? (
        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Paste a skill, link, repo, or one per line to make a pack"
            className="w-full resize-none overflow-hidden rounded-lg border border-stone-200 bg-white px-4 py-3 text-[15px] leading-relaxed outline-none transition-colors placeholder:text-stone-400 focus:border-stone-400"
            autoComplete="off"
            autoFocus
            spellCheck={false}
            rows={1}
          />

          {single && single.nav && (
            <Link
              to={single.nav}
              className="text-sm font-medium text-emerald-600 transition-colors hover:text-emerald-700"
            >
              Open {single.nav.startsWith("/p/") ? "pack" : "skill"} &rarr;
            </Link>
          )}

          {single && !single.nav && (
            <div className="flex min-w-0 items-center gap-2">
              <code className="min-w-0 truncate rounded bg-stone-100 px-2.5 py-1.5 font-mono text-[13px]">
                {singleCmd}
              </code>
              <button type="button" onClick={handleSingleCopy} className={PRIMARY_BTN}>
                <CopyIcon className="h-4 w-4" />
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          )}

          {isMulti && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                {resolved.map((line, index) => (
                  <span
                    key={index}
                    className="rounded-full bg-stone-100 px-2 py-0.5 font-mono text-xs text-stone-500"
                  >
                    {line.label}
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={handlePackCopy}
                disabled={packing}
                className={PRIMARY_BTN}
              >
                {packing ? (
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <CopyIcon className="h-4 w-4" />
                )}
                {packing ? "Packing..." : `Pack ${resolved.length} & Copy`}
              </button>
            </div>
          )}
        </form>
      ) : (
        <div className="mt-6 flex flex-col gap-3 rounded-lg border border-stone-200 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-stone-800">
              {packResult.count} skill{packResult.count !== 1 ? "s" : ""} packed
            </span>
            <button
              onClick={reset}
              className="cursor-pointer text-xs text-stone-400 underline decoration-stone-300 underline-offset-2 transition-colors hover:text-stone-600"
            >
              Start over
            </button>
          </div>

          <div className="flex min-w-0 items-center gap-2">
            <code className="flex-1 min-w-0 truncate rounded bg-stone-100 px-2.5 py-1.5 font-mono text-[13px]">
              npx skilo-cli add {packResult.url}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(`npx skilo-cli add ${packResult.url}`);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className={PRIMARY_BTN}
            >
              <CopyIcon className="h-4 w-4" />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <div className="flex flex-col gap-0.5 border-t border-stone-100 pt-2">
            {packResult.items.map((item, index) => (
              <div key={index} className="flex items-center justify-between gap-4 py-0.5">
                <span className="truncate font-mono text-xs text-stone-400">
                  {shortLabel(item.ref)}
                </span>
                <Link
                  to={`/s/${item.token}`}
                  className="whitespace-nowrap font-mono text-xs text-stone-400 transition-colors hover:text-emerald-600"
                >
                  {item.url.replace("https://", "")}
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="button" onClick={handleInstallCopy} className={PRIMARY_BTN}>
          <CopyIcon className="h-4 w-4" />
          {installCopied ? "Copied" : <span className="font-mono">npx skilo-cli</span>}
        </button>
        <span className="text-stone-400">or just</span>
        <button type="button" onClick={handlePromptCopy} className={PRIMARY_BTN}>
          <CopyIcon className="h-4 w-4" />
          {promptCopied ? "Copied" : "Tell your agent"}
        </button>
      </div>

      {stats && (
        <p className="mt-4 text-xs tabular-nums text-stone-500">
          {stats.skills.toLocaleString()} skills shared
          <span className="mx-1.5 text-stone-400">/</span>
          {stats.installs.toLocaleString()} installs
        </p>
      )}

      <div className="mt-12">
        <video
          className="w-full rounded-xl"
          autoPlay
          loop
          muted
          playsInline
        >
          <source src="/demo.webm?v=2" type="video/webm" />
          <source src="/demo.mp4?v=2" type="video/mp4" />
        </video>
      </div>

      <div className="mt-14">
        <p className="mb-4 text-xs font-medium uppercase tracking-widest text-stone-400">
          Works with
        </p>
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
            <span key={name} className="flex items-center gap-1.5 text-stone-500">
              <Icon size={16} />
              <span className="text-xs">{name}</span>
            </span>
          ))}
          <span className="text-xs text-stone-400">+ more</span>
        </div>
        <p className="mt-4 flex items-center gap-1.5 text-xs text-stone-500">
          <Vercel size={12} /> Installs any <a href="https://skills.sh" target="_blank" rel="noopener noreferrer" className="underline decoration-stone-400/50 underline-offset-2 transition-[text-decoration-color] hover:decoration-stone-500">skills.sh</a> skill natively
        </p>
      </div>
    </main>
  );
}

export default Landing;
