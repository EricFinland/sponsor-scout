"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isSharedWorkspace } from "@/lib/store";

const LINKS = [
  { href: "/", label: "Companies", match: (path: string) => path === "/" || path.startsWith("/company") },
  { href: "/lookup", label: "Look up", match: (path: string) => path.startsWith("/lookup") },
  { href: "/tracker", label: "Tracker", match: (path: string) => path.startsWith("/tracker") },
  { href: "/method", label: "Method", match: (path: string) => path.startsWith("/method") },
];

export default function NavLinks({ shared = false }: { shared?: boolean }) {
  const path = usePathname();
  return (
    <nav aria-label="Main">
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} prefetch={!shared} aria-current={link.match(path) ? "page" : undefined}
          onClick={(event) => {
            if (!shared || !isSharedWorkspace() || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            window.history.pushState(null, "", link.href);
            window.scrollTo(0, 0);
          }}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
