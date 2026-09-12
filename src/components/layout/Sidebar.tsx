"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { menuTabs, standalonePages } from "@/config/menu";
import { FEATURE_TABS_HIERARCHY } from "@/config/featureFlagsHierarchy";
import { useMemo, useState } from "react";
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from "lucide-react";

interface Props {
  enabledFlags: string[];
}

export function Sidebar({ enabledFlags = [] }: Props) {
  const pathname = usePathname();
  const [openTabs, setOpenTabs] = useState<Record<number, boolean>>({});
  const [isCollapsed, setIsCollapsed] = useState(false);

  /* ── Active-tab detection ─────────────────────────────────────────── */
  const activeTabs = useMemo(() => {
    return menuTabs.reduce<Record<number, boolean>>((acc, tab) => {
      if (tab.pages.some((p) => pathname.startsWith(p.path))) {
        acc[tab.id] = true;
      }
      return acc;
    }, {});
  }, [pathname]);

  const displayOpenTabs = { ...openTabs, ...activeTabs };

  const toggleTab = (id: number) =>
    setOpenTabs((prev) => ({ ...prev, [id]: !prev[id] }));

  /* ── Feature-flag filtering ───────────────────────────────────────── */
  const isPageEnabled = (pagePath: string, tabId: number) => {
    const tabItem = FEATURE_TABS_HIERARCHY.find((t) => t.id === tabId);
    if (tabItem && !enabledFlags.includes(tabItem.key)) {
      return false;
    }
    const pageItem = tabItem?.pages.find((p) => pagePath.startsWith(p.path));
    if (pageItem && !enabledFlags.includes(pageItem.key)) {
      return false;
    }
    if (pagePath === "/tab7/alerts") {
      return (
        enabledFlags.includes("alert_page_enabled") ||
        enabledFlags.includes("page_realtime_alerts")
      );
    }
    return true;
  };

  const enabledTabs = menuTabs
    .map((tab) => ({
      ...tab,
      pages: tab.pages.filter((page) => isPageEnabled(page.path, tab.id)),
    }))
    .filter((tab) => tab.pages.length > 0);

  /* ── Shared class helpers ─────────────────────────────────────────── */
  const navLinkCls = (isActive: boolean) =>
    [
      "block px-3 py-[5px] rounded-[var(--radius-sm)] text-[11px] transition-all duration-150",
      isActive
        ? "bg-[var(--primary-light)] text-[var(--primary)] font-semibold"
        : "text-[var(--text-secondary)] hover:bg-gray-50 hover:text-[var(--text-primary)]",
    ].join(" ");

  return (
    <aside
      className={[
        "shrink-0 flex flex-col h-full bg-white border-r border-[var(--border)]",
        "transition-all duration-250 overflow-hidden",
        isCollapsed ? "w-[52px]" : "w-[var(--sidebar-width)]",
      ].join(" ")}
    >
      {/* ── Brand / Toggle ─────────────────────────────────────────── */}
      <div
        className={[
          "flex items-center border-b border-[var(--border-light)] h-[var(--topbar-height)] px-3 shrink-0",
          isCollapsed ? "justify-center" : "justify-between",
        ].join(" ")}
      >
        {!isCollapsed && (
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-[var(--radius-sm)] bg-[var(--primary)] flex items-center justify-center shrink-0">
              <span className="text-white text-[10px] font-bold leading-none">M</span>
            </div>
            <span className="text-[12px] font-semibold text-[var(--text-primary)] truncate">
              MDOS Portal
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={() => setIsCollapsed((p) => !p)}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="rounded-[var(--radius-sm)] bg-[var(--primary)] p-1.5 text-white shrink-0"
        >
          {isCollapsed
            ? <PanelLeftOpen className="h-[14px] w-[14px]" />
            : <PanelLeftClose className="h-[14px] w-[14px]" />}
        </button>
      </div>

      {/* ── Navigation ─────────────────────────────────────────────── */}
      {!isCollapsed && (
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {enabledTabs.map((tab) => {
            const isTabActive = !!activeTabs[tab.id];
            return (
              <div key={tab.id}>
                {/* Tab group toggle */}
                <button
                  onClick={() => toggleTab(tab.id)}
                  className={[
                    "w-full text-left px-3 py-[6px] rounded-[var(--radius-sm)]",
                    "flex justify-between items-center gap-2",
                    "text-[11px] font-semibold transition-all duration-150",
                    isTabActive
                      ? "text-[var(--primary)]"
                      : "text-[var(--text-secondary)] hover:bg-gray-50 hover:text-[var(--text-primary)]",
                  ].join(" ")}
                >
                  <span className="flex items-center gap-2 truncate">
                    <span className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--surface)] border border-[var(--border)] text-[var(--primary)]">
                      {tab.icon ? <tab.icon className="h-[14px] w-[14px]" /> : null}
                    </span>
                    <span className="truncate">{tab.title}</span>
                  </span>
                  <ChevronDown
                    className={[
                      "w-[13px] h-[13px] shrink-0 transition-transform duration-200",
                      displayOpenTabs[tab.id] ? "rotate-180" : "",
                    ].join(" ")}
                  />
                </button>

                {/* Pages */}
                {displayOpenTabs[tab.id] && (
                  <div className="mt-0.5 ml-3 space-y-0.5 tab-expand">
                    {tab.pages.map((page) => {
                      const isActive = pathname.startsWith(page.path);
                      const Icon = page.icon;
                      return (
                        <Link key={page.path} href={page.path} className={navLinkCls(isActive)}>
                          <span className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--surface)] border border-[var(--border)] text-[var(--primary)]">
                              {Icon ? <Icon className="h-[14px] w-[14px]" /> : null}
                            </span>
                            <span>{page.name}</span>
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* ── Standalone / System ──────────────────────────────── */}
          <div className="pt-3 mt-3 border-t border-[var(--border-light)]">
            <p className="px-3 mb-1.5 text-[9.5px] font-semibold text-[var(--text-muted)] uppercase tracking-widest">
              System
            </p>
            {standalonePages.map((page) => {
              const isActive = pathname.startsWith(page.path);
              const Icon = page.icon;
              return (
                <Link key={page.path} href={page.path} className={navLinkCls(isActive)}>
                  <span className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--surface)] border border-[var(--border)] text-[var(--primary)]">
                      {Icon ? <Icon className="w-[14px] h-[14px] shrink-0" /> : null}
                    </span>
                    {page.name}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </aside>
  );
}

