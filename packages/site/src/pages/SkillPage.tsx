import { useParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { renderMarkdown } from "../lib/markdown";
import { CopyIcon } from "../components/icons";
import { api } from "../api/skilo";
import type { ShareLinkInfo, SkillMetadata } from "../api/skilo";

const NAV_LINK = "text-sm underline decoration-stone-400/50 underline-offset-[2.5px] hover:decoration-stone-500 transition-[text-decoration-color] duration-150";
const PRIMARY_BTN = "inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded text-[#0a1a1a] text-sm font-medium whitespace-nowrap bg-emerald-100 shadow-[0_2px_0_0_#6ee7b7] active:translate-y-px active:shadow-[0_1px_0_0_#34d399] transition-[transform,box-shadow] duration-75 cursor-pointer select-none";
const MAIN = "flex flex-col gap-4 max-w-[600px] mx-auto p-5 pt-28 pb-20 lg:p-10 lg:pt-32 lg:pb-32 leading-relaxed text-base";

function SkillPage() {
  const { token } = useParams<{ token: string }>();
  const [skill, setSkill] = useState<SkillMetadata | null>(null);
  const [linkInfo, setLinkInfo] = useState<ShareLinkInfo | null>(null);
  const [trust, setTrust] = useState<SkillMetadata["trust"] | null>(null);
  const [password, setPassword] = useState("");
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [skillContent, setSkillContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

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
          setLinkInfo(data.link || null);
          setTrust(data.trust || data.skill.trust || null);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load skill"))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!skill) return;
    setContentLoading(true);
    api
      .fetchSkillContent(skill.tarballUrl)
      .then(setSkillContent)
      .catch(() => setContentError("Could not load SKILL.md"))
      .finally(() => setContentLoading(false));
  }, [skill]);

  const handleVerifyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    try {
      setVerifying(true);
      setError(null);
      const verified = await api.verifySharePassword(token, password);
      setSkill(verified.skill);
      setLinkInfo(verified.link || null);
      setTrust(verified.trust || verified.skill.trust || null);
      setRequiresPassword(false);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid password");
    } finally {
      setVerifying(false);
    }
  };

  const installCmd = `npx skilo-cli add skilo.xyz/s/${token}`;
  const inspectCmd = `npx skilo-cli inspect skilo.xyz/s/${token}`;

  function handleCopy() {
    navigator.clipboard.writeText(installCmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

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

  const isVerified = trust?.verified || skill.verified;
  const isPublic = trust?.visibility === "public" || skill.listed;

  return (
    <main className={MAIN}>
      {/* ── Identity ── */}
      <div className="flex flex-col gap-1">
        <p className="text-lg font-medium text-black tracking-[-0.01em]">
          <span className="text-stone-400 font-normal">{skill.namespace}/</span>
          {skill.name}
        </p>
        {skill.description && (
          <p className="text-stone-500">{skill.description}</p>
        )}
        <div className="mt-1 flex items-center gap-2 text-xs text-stone-400">
          <span>v{skill.version}</span>
          {skill.author && (
            <>
              <span className="text-stone-300">&middot;</span>
              <span>{skill.author}</span>
            </>
          )}
          <span className="text-stone-300">&middot;</span>
          <span>{(skill.size / 1024).toFixed(1)} KB</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {isVerified ? (
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs text-emerald-600 ring-1 ring-inset ring-emerald-200">
              Verified
            </span>
          ) : (
            <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-500">
              Unsigned
            </span>
          )}
          <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-500">
            {isPublic ? "Public" : "Unlisted"}
          </span>
          {linkInfo?.oneTime && (
            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs text-amber-600 ring-1 ring-inset ring-amber-200">
              One-time link
            </span>
          )}
          {linkInfo?.expiresAt && (
            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs text-amber-600 ring-1 ring-inset ring-amber-200">
              Expires {new Date(linkInfo.expiresAt).toLocaleDateString()}
            </span>
          )}
          {linkInfo?.maxUses && (
            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs text-amber-600 ring-1 ring-inset ring-amber-200">
              {linkInfo.maxUses - (linkInfo.usesCount || 0)} of {linkInfo.maxUses} uses left
            </span>
          )}
        </div>
      </div>

      {/* ── Install (terminal) ── */}
      <div className="mt-4 overflow-hidden rounded-xl border border-stone-800/80 shadow-lg shadow-stone-900/5">
        <div className="flex items-center justify-between border-b border-stone-800/60 bg-stone-900 px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-stone-700" />
            <div className="h-2.5 w-2.5 rounded-full bg-stone-700" />
            <div className="h-2.5 w-2.5 rounded-full bg-stone-700" />
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-300 transition-colors cursor-pointer"
          >
            <CopyIcon className="h-3 w-3" />
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <div className="bg-stone-950 px-5 py-4 font-mono text-[13px] leading-6">
          <div>
            <span className="text-stone-600">$ </span>
            <span className="text-stone-200">{installCmd}</span>
          </div>
        </div>
      </div>
      <p className="text-xs text-stone-400 -mt-1">
        Auto-detects installed tools.{" "}
        Run <code className="rounded bg-stone-100 px-1 py-0.5 font-mono text-[11px]">{inspectCmd}</code> to review first.
      </p>

      {/* ── Keywords ── */}
      {skill.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {skill.keywords.map((kw) => (
            <span key={kw} className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-500">
              {kw}
            </span>
          ))}
        </div>
      )}

      {/* ── SKILL.md (visible by default) ── */}
      <div className="mt-4">
        <p className="text-sm font-medium text-black mb-3">SKILL.md</p>
        <div className="rounded-xl border border-stone-200 overflow-hidden">
          {contentLoading && (
            <p className="px-5 py-4 text-sm text-stone-400">Loading&hellip;</p>
          )}
          {contentError && (
            <p className="px-5 py-4 text-sm text-stone-400">{contentError}</p>
          )}
          {skillContent !== null && !contentLoading && (
            <div
              className="skill-md px-5 py-4 text-sm leading-relaxed text-stone-700 overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(skillContent) }}
            />
          )}
        </div>
      </div>

      {/* ── Details (collapsed) ── */}
      <div className="mt-2">
        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          className="flex items-center gap-2 text-xs text-stone-400 hover:text-stone-600 transition-colors w-fit cursor-pointer"
        >
          <svg
            className={`h-3 w-3 transition-transform duration-150 ${detailsOpen ? "rotate-90" : ""}`}
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
          </svg>
          Details
        </button>

        {detailsOpen && (
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-stone-400">Checksum</dt>
            <dd className="font-mono text-[12px] text-stone-500 truncate">{skill.checksum}</dd>

            <dt className="text-stone-400">Trust</dt>
            <dd className="text-stone-500">{isVerified ? "Verified signature" : "Unsigned or anonymous"}</dd>

            <dt className="text-stone-400">Visibility</dt>
            <dd className="text-stone-500">{isPublic ? "Public" : "Unlisted share"}</dd>

            {skill.homepage && (
              <>
                <dt className="text-stone-400">Homepage</dt>
                <dd>
                  <a href={skill.homepage} target="_blank" rel="noopener noreferrer" className={NAV_LINK}>
                    {skill.homepage.replace(/^https?:\/\//, "")}
                  </a>
                </dd>
              </>
            )}

            {skill.repository && (
              <>
                <dt className="text-stone-400">Repository</dt>
                <dd>
                  <a href={skill.repository} target="_blank" rel="noopener noreferrer" className={NAV_LINK}>
                    {skill.repository.replace(/^https?:\/\//, "")}
                  </a>
                </dd>
              </>
            )}
          </dl>
        )}
      </div>
    </main>
  );
}

export default SkillPage;
