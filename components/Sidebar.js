"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getProfile } from "../lib/profiles";
import { supabase } from "../lib/supabase";

function getUserInitials(user, fullName) {
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
  if (email) return email.slice(0, 2).toUpperCase();
  return "V";
}

function NavItem({ href, icon, label, isActive }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-lg border-l-2 px-3 py-2.5 text-sm transition ${
        isActive
          ? "border-[#63B3ED] bg-[rgba(99,179,237,0.1)] font-semibold text-[#63B3ED]"
          : "border-transparent font-medium text-[#8B92A5] hover:bg-[rgba(255,255,255,0.03)] hover:text-[#ECEEF2]"
      }`}
    >
      <span aria-hidden="true">{icon}</span>
      {label}
    </Link>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [userFullName, setUserFullName] = useState("");
  const [userEmail, setUserEmail] = useState("");

  const isDashboardActive =
    pathname === "/dashboard" ||
    pathname === "/upload" ||
    pathname?.startsWith("/dashboard/") ||
    pathname?.startsWith("/upload/");
  const isAccountsActive =
    pathname === "/accounts" || pathname?.startsWith("/accounts/");

  useEffect(() => {
    let mounted = true;

    const loadUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted || !session?.user) return;

      setUserEmail(session.user.email || "");

      const profile = await getProfile();
      if (!mounted) return;

      const resolvedName =
        profile?.full_name?.trim() ||
        session.user.user_metadata?.full_name?.trim() ||
        "";
      if (resolvedName) setUserFullName(resolvedName);
    };

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email || "");
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    localStorage.clear();
    router.push("/");
    router.refresh();
  };

  const handleOpenSettings = () => {
    router.push("/dashboard?openRules=1");
  };

  const initials = getUserInitials({ email: userEmail }, userFullName);
  const displayName = userFullName || userEmail || "Pengguna";

  return (
    <aside className="glass-sidebar fixed inset-y-0 left-0 z-40 flex w-[240px] flex-col border-r border-[rgba(255,255,255,0.06)]">
      <div className="px-5 py-6">
        <Link
          href="/dashboard"
          className="font-serif-display text-2xl tracking-[-0.5px] text-[#ECEEF2]"
        >
          Vale
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        <NavItem
          href="/dashboard"
          icon="🏠"
          label="Dashboard"
          isActive={isDashboardActive}
        />
        <NavItem
          href="/accounts"
          icon="🏦"
          label="Akun"
          isActive={isAccountsActive}
        />
        <button
          type="button"
          onClick={handleOpenSettings}
          className="flex w-full items-center gap-3 rounded-lg border-l-2 border-transparent px-3 py-2.5 text-left text-sm font-medium text-[#8B92A5] transition hover:bg-[rgba(255,255,255,0.03)] hover:text-[#ECEEF2]"
        >
          <span aria-hidden="true">⚙️</span>
          Pengaturan
        </button>
      </nav>

      <div className="border-t border-[rgba(255,255,255,0.06)] p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgba(99,179,237,0.15)] text-xs font-bold text-[#63B3ED] ring-1 ring-[rgba(99,179,237,0.3)]">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[#ECEEF2]">
              {displayName}
            </p>
            {userEmail ? (
              <p className="truncate text-xs text-[#8B92A5]">{userEmail}</p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="mt-3 w-full rounded-lg border border-[rgba(255,255,255,0.08)] px-3 py-2 text-sm font-medium text-[#8B92A5] transition hover:bg-[rgba(255,255,255,0.04)] hover:text-[#ECEEF2]"
        >
          Keluar
        </button>
      </div>
    </aside>
  );
}
