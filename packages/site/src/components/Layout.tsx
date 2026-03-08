import { useState } from "react";
import { Link } from "react-router-dom";
import { SkiloMark, ExternalLinkIcon, HamburgerIcon } from "./icons";
import { Cloudflare } from "@lobehub/icons";

const NAV_LINK = "text-sm underline decoration-stone-400/50 underline-offset-[2.5px] hover:decoration-stone-500 transition-[text-decoration-color] duration-150";
const PRIMARY_BTN = "inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded text-[#0a1a1a] text-sm font-medium whitespace-nowrap bg-emerald-100 shadow-[0_2px_0_0_#6ee7b7] active:translate-y-px active:shadow-[0_1px_0_0_#34d399] transition-[transform,box-shadow] duration-75 cursor-pointer select-none";
const FOOTER_LINK = "text-sm underline decoration-stone-400/50 underline-offset-[2.5px] hover:decoration-stone-500 transition-[text-decoration-color] duration-150";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-white">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3 lg:px-10 lg:py-4">
          <Link to="/" className="flex items-center gap-2 font-medium">
            <SkiloMark className="h-5 w-5" />
            Skilo
          </Link>

          <div className="flex items-center gap-4 sm:gap-6">
            <span className="hidden items-center gap-4 text-sm sm:flex">
              <Link to="/docs" className={NAV_LINK}>Docs</Link>
              <a
                href="https://github.com/yazcaleb/skilo"
                className={NAV_LINK}
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
                <ExternalLinkIcon className="ml-1 inline-block h-3 w-3 align-baseline" />
              </a>
            </span>

            <Link to="/docs" className={PRIMARY_BTN}>
              Get started
            </Link>

            <button
              className="-mr-2 p-2 sm:hidden"
              aria-label="Toggle menu"
              onClick={() => setMobileMenuOpen((v) => !v)}
            >
              <HamburgerIcon />
            </button>
          </div>
        </nav>

        {mobileMenuOpen && (
          <div className="border-t border-stone-100 bg-white px-5 pb-4 sm:hidden">
            <nav className="flex flex-col gap-3 pt-3 text-sm">
              <Link to="/docs" className={NAV_LINK} onClick={() => setMobileMenuOpen(false)}>Docs</Link>
              <a
                href="https://github.com/yazcaleb/skilo"
                className={NAV_LINK}
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
                <ExternalLinkIcon className="ml-1 inline-block h-3 w-3 align-baseline" />
              </a>
            </nav>
          </div>
        )}
      </header>

      {children}

      <footer className="mx-auto flex max-w-6xl flex-col items-center gap-3 p-5 pt-0 text-sm text-stone-500 lg:p-10 lg:pt-0">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <Link to="/docs" className={FOOTER_LINK}>Docs</Link>
          <Link to="/claim" className={FOOTER_LINK}>Claim</Link>
          <a
            href="https://github.com/yazcaleb/skilo"
            className={FOOTER_LINK}
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
            <ExternalLinkIcon className="ml-1 inline-block h-3 w-3 align-baseline" />
          </a>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-stone-300">
          <Cloudflare size={14} />
          Runs on Cloudflare
        </span>
      </footer>
    </>
  );
}
