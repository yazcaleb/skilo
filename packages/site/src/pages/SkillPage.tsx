import { useParams, Link } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { marked } from "marked";
import { CopyIcon } from "../components/icons";
import { api } from "../api/skilo";
import type { SkillMetadata } from "../api/skilo";

const NAV_LINK = "text-sm underline decoration-stone-400/50 underline-offset-[2.5px] hover:decoration-stone-500 transition-[text-decoration-color] duration-150";
const PRIMARY_BTN = "inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded text-[#0a1a1a] text-sm font-medium whitespace-nowrap bg-emerald-100 shadow-[0_2px_0_0_#6ee7b7] active:translate-y-px active:shadow-[0_1px_0_0_#34d399] transition-[transform,box-shadow] duration-75 cursor-pointer select-none";
const MAIN = "flex flex-col gap-4 max-w-[600px] mx-auto p-5 pt-28 pb-20 lg:p-10 lg:pt-32 lg:pb-32 leading-relaxed text-base";

function SkillPage() {
  const { token } = useParams<{ token: string }>();
  const [skill, setSkill] = useState<SkillMetadata | null>(null);
  const [password, setPassword] = useState("");
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [contentOpen, setContentOpen] = useState(false);
  const [contentLoading, setContentLoading] = useState(false);
  const [skillContent, setSkillContent] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Invalid share link");
      setLoading(false);
      return;
    }

    api
      .resolveShare(token)
      .then((data) => {
        if (data.requiresPassword) {
          setRequiresPassword(true);
        } else {
          setSkill(data.skill);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load skill"))
      .finally(() => setLoading(false));
  }, [token]);

  const handleVerifyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    try {
      setVerifying(true);
      setError(null);
      const verifiedSkill = await api.verifySharePassword(token, password);
      setSkill(verifiedSkill);
      setRequiresPassword(false);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid password");
    } finally {
      setVerifying(false);
    }
  };

  const installCmd = `npx skilo-cli add skilo.xyz/s/${token}`;

  function handleCopy() {
    navigator.clipboard.writeText(installCmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const toggleContent = useCallback(async () => {
    if (contentOpen) {
      setContentOpen(false);
      return;
    }
    setContentOpen(true);
    if (skillContent !== null) return;
    if (!skill) return;
    setContentLoading(true);
    setContentError(null);
    try {
      const raw = await api.fetchSkillContent(skill.tarballUrl);
      setSkillContent(raw);
    } catch {
      setContentError("Could not load SKILL.md");
    } finally {
      setContentLoading(false);
    }
  }, [contentOpen, skillContent, skill]);

  if (loading) {
    return (
      <main className={MAIN}>
        <p className="text-stone-400">Loading&hellip;</p>
      </main>
    );
  }

  if (requiresPassword && !skill) {
    return (
      <main className={MAIN}>
        <div className="flex flex-col gap-3">
          <p className="font-medium text-black">This skill is password protected.</p>
          <form onSubmit={handleVerifyPassword} className="flex flex-col gap-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="rounded border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-stone-400 transition-colors"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={verifying || password.length === 0}
              className={`${PRIMARY_BTN} w-fit disabled:opacity-50`}
            >
              {verifying ? "Checking\u2026" : "Continue"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  if (error || !skill) {
    return (
      <main className={MAIN}>
        <p className="font-medium text-black">Skill not found</p>
        <p className="text-stone-500">
          {error || "This link may be invalid or expired."}
        </p>
        <Link to="/" className={NAV_LINK}>
          Back to home
        </Link>
      </main>
    );
  }

  return (
    <main className={MAIN}>
      {/* Name + version */}
      <div className="flex flex-col gap-1">
        <p className="text-lg font-medium text-black tracking-[-0.01em]">
          {skill.namespace}/{skill.name}
        </p>
        {skill.description && (
          <p className="text-stone-500">{skill.description}</p>
        )}
        <p className="text-xs text-stone-400 mt-1">
          v{skill.version}
          {skill.author && <> &middot; {skill.author}</>}
        </p>
      </div>

      {/* Install */}
      <div className="mt-6 flex flex-col gap-2">
        <p className="text-sm font-medium text-black">Install</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 overflow-x-auto rounded bg-stone-100 px-3 py-2 font-mono text-[13px] whitespace-nowrap">
            {installCmd}
          </code>
          <button type="button" onClick={handleCopy} className={PRIMARY_BTN}>
            <CopyIcon className="h-4 w-4" />
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {/* Details */}
      <div className="mt-6 flex flex-col gap-3">
        <p className="text-sm font-medium text-black">Details</p>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-stone-400">Checksum</dt>
          <dd className="font-mono text-[13px] text-stone-500 truncate">{skill.checksum}</dd>

          <dt className="text-stone-400">Size</dt>
          <dd className="text-stone-500">{(skill.size / 1024).toFixed(1)} KB</dd>

          {skill.homepage && (
            <>
              <dt className="text-stone-400">Homepage</dt>
              <dd>
                <a href={skill.homepage} target="_blank" rel="noopener noreferrer" className={NAV_LINK}>
                  {skill.homepage}
                </a>
              </dd>
            </>
          )}

          {skill.repository && (
            <>
              <dt className="text-stone-400">Repository</dt>
              <dd>
                <a href={skill.repository} target="_blank" rel="noopener noreferrer" className={NAV_LINK}>
                  {skill.repository}
                </a>
              </dd>
            </>
          )}
        </dl>

        {skill.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {skill.keywords.map((kw) => (
              <span key={kw} className="rounded bg-stone-100 px-2 py-0.5 text-xs text-stone-500">
                {kw}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* SKILL.md content */}
      <div className="mt-6 flex flex-col gap-2">
        <button
          type="button"
          onClick={toggleContent}
          className="flex items-center gap-2 text-sm font-medium text-black w-fit cursor-pointer"
        >
          <svg
            className={`h-3.5 w-3.5 text-stone-400 transition-transform duration-150 ${contentOpen ? "rotate-90" : ""}`}
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
          </svg>
          SKILL.md
        </button>

        {contentOpen && (
          <div className="rounded border border-stone-200 bg-stone-50 overflow-hidden">
            {contentLoading && (
              <p className="px-4 py-3 text-sm text-stone-400">Loading&hellip;</p>
            )}
            {contentError && (
              <p className="px-4 py-3 text-sm text-red-600">{contentError}</p>
            )}
            {skillContent !== null && !contentLoading && (
              <div
                className="skill-md px-5 py-4 text-sm leading-relaxed text-stone-700 overflow-x-auto"
                dangerouslySetInnerHTML={{ __html: marked.parse(skillContent, { async: false }) as string }}
              />
            )}
          </div>
        )}
      </div>
    </main>
  );
}

export default SkillPage;
