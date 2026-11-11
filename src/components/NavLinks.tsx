"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Companies", match: (path: string) => path === "/" || path.startsWith("/company") },
  { href: "/lookup", label: "Look up", match: (path: string) => path.startsWith("/lookup") },
  { href: "/tracker", label: "Tracker", match: (path: string) => path.startsWith("/tracker") },
  { href: "/method", label: "Method", match: (path: string) => path.startsWith("/method") },
];

export default function NavLinks() {
  const path = usePathname();
  return (
    <nav aria-label="Main">
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} aria-current={link.match(path) ? "page" : undefined}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
