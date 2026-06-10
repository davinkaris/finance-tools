"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b transition-all duration-300 ${
        scrolled
          ? "border-white/[0.12] bg-[#0A0A0A]/85 shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-2xl"
          : "border-white/[0.08] bg-[#0A0A0A]/50 backdrop-blur-xl"
      }`}
    >
      <nav className="mx-auto flex h-[60px] max-w-6xl items-center justify-between px-6 md:px-10">
        <Link
          href="/"
          className="vale-logo font-serif-display text-2xl tracking-tight text-white"
        >
          Vale
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/auth"
            className="rounded-full px-4 py-2 text-sm font-medium text-[#94A3B8] transition hover:text-white"
          >
            Masuk
          </Link>
          <Link
            href="/auth"
            className="vale-btn-shimmer relative overflow-hidden rounded-full border border-[#10b981]/40 bg-[#10b981]/10 px-5 py-2 text-sm font-medium text-[#10b981] transition hover:border-[#10b981] hover:bg-[#10b981]/20"
          >
            Mulai Gratis
          </Link>
        </div>
      </nav>
    </header>
  );
}
