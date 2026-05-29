"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

export default function AppShell({ children }) {
  const pathname = usePathname();
  const hideSidebar =
    pathname?.startsWith("/auth") || pathname?.startsWith("/onboarding");

  if (hideSidebar) {
    return <div className="relative min-h-screen bg-transparent">{children}</div>;
  }

  return (
    <div className="font-body relative flex min-h-screen bg-transparent">
      <Sidebar />
      <div className="relative z-0 flex min-w-0 flex-1 flex-col pl-[240px]">{children}</div>
    </div>
  );
}
