"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

const LOGOUT_STORAGE_KEYS = [
  "parsedTransactions",
  "aiInsights",
  "customCategories",
  "categoryRules",
  "notesRules",
  "transactionNotes",
  "accounts",
  "uploadHistory",
  "categoryRenames",
  "categoryEmojiOverrides",
  "autoCategoryNotification",
];

function clearAllAppData() {
  if (typeof window === "undefined") return;
  LOGOUT_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
}

function getNavLinkClass(isActive) {
  return `text-sm font-semibold transition hover:text-[#1B4332] ${
    isActive
      ? "font-bold text-[#1B4332] underline decoration-[#1B4332] decoration-2 underline-offset-4"
      : "text-slate-600"
  }`;
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const isHomeActive = pathname === "/dashboard" || pathname === "/upload";
  const isAkunActive = pathname === "/accounts";

  const handleLogout = () => {
    clearAllAppData();
    setShowLogoutConfirm(false);
    router.push("/");
  };

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-[#e5e7eb] bg-white">
        <nav className="mx-auto grid h-[60px] w-full max-w-6xl grid-cols-3 items-center px-6 md:px-10">
          <div className="justify-self-start">
            <Link
              href="/dashboard"
              className="text-lg font-bold tracking-tight text-[#1B4332] transition hover:opacity-80 md:text-xl"
            >
              FinanceTools
            </Link>
          </div>

          <div className="flex items-center justify-center gap-4 md:gap-6">
            <Link href="/dashboard" className={getNavLinkClass(isHomeActive)}>
              🏠 Home
            </Link>
            <Link href="/accounts" className={getNavLinkClass(isAkunActive)}>
              📊 Akun
            </Link>
          </div>

          <div className="justify-self-end">
            <button
              type="button"
              onClick={() => setShowLogoutConfirm(true)}
              className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-600 transition hover:bg-red-100 md:px-4 md:py-2"
            >
              🚪 Keluar
            </button>
          </div>
        </nav>
      </header>

      {showLogoutConfirm ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <p className="text-center text-sm leading-relaxed text-slate-700">
              Yakin mau keluar? Semua data tersimpan di browser kamu.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={handleLogout}
                className="flex-1 rounded-full bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                Keluar
              </button>
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 rounded-full border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
