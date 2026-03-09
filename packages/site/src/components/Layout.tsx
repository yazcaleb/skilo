import { useState } from "react";
import { Link } from "react-router-dom";
import { SkiloMark, HamburgerIcon } from "./icons";
import { Cloudflare, Github } from "@lobehub/icons";

const NAV_ITEM = "text-sm text-stone-500 transition-colors hover:text-black";
const PRIMARY_BTN = "inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded text-[#0a1a1a] text-sm font-medium whitespace-nowrap bg-emerald-100 hover:bg-emerald-200/70 shadow-[0_2px_0_0_#6ee7b7] active:translate-y-px active:shadow-[0_1px_0_0_#34d399] transition-[transform,box-shadow,background-color] duration-75 cursor-pointer select-none";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-stone-100">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3 lg:px-10 lg:py-4">
          <Link to="/" className="flex items-center gap-2 font-medium">
            <SkiloMark className="h-5 w-5" />
            Skilo
          </Link>

          <div className="flex items-center gap-5 sm:gap-6">
            <span className="hidden items-center gap-5 sm:flex">
              <Link to="/docs" className={NAV_ITEM}>Docs</Link>
              <a
                href="https://github.com/yazcaleb/skilo"
                className={NAV_ITEM}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
              >
                <Github size={18} />
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
            <nav className="flex flex-col gap-3 pt-3">
              <Link to="/docs" className={NAV_ITEM} onClick={() => setMobileMenuOpen(false)}>Docs</Link>
              <a
                href="https://github.com/yazcaleb/skilo"
                className={`${NAV_ITEM} w-fit`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
              >
                <Github size={18} />
              </a>
            </nav>
          </div>
        )}
      </header>

      {children}

      <footer className="mx-auto max-w-6xl border-t border-stone-100 px-5 py-8 lg:px-10">
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-5">
            <Link to="/docs" className={NAV_ITEM}>Docs</Link>
            <Link to="/changelog" className={NAV_ITEM}>Changelog</Link>
            <a
              href="https://github.com/yazcaleb/skilo"
              className={NAV_ITEM}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
            >
              <Github size={16} />
            </a>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-stone-400">
            <Cloudflare size={12} /> Runs on Cloudflare <span className="mx-0.5 text-stone-300">/</span> by <a href="https://x.com/yazcal" target="_blank" rel="noopener noreferrer" className="text-stone-500 transition-colors hover:text-black">Yaz</a>
          </p>
        </div>
      </footer>
    </>
  );
}
