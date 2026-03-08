import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { CopyIcon } from "../components/icons";
import { api } from "../api/skilo";
import type { PackData } from "../api/skilo";

const NAV_LINK = "text-sm underline decoration-stone-400/50 underline-offset-[2.5px] hover:decoration-stone-500 transition-[text-decoration-color] duration-150";
const MAIN = "flex flex-col gap-4 max-w-[600px] mx-auto p-5 pt-28 pb-20 lg:p-10 lg:pt-32 lg:pb-32 leading-relaxed text-base";

function PackPage() {
  const { token } = useParams<{ token: string }>();
  const [pack, setPack] = useState<PackData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [selected, setSelected] = useState<Record<number, boolean>>({});

  // The active pack token — starts as the URL token, updates when subset is created
  const [activeToken, setActiveToken] = useState(token || "");
  const [subsetLoading, setSubsetLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const abortRef = useRef<AbortController>();

  useEffect(() => {
    if (!token) return;
    api
      .resolvePack(token)
      .then((data) => {
        setPack(data);
        setActiveToken(data.token);
        const all: Record<number, boolean> = {};
        data.skills.forEach((_, i) => { all[i] = true; });
        setSelected(all);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const selectedCount = Object.values(selected).filter(Boolean).length;
  const allSelected = pack ? selectedCount === pack.skills.length : false;

  // Resolve subset pack when selection changes
  const resolveSubset = useCallback((sel: Record<number, boolean>, packData: PackData) => {
    const count = Object.values(sel).filter(Boolean).length;
    const isAll = count === packData.skills.length;

    // All selected → revert to original token instantly
    if (isAll) {
      setActiveToken(packData.token);
      setSubsetLoading(false);
      window.history.replaceState(null, "", `/p/${packData.token}`);
      return;
    }

    // None selected → no valid pack
    if (count === 0) {
      setSubsetLoading(false);
      return;
    }

    // Subset → call the API
    const keepTokens = packData.skills
      .filter((_, i) => sel[i])
      .map((s) => s.shareToken);

    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSubsetLoading(true);
    api
      .subsetPack(packData.token, keepTokens)
      .then((result) => {
        if (controller.signal.aborted) return;
        setActiveToken(result.token);
        window.history.replaceState(null, "", `/p/${result.token}`);
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        console.error("Subset failed:", e);
      })
      .finally(() => {
        if (!controller.signal.aborted) setSubsetLoading(false);
      });
  }, []);

  // Debounce subset resolution on selection changes
  useEffect(() => {
    if (!pack) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => resolveSubset(selected, pack), 300);
    return () => clearTimeout(debounceRef.current);
  }, [selected, pack, resolveSubset]);

  const installCmd = `npx skilo-cli add skilo.xyz/p/${activeToken}`;
  const inspectCmd = `npx skilo-cli inspect skilo.xyz/p/${activeToken}`;

  const handleCopy = async () => {
    if (selectedCount === 0) return;
    await navigator.clipboard.writeText(installCmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  function toggleSkill(i: number) {
    setSelected((prev) => ({ ...prev, [i]: !prev[i] }));
  }

  function toggleAll() {
    if (!pack) return;
    const next: Record<number, boolean> = {};
    const target = !allSelected;
    pack.skills.forEach((_, i) => { next[i] = target; });
    setSelected(next);
  }

  if (loading) {
    return (
      <main className={MAIN}>
        <p className="text-stone-400">Loading&hellip;</p>
      </main>
    );
  }

  if (error || !pack) {
    return (
      <main className={MAIN}>
        <p className="font-medium text-black">Pack not found</p>
        <p className="text-stone-500">{error || "This link may be invalid."}</p>
        <Link to="/" className={NAV_LINK}>
          Back to home
        </Link>
      </main>
    );
  }

  const verifiedCount = pack.skills.filter((s) => s.verified).length;
  const packTrust = pack.trust;
  const packAudit = packTrust?.auditStatus || "clean";
  const packCapabilities = packTrust?.capabilities || [];

  return (
    <main className={MAIN}>
      {/* ── Header ── */}
      <div className="flex flex-col gap-1">
        <p className="text-lg font-medium text-black tracking-[-0.01em]">
          {pack.name || "Skill Pack"}
        </p>
        <div className="flex items-center gap-2 text-xs text-stone-400">
          <span>
            {pack.skills.length} skill{pack.skills.length !== 1 ? "s" : ""}
          </span>
          {verifiedCount > 0 && (
            <>
              <span className="text-stone-300">&middot;</span>
              <span className="text-emerald-500">
                {verifiedCount === pack.skills.length
                  ? "all verified"
                  : `${verifiedCount} verified`}
              </span>
            </>
          )}
          {packTrust && (
            <>
              <span className="text-stone-300">&middot;</span>
              <span className={
                packAudit === "blocked"
                  ? "text-red-500"
                  : packAudit === "warning"
                    ? "text-amber-500"
                    : "text-stone-500"
              }>
                {packAudit === "clean" ? "audit clean" : `audit ${packAudit}`}
              </span>
            </>
          )}
        </div>
      </div>

      {packTrust && (
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-500">
            {packTrust.publisherStatus}
          </span>
          {packCapabilities.map((capability) => (
            <span key={capability} className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs text-blue-600 ring-1 ring-inset ring-blue-200">
              {capability}
            </span>
          ))}
        </div>
      )}

      {packTrust?.riskSummary && packTrust.riskSummary.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {packTrust.riskSummary.map((summary) => (
            <p key={summary}>{summary}</p>
          ))}
        </div>
      )}

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
            disabled={selectedCount === 0}
            className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-300 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default disabled:hover:text-stone-500"
          >
            <CopyIcon className="h-3 w-3" />
            {copied
              ? "Copied"
              : selectedCount === 0
                ? "Copy"
                : allSelected
                  ? "Copy"
                  : `Copy ${selectedCount}/${pack.skills.length}`}
          </button>
        </div>
        <div className="bg-stone-950 px-5 py-4 font-mono text-[13px] leading-6">
          <div>
            <span className="text-stone-600">$ </span>
            <span className={`text-stone-200 transition-opacity duration-150 ${subsetLoading ? "opacity-50" : ""}`}>
              {selectedCount === 0
                ? "npx skilo-cli add skilo.xyz/p/..."
                : installCmd}
            </span>
          </div>
          <div className="pl-4 text-stone-500">
            &#10003; {selectedCount === 0 ? "0" : selectedCount} skill
            {selectedCount !== 1 ? "s" : ""} installed
          </div>
        </div>
      </div>
      <p className="text-xs text-stone-400 -mt-1">
        Auto-detects installed tools.{" "}
        Run{" "}
        <code className="rounded bg-stone-100 px-1 py-0.5 font-mono text-[11px]">
          {selectedCount === 0
            ? "npx skilo-cli inspect skilo.xyz/p/..."
            : inspectCmd}
        </code>{" "}
        to review before installing.
      </p>

      {/* ── Skills ── */}
      <div className="mt-6 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-black">Skills</p>
          <button
            type="button"
            onClick={toggleAll}
            className="text-xs text-stone-400 hover:text-stone-600 transition-colors cursor-pointer"
          >
            {allSelected ? "Deselect all" : "Select all"}
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {pack.skills.map((skill, i) => {
            const checked = !!selected[i];
            return (
              <div
                key={`${skill.namespace}/${skill.name}`}
                className={`group flex items-start gap-3 rounded-lg border px-4 py-3 transition-all duration-150 ${
                  checked
                    ? "border-stone-200 hover:border-stone-300"
                    : "border-stone-100 opacity-50"
                }`}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    toggleSkill(i);
                  }}
                  className="shrink-0 p-2 -m-2 cursor-pointer"
                  aria-label={`${checked ? "Deselect" : "Select"} ${skill.name}`}
                >
                  <div
                    className={`h-3.5 w-3.5 rounded-[3px] border transition-colors flex items-center justify-center ${
                      checked
                        ? "border-emerald-400 bg-emerald-50"
                        : "border-stone-300 bg-white"
                    }`}
                  >
                    {checked && (
                      <svg className="h-2.5 w-2.5 text-emerald-500" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2.5 6l2.5 2.5 4.5-5" />
                      </svg>
                    )}
                  </div>
                </button>
                <Link
                  to={`/s/${skill.shareToken}`}
                  className="min-w-0 flex-1"
                >
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <p className="text-sm font-medium text-black">
                      <span className="text-stone-400 font-normal">
                        {skill.namespace}/
                      </span>
                      {skill.name}
                    </p>
                    {skill.version && (
                      <span className="text-[11px] text-stone-400">
                        v{skill.version}
                      </span>
                    )}
                    {skill.verified && (
                      <span className="rounded-full bg-emerald-50 px-1.5 py-px text-[10px] text-emerald-600 ring-1 ring-inset ring-emerald-200">
                        Verified
                      </span>
                    )}
                    {skill.trust?.auditStatus && skill.trust.auditStatus !== "clean" && (
                      <span className={`rounded-full px-1.5 py-px text-[10px] ring-1 ring-inset ${
                        skill.trust.auditStatus === "blocked"
                          ? "bg-red-50 text-red-600 ring-red-200"
                          : "bg-amber-50 text-amber-600 ring-amber-200"
                      }`}>
                        {skill.trust.auditStatus}
                      </span>
                    )}
                  </div>
                  {skill.description && (
                    <p className="mt-0.5 text-sm text-stone-600 line-clamp-1">
                      {skill.description}
                    </p>
                  )}
                  {skill.trust?.capabilities && skill.trust.capabilities.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {skill.trust.capabilities.map((capability) => (
                        <span key={capability} className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-600 ring-1 ring-inset ring-blue-200">
                          {capability}
                        </span>
                      ))}
                    </div>
                  )}
                </Link>
                <Link
                  to={`/s/${skill.shareToken}`}
                  className="shrink-0 text-stone-300 text-sm group-hover:text-stone-500 transition-colors pt-0.5"
                >
                  &rarr;
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}

export default PackPage;
