"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { getRouteMetadata } from "@/config/menu";
import { UserButton } from "@clerk/nextjs";
import { getCurrentDistroName } from "@/lib/actions/settings";

/**
 * TopBar — sticky app bar showing:
 *  • Left:  breadcrumb (category › page title) derived from current route
 *  • Right: distribution name + UserButton
 */
interface TopBarProps {
  distroName?: string;
}

export function TopBar({ distroName }: TopBarProps) {
  const pathname = usePathname();
  const { category } = getRouteMetadata(pathname);
  const [currentDistroName, setCurrentDistroName] = useState<string>(distroName || "");

  useEffect(() => {
    if (distroName) {
      setCurrentDistroName(distroName);
      return;
    }
    getCurrentDistroName().then((name) => {
      if (name) setCurrentDistroName(name);
    });
  }, [distroName]);

  const isAdmin = pathname.startsWith("/admin");
  const displayName = currentDistroName || (isAdmin ? "MDOS Admin" : "Distributor");

  return (
    <header
      className={[
        "h-[var(--topbar-height)] shrink-0 z-10",
        "flex items-center justify-between px-5",
        "bg-white border-b border-[var(--border)]",
      ].join(" ")}
    >
      {/* ── Breadcrumb ───────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-[11px] text-[var(--text-muted)] truncate">{category}</span>
      </div>

      {/* ── User Pill ────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[11.5px] font-semibold text-zinc-800 hidden sm:block">
          {displayName}
        </span>
        <UserButton />
      </div>
    </header>
  );
}

