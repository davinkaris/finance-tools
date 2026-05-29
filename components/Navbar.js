"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

function getNavLinkClass(isActive) {
  return `text-sm font-medium transition ${
    isActive
      ? "font-semibold text-[#63B3ED]"
      : "text-[#8B92A5] hover:text-[#ECEEF2]"
  }`;
}

function getUserInitials(user) {
  const fullName = user?.user_metadata?.full_name;
  if (fullName && typeof fullName === "string") {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
  }

  const email = user?.email || "";
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }

  return "V";
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const isHomeActive =
    pathname === "/dashboard" || pathname === "/upload";
  const isAkunActive = pathname === "/accounts";

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      if (mounted) setSession(currentSession);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    setMenuOpen(false);
    await supabase.auth.signOut();
    localStorage.clear();
    router.push("/");
    router.refresh();
  };

  const user = session?.user;
  const initials = getUserInitials(user);

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

        <div className="relative justify-self-end" ref={menuRef}>
          {session ? (
            <>
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[rgba(99,179,237,0.15)] text-xs font-bold text-[#63B3ED] ring-1 ring-[rgba(99,179,237,0.3)] transition hover:bg-[rgba(99,179,237,0.25)]"
                aria-label="Menu pengguna"
                aria-expanded={menuOpen}
              >
                {initials}
              </button>

              {menuOpen ? (
                <div className="vale-card absolute top-full right-0 mt-2 min-w-[180px] overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)] py-1 shadow-lg">
                  <Link
                    href="/accounts"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-2.5 text-sm text-[#ECEEF2] transition hover:bg-[rgba(255,255,255,0.04)]"
                  >
                    Kelola Akun
                  </Link>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="block w-full px-4 py-2.5 text-left text-sm text-[#FC8181] transition hover:bg-[rgba(255,255,255,0.04)]"
                  >
                    Keluar
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <Link
              href="/auth"
              className="btn-ghost rounded-full px-4 py-2 text-sm font-semibold"
            >
              Masuk
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
