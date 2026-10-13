"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/overview", label: "Overview" },
  { href: "/leads", label: "Leads" },
  { href: "/spend", label: "Spend" },
  { href: "/jobs", label: "Jobs" },
  { href: "/settings", label: "Settings" },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="bg-ink text-ground">
      <div className="max-w-[1280px] mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <svg
            width="30"
            height="30"
            viewBox="0 0 32 32"
            aria-hidden="true"
          >
            <path
              d="M3 17 L16 6 L29 17"
              fill="none"
              stroke="#F08A4B"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M8 15 V26 H24 V15"
              fill="none"
              stroke="#F4F2EE"
              strokeWidth="2.4"
              strokeLinejoin="round"
            />
          </svg>
          <div className="flex flex-col">
            <span className="font-archivo font-extrabold text-lg tracking-tight">
              Ace Roofing NJ
            </span>
            <span className="text-xs text-header-subtle uppercase tracking-widest">
              Marketing numbers
            </span>
          </div>
        </div>

        <nav aria-label="Main" className="flex flex-wrap gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`
                  px-4 py-2.5 rounded-lg min-h-[44px] inline-flex items-center
                  font-medium text-sm transition-colors
                  ${
                    isActive
                      ? "bg-ground text-ink font-semibold"
                      : "text-header-text hover:text-white"
                  }
                `}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
