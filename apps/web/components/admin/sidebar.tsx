"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Grid, Chart, Watermark, Gear, Collapse } from "@/components/ui/icons";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
}

const NAV: NavItem[] = [
  { href: "/admin", label: "Galleries", icon: <Grid size={24} /> },
  {
    href: "/admin/analytics",
    label: "Analytics",
    icon: <Chart size={24} />,
    disabled: true,
  },
  {
    href: "/admin/watermarks",
    label: "Watermarks",
    icon: <Watermark size={24} />,
  },
  {
    href: "/admin/settings",
    label: "Settings",
    icon: <Gear size={24} />,
    disabled: true,
  },
];

const STORAGE_KEY = "lumiere_sidebar_collapsed";

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Restore the persisted collapse state after mount (avoids SSR mismatch).
  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === "1") setCollapsed(true);
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <aside
      className={`hidden md:flex md:flex-col shrink-0 sticky top-0 h-dvh overflow-y-auto bg-bg border-r border-border py-4 transition-[width] duration-200 ease-out ${
        collapsed ? "md:w-18 px-4" : "md:w-57 px-4"
      }`}
    >
      <div
        className={`flex items-center pb-4 ${collapsed ? "justify-center" : "justify-between px-2"}`}
      >
        {!collapsed && (
          <p className="text-xs font-bold tracking-wider text-ink-muted">
            Lumière
          </p>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand" : "Collapse"}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunken hover:text-ink-strong transition-colors"
        >
          <Collapse
            size={16}
            className={`transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      <nav className="flex-1 space-y-4">
        {NAV.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/admin" && pathname.startsWith(item.href));
          return (
            <NavLink
              key={item.href}
              item={item}
              active={active}
              collapsed={collapsed}
            />
          );
        })}
      </nav>
    </aside>
  );
}

function NavLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const base = `flex items-center rounded-md text-sm font-semibold tracking-wider transition-colors ${
    collapsed ? "justify-center h-10 w-10 mx-auto" : "gap-2.5 px-3 py-2.5"
  }`;
  const label = item.label;

  if (item.disabled) {
    return (
      <span
        aria-disabled
        title={collapsed ? label : undefined}
        className={`${base} bg-surface-2 text-ink-subtle border border-border cursor-not-allowed`}
      >
        <span className="opacity-50">{item.icon}</span>
        {!collapsed && label}
      </span>
    );
  }

  const tone = active
    ? "bg-surface-strong text-ink-inverse border border-surface-strong"
    : "bg-surface text-ink-muted border border-border hover:bg-surface-sunken hover:text-ink-strong";

  return (
    <Link
      href={item.href}
      title={collapsed ? label : undefined}
      className={`${base} ${tone}`}
    >
      {item.icon}
      {!collapsed && label}
    </Link>
  );
}
