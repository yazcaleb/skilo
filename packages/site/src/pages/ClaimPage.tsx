import { useState } from "react";
import { CopyIcon } from "../components/icons";

const PRIMARY_BTN = "inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded text-[#0a1a1a] text-sm font-medium whitespace-nowrap bg-emerald-100 shadow-[0_2px_0_0_#6ee7b7] active:translate-y-px active:shadow-[0_1px_0_0_#34d399] transition-[transform,box-shadow] duration-75 cursor-pointer select-none";

function ClaimPage() {
  const [claimCopied, setClaimCopied] = useState(false);

  const claimCmd = "skilo claim @namespace/skill-name --token YOUR_TOKEN";

  function handleCopy() {
    navigator.clipboard.writeText(claimCmd);
    setClaimCopied(true);
    setTimeout(() => setClaimCopied(false), 1500);
  }

  return (
      <main className="flex flex-col gap-4 max-w-[600px] mx-auto p-5 pt-28 pb-20 lg:p-10 lg:pt-32 lg:pb-32 leading-relaxed text-base">

        <div className="flex flex-col gap-2">
          <p className="text-lg font-medium text-black tracking-[-0.01em]">
            Claim a skill
          </p>
          <p className="text-stone-600">
            When you publish a skill anonymously, you get a claim token. Use it to take ownership later &mdash; no account needed at publish time.
          </p>
        </div>

        {/* Steps */}
        <div className="mt-4 flex flex-col gap-4">
          <p className="font-medium">How it works</p>
          <ol className="flex list-decimal flex-col gap-3 pl-5">
            <li>
              <p className="text-stone-600">
                <span className="font-medium text-black">Publish a skill.</span> When you run <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">skilo publish</code> without being logged in, you get an anonymous namespace and a claim token.
              </p>
            </li>
            <li>
              <p className="text-stone-600">
                <span className="font-medium text-black">Save the token.</span> The CLI saves it to <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">~/.skilo/claims/</code> automatically. You'll also see it in the terminal output.
              </p>
            </li>
            <li>
              <p className="text-stone-600">
                <span className="font-medium text-black">Log in and claim.</span> When you're ready to own the skill under your name, log in and run the claim command.
              </p>
            </li>
          </ol>
        </div>

        {/* Command */}
        <div className="mt-4 flex flex-col gap-2">
          <p className="font-medium">Claim command</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded bg-stone-100 px-3 py-2 font-mono text-[13px] whitespace-nowrap">
              {claimCmd}
            </code>
            <button type="button" onClick={handleCopy} className={PRIMARY_BTN}>
              <CopyIcon className="h-4 w-4" />
              {claimCopied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="text-xs text-stone-400">
            Replace the namespace, skill name, and token with your values.
          </p>
        </div>

        {/* Login */}
        <div className="mt-4 flex flex-col gap-2">
          <p className="font-medium">First time?</p>
          <p className="text-stone-600">
            Log in first to create your namespace:
          </p>
          <code className="rounded bg-stone-100 px-3 py-2 font-mono text-[13px] w-fit">
            skilo login your-name
          </code>
          <p className="text-stone-600">
            After logging in, you can also publish directly under your namespace without the anonymous claim flow.
          </p>
        </div>
      </main>
  );
}

export default ClaimPage;
