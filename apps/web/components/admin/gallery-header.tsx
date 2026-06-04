import Link from "next/link";
import { Topnav } from "@/components/admin/topnav";
import { StatusControl } from "@/components/admin/status-control";
import { External } from "@/components/ui/icons";
import { buttonClasses } from "@/components/ui/button-variants";

type TabKey = "settings" | "media" | "comments" | "lists" | "analytics";

interface Props {
  galleryId: string;
  title: string;
  slug: string;
  passwordProtected: boolean;
  status: "active" | "draft" | "archived";
  user: { name: string; email: string };
  active: TabKey;
}

// Shared chrome for the gallery editor: the Topnav plus the Settings/Photos/
// Analytics tab row. Each editor sub-page renders this with its own `active`.
export function GalleryHeader({
  galleryId,
  title,
  slug,
  passwordProtected,
  status,
  user,
  active,
}: Props) {
  return (
    // Sticky chrome — the topnav + tab row stay pinned while the page body
    // scrolls beneath them (the window is the scroll container).
    <div className="sticky top-0 z-20 bg-bg border-b border-border">
      <Topnav
        title={title}
        subtitle={`/g/${slug} · ${passwordProtected ? "password-protected" : "no password"}`}
        user={user}
        action={
          <>
            <StatusControl galleryId={galleryId} status={status} />
            <Link
              href={`/g/${slug}`}
              target="_blank"
              rel="noreferrer"
              className={buttonClasses("secondary", "tracking-wider")}
            >
              <External size={16} />
              Preview
            </Link>
          </>
        }
      />

      <nav className="flex items-center gap-4 px-4 pt-4 pb-4 overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden">
        <Tab
          href={`/admin/galleries/${galleryId}`}
          active={active === "settings"}
        >
          Settings
        </Tab>
        <Tab
          href={`/admin/galleries/${galleryId}/media`}
          active={active === "media"}
        >
          Media
        </Tab>
        <Tab
          href={`/admin/galleries/${galleryId}/comments`}
          active={active === "comments"}
        >
          Comments
        </Tab>
        <Tab
          href={`/admin/galleries/${galleryId}/lists`}
          active={active === "lists"}
        >
          Lists
        </Tab>
        <Tab
          href={`/admin/galleries/${galleryId}/analytics`}
          active={active === "analytics"}
        >
          Analytics
        </Tab>
      </nav>
    </div>
  );
}

function Tab({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  const base =
    "inline-flex items-center gap-2 rounded-md border px-4 py-2.5 text-sm font-bold tracking-wider transition-colors";

  return (
    <Link
      href={href}
      className={`${base} ${
        active
          ? "bg-accent text-ink-inverse border-accent"
          : "bg-surface text-ink-muted border-border hover:bg-surface-2 hover:text-ink-strong hover:border-border-strong"
      }`}
    >
      {children}
    </Link>
  );
}
