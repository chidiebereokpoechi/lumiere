"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Grid,
  Chart,
  Watermark,
  Gear,
  Users,
  Collapse,
  Close,
} from "@/components/ui/icons";
import { Logo, LogoMark } from "@/components/ui/logo";

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
    href: "/admin/users",
    label: "Users",
    icon: <Users size={24} />,
  },
  {
    href: "/admin/settings",
    label: "Settings",
    icon: <Gear size={24} />,
  },
];

const STORAGE_KEY = "lumiere_sidebar_collapsed";

// The mobile drawer is opened from the Topnav hamburger (a different subtree),
// so expose a module-level opener the way the dialog host does. Topnav imports
// openMobileNav(); the mounted Sidebar wires it up to its own state.
let openDrawer: (() => void) | null = null;
export function openMobileNav() {
  openDrawer?.();
}

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Restore the persisted collapse state after mount (avoids SSR mismatch).
  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === "1") setCollapsed(true);
  }, []);

  // Register the module-level opener while mounted.
  useEffect(() => {
    openDrawer = () => setMobileOpen(true);
    return () => {
      openDrawer = null;
    };
  }, []);

  // Drawer: close on route change, lock body scroll + close on Esc while open.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!mobileOpen) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <>
      {/* Desktop rail. */}
      <aside
        className={`hidden md:flex md:flex-col shrink-0 sticky top-0 h-dvh overflow-y-auto bg-bg border-r border-border py-4 transition-[width] duration-200 ease-out ${
          collapsed ? "md:w-18 px-4" : "md:w-57 px-4"
        }`}
      >
        <div
          className={`flex pb-4 ${collapsed ? "flex-col items-center gap-3" : "items-center justify-between px-2"}`}
        >
          {collapsed ? <LogoMark size={32} /> : <Logo size={28} />}
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
          {NAV.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(pathname, item.href)}
              collapsed={collapsed}
            />
          ))}
        </nav>
      </aside>

      {/* Mobile drawer. */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <aside className="absolute left-0 top-0 h-dvh w-72 max-w-[80vw] overflow-y-auto bg-bg border-r border-border p-4 flex flex-col">
            <div className="flex items-center justify-between px-2 pb-4">
              <Logo size={28} />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunken hover:text-ink-strong transition-colors"
              >
                <Close size={16} />
              </button>
            </div>
            <nav className="flex-1 space-y-4">
              {NAV.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isActive(pathname, item.href)}
                  collapsed={false}
                  onNavigate={() => setMobileOpen(false)}
                />
              ))}
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}

function isActive(pathname: string, href: string) {
  return (
    pathname === href || (href !== "/admin" && pathname.startsWith(href))
  );
}

function NavLink({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
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
        className={`${base} bg-surface-2 text-ink-muted border border-border cursor-not-allowed`}
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
      onClick={onNavigate}
      className={`${base} ${tone}`}
    >
      {item.icon}
      {!collapsed && label}
    </Link>
  );
}
