import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { CopyIcon } from "../components/icons";
import { api } from "../api/skilo";
import type { PackData } from "../api/skilo";

const NAV_LINK = "text-sm underline decoration-stone-400/50 underline-offset-[2.5px] hover:decoration-stone-500 transition-[text-decoration-color] duration-150";
const PRIMARY_BTN = "inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded text-[#0a1a1a] text-sm font-medium whitespace-nowrap bg-emerald-100 shadow-[0_2px_0_0_#6ee7b7] active:translate-y-px active:shadow-[0_1px_0_0_#34d399] transition-[transform,box-shadow] duration-75 cursor-pointer select-none";
const MAIN = "flex flex-col gap-4 max-w-[600px] mx-auto p-5 pt-28 pb-20 lg:p-10 lg:pt-32 lg:pb-32 leading-relaxed text-base";

function PackPage() {
  const { token } = useParams<{ token: string }>();
  const [pack, setPack] = useState<PackData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .resolvePack(token)
      .then(setPack)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const handleCopy = async () => {
    if (!pack) return;
    const commands = pack.skills
      .map((s) => `npx skilo-cli add ${s.namespace}/${s.name}`)
      .join("\n");
    await navigator.clipboard.writeText(commands);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

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

  return (
    <main className={MAIN}>
      {/* Header info */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-lg font-medium text-black tracking-[-0.01em]">
            {pack.name || "Skill Pack"}
          </p>
          <p className="text-stone-500">
            {pack.skills.length} skill{pack.skills.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button type="button" onClick={handleCopy} className={PRIMARY_BTN}>
          <CopyIcon className="h-4 w-4" />
          {copied ? "Copied" : "Install all"}
        </button>
      </div>

      {/* Skill list */}
      <div className="mt-6 flex flex-col gap-3">
        {pack.skills.map((skill) => (
          <Link
            key={`${skill.namespace}/${skill.name}`}
            to={`/s/${skill.shareToken}`}
            className="block rounded-lg border border-stone-200 px-4 py-3 transition-colors hover:border-stone-300 hover:bg-stone-50"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-black">
                  {skill.namespace}/{skill.name}
                  {skill.version && (
                    <span className="ml-2 text-xs font-normal text-stone-400">
                      v{skill.version}
                    </span>
                  )}
                </p>
                {skill.description && (
                  <p className="mt-0.5 text-sm text-stone-500 line-clamp-1">
                    {skill.description}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-stone-400 text-sm">&rarr;</span>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}

export default PackPage;
