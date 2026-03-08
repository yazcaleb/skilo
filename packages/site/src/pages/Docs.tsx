import { CopyIcon } from "../components/icons";
import { useState } from "react";

function Code({ children, copy }: { children: string; copy?: boolean }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (copy) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">{children}</code>
        <button type="button" onClick={handleCopy} className="text-stone-400 hover:text-stone-600 transition-colors">
          <CopyIcon className="h-3.5 w-3.5" />
        </button>
        {copied && <span className="text-xs text-stone-400">Copied</span>}
      </span>
    );
  }

  return <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">{children}</code>;
}

function Terminal({ lines }: { lines: { cmd?: string; out?: string }[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-stone-800/80 shadow-lg shadow-stone-900/5 my-3">
      <div className="flex items-center gap-1.5 border-b border-stone-800/60 bg-stone-900 px-4 py-2.5">
        <div className="h-2.5 w-2.5 rounded-full bg-stone-700" />
        <div className="h-2.5 w-2.5 rounded-full bg-stone-700" />
        <div className="h-2.5 w-2.5 rounded-full bg-stone-700" />
      </div>
      <div className="bg-stone-950 px-5 py-4 font-mono text-[13px] leading-6">
        {lines.map((line, i) => (
          <div key={i}>
            {line.cmd !== undefined && (
              <div>
                <span className="text-stone-600">$ </span>
                <span className="text-stone-200">{line.cmd}</span>
              </div>
            )}
            {line.out !== undefined && (
              <div className="text-stone-500 pl-4">{line.out}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Docs() {
  return (
      <main className="flex flex-col gap-6 max-w-[600px] mx-auto p-5 pt-28 pb-20 lg:p-10 lg:pt-32 lg:pb-32 leading-relaxed text-base">

        <p className="text-lg font-medium text-black tracking-[-0.01em]">
          Documentation
        </p>

        {/* ── Quick start ── */}
        <section className="flex flex-col gap-2">
          <p className="font-medium">Quick start</p>
          <p className="text-stone-500">
            Start with npx. The first successful interactive run also installs the global <Code>skilo</Code> binary for later use.
          </p>
          <Terminal lines={[
            { cmd: "npx skilo-cli share ./code-reviewer" },
            { out: "\u2192 skilo.xyz/s/a3xK9mP2" },
            { cmd: "skilo add skilo.xyz/s/a3xK9mP2" },
            { out: "\u2713 Installed code-reviewer" },
          ]} />
          <p className="text-stone-500">
            No account required. Skills are published anonymously by default. You can claim them later with <Code>skilo claim</Code>.
          </p>
          <p className="text-stone-500">
            Agents should prefer <Code copy>npx skilo-cli --json</Code> or <Code copy>https://skilo.xyz/llms.txt</Code>.
          </p>
        </section>

        {/* ── CLI commands ── */}
        <section className="flex flex-col gap-3 mt-4">
          <p className="font-medium">CLI commands</p>

          <div className="flex flex-col gap-4">
            <div>
              <p className="text-sm">
                <Code>skilo share &lt;path&gt;</Code>
              </p>
              <p className="text-stone-500 text-sm mt-1">
                Create a shareable link for a local skill directory. Publishes the skill and returns a URL.
              </p>
              <ul className="text-stone-500 text-sm list-disc pl-5 mt-1 flex flex-col gap-0.5">
                <li><Code>--one-time</Code> &mdash; link expires after first use</li>
                <li><Code>--expires 2h</Code> &mdash; auto-expire after a duration (m, h, d)</li>
                <li><Code>--uses 5</Code> &mdash; limit total downloads</li>
                <li><Code>--password</Code> &mdash; require a password to access</li>
              </ul>
            </div>

            <div>
              <p className="text-sm">
                <Code>skilo share &lt;tool&gt;</Code>
              </p>
              <p className="text-stone-500 text-sm mt-1">
                Share all skills from an AI tool at once. Supported tools: <Code>claude</Code>, <Code>codex</Code>, <Code>cursor</Code>, <Code>opencode</Code>, <Code>amp</Code>, <Code>windsurf</Code>, <Code>cline</Code>, <Code>roo</Code>, or <Code>all</Code>.
              </p>
              <ul className="text-stone-500 text-sm list-disc pl-5 mt-1 flex flex-col gap-0.5">
                <li><Code>-y</Code> &mdash; skip interactive selection, share everything</li>
              </ul>
            </div>

            <div>
              <p className="text-sm">
                <Code>skilo add &lt;skill&gt;</Code>
              </p>
              <p className="text-stone-500 text-sm mt-1">
                Install a skill. Accepts a share URL, namespace/name, .skl file, or GitHub URL.
              </p>
            </div>

            <div>
              <p className="text-sm">
                <Code>skilo publish</Code>
              </p>
              <p className="text-stone-500 text-sm mt-1">
                Publish the current directory to the registry. Reads SKILL.md for metadata.
              </p>
            </div>

            <div>
              <p className="text-sm">
                <Code>skilo search &lt;query&gt;</Code>
              </p>
              <p className="text-stone-500 text-sm mt-1">
                Search the registry for skills by name or description.
              </p>
            </div>

            <div>
              <p className="text-sm">
                <Code>skilo inspect &lt;skill&gt;</Code>
              </p>
              <p className="text-stone-500 text-sm mt-1">
                View a skill's SKILL.md, checksum, and metadata without installing.
              </p>
            </div>

            <div>
              <p className="text-sm">
                <Code>skilo export</Code> / <Code>skilo import &lt;source&gt;</Code>
              </p>
              <p className="text-stone-500 text-sm mt-1">
                Export to a .skl file for offline sharing, or import from a .skl file, GitHub repo, or local path.
              </p>
            </div>
          </div>
        </section>

        {/* ── SKILL.md ── */}
        <section className="flex flex-col gap-2 mt-4">
          <p className="font-medium">SKILL.md format</p>
          <p className="text-stone-500">
            Every skill is a directory with a SKILL.md file. The file uses YAML frontmatter for metadata and markdown for the skill content.
          </p>
          <Terminal lines={[
            { out: "---" },
            { out: "name: my-skill" },
            { out: "description: What this skill does" },
            { out: "version: 0.1.0" },
            { out: "author: your-name" },
            { out: "---" },
            { out: "" },
            { out: "# my-skill" },
            { out: "" },
            { out: "Instructions for the agent..." },
          ]} />
          <p className="text-stone-500">
            Fields: <Code>name</Code> and <Code>description</Code> are required. <Code>version</Code>, <Code>author</Code>, <Code>homepage</Code>, <Code>repository</Code>, and <Code>keywords</Code> are optional.
          </p>
        </section>

        {/* ── Trust ── */}
        <section className="flex flex-col gap-2 mt-4">
          <p className="font-medium">Trust and verification</p>
          <p className="text-stone-500">
            Every published skill has a SHA-256 checksum. The CLI verifies integrity on install.
          </p>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-stone-500">
            <li><span className="font-medium text-black">Anonymous</span> &mdash; published without an account. Inspect before installing.</li>
            <li><span className="font-medium text-black">Claimed</span> &mdash; a user has claimed ownership with <Code>skilo claim</Code>.</li>
            <li><span className="font-medium text-black">Verified</span> &mdash; publisher identity confirmed. Skill is cryptographically signed.</li>
          </ul>
          <p className="text-stone-500">
            Use <Code>skilo inspect</Code> to review a skill's content and checksum before you install.
          </p>
        </section>

        {/* ── Tool directories ── */}
        <section className="flex flex-col gap-2 mt-4">
          <p className="font-medium">Supported tools</p>
          <p className="text-stone-500">
            Skilo discovers skills from these directories:
          </p>
          <div className="overflow-x-auto">
            <table className="text-sm w-full">
              <thead>
                <tr className="border-b border-stone-200">
                  <th className="text-left py-2 pr-4 font-medium text-black">Tool</th>
                  <th className="text-left py-2 font-medium text-black">Directory</th>
                </tr>
              </thead>
              <tbody className="text-stone-500">
                <tr className="border-b border-stone-100"><td className="py-1.5 pr-4">Claude Code</td><td className="py-1.5 font-mono text-[13px]">~/.claude/skills/</td></tr>
                <tr className="border-b border-stone-100"><td className="py-1.5 pr-4">Codex</td><td className="py-1.5 font-mono text-[13px]">~/.agents/skills/, ~/.codex/skills/</td></tr>
                <tr className="border-b border-stone-100"><td className="py-1.5 pr-4">Cursor</td><td className="py-1.5 font-mono text-[13px]">~/.cursor/skills/</td></tr>
                <tr className="border-b border-stone-100"><td className="py-1.5 pr-4">Amp</td><td className="py-1.5 font-mono text-[13px]">~/.config/agents/skills/</td></tr>
                <tr className="border-b border-stone-100"><td className="py-1.5 pr-4">Windsurf</td><td className="py-1.5 font-mono text-[13px]">~/.codeium/windsurf/skills/</td></tr>
                <tr className="border-b border-stone-100"><td className="py-1.5 pr-4">OpenCode</td><td className="py-1.5 font-mono text-[13px]">~/.config/opencode/skills/</td></tr>
                <tr className="border-b border-stone-100"><td className="py-1.5 pr-4">Cline</td><td className="py-1.5 font-mono text-[13px]">~/.cline/skills/</td></tr>
                <tr className="border-b border-stone-100"><td className="py-1.5 pr-4">Roo</td><td className="py-1.5 font-mono text-[13px]">~/.roo/skills/</td></tr>
                <tr><td className="py-1.5 pr-4">OpenClaw</td><td className="py-1.5 font-mono text-[13px]">~/.openclaw/skills/</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      </main>
  );
}

export default Docs;
