"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function getNavLinkClass(isActive) {
  return `text-sm font-medium transition ${
    isActive
      ? "font-semibold text-[#63B3ED]"
      : "text-[#8B92A5] hover:text-[#ECEEF2]"
  }`;
}

export default function Navbar() {
  const pathname = usePathname();

  const isHomeActive =
    pathname === "/dashboard" || pathname === "/upload";
  const isAkunActive = pathname === "/accounts";

  return (
    <header className="sticky top-0 z-50 border-b border-[rgba(255,255,255,0.08)] bg-[rgba(17,19,24,0.85)] backdrop-blur-xl">
      <nav className="mx-auto grid h-[72px] w-full max-w-6xl grid-cols-3 items-center px-6 md:px-10">
        <div className="justify-self-start">
          <Link
            href="/dashboard"
            className="font-serif-display text-2xl tracking-[-0.5px] text-[#ECEEF2] transition hover:opacity-80"
          >
            Vale
          </Link>
        </div>

        <div className="flex items-center justify-center gap-6 md:gap-8">
          <Link href="/dashboard" className={getNavLinkClass(isHomeActive)}>
            Home
          </Link>
          <Link href="/accounts" className={getNavLinkClass(isAkunActive)}>
            Akun
          </Link>
        </div>

        <div className="justify-self-end">
          <Link href="/accounts" className="btn-ghost rounded-full px-4 py-2 text-sm font-semibold">
            Kelola Akun
          </Link>
        </div>
      </nav>
    </header>
  );
}
