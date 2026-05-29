"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

const SIDEBAR_ROUTES = ["/dashboard", "/accounts", "/upload"];

export default function AppShell({ children }) {
  const pathname = usePathname();
  const showSidebar = SIDEBAR_ROUTES.some(
    (route) => pathname === route || pathname?.startsWith(`${route}/`),
  );

  if (!showSidebar) {
    return <div className="relative min-h-screen bg-transparent">{children}</div>;
  }

  return (
    <div className="font-body relative flex min-h-screen bg-transparent">
      <Sidebar />
      <div className="relative z-0 flex min-w-0 flex-1 flex-col pl-[240px]">
        {children}
      </div>
    </div>
  );
}
