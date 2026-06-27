"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navItems = [
  { href: "/", label: "Command Center", icon: IconGrid },
  { href: "/analytics", label: "Analytics", icon: IconChart },
  { href: "/whatsapp", label: "WhatsApp Intake", icon: IconMessage },
  { href: "/submit", label: "New Request", icon: IconInbox },
];

function IconGrid() {
  return (
    <svg className="nav-icon" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10.5" y="1" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="1" y="10.5" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10.5" y="10.5" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg className="nav-icon" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M2 14.5H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M4 12V7M9 12V4M14 12V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconMessage() {
  return (
    <svg className="nav-icon" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3 4.5A2.5 2.5 0 0 1 5.5 2h7A2.5 2.5 0 0 1 15 4.5v4A2.5 2.5 0 0 1 12.5 11H8l-4 3v-3.2A2.5 2.5 0 0 1 3 8.5v-4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function IconInbox() {
  return (
    <svg className="nav-icon" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3 4h12l1 6v3.5A1.5 1.5 0 0 1 14.5 15h-11A1.5 1.5 0 0 1 2 13.5V10l1-6Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M2.5 10H6l1 2h4l1-2h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function IconLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M9 2.5 14.6 5.8v6.4L9 15.5l-5.6-3.3V5.8L9 2.5Z" stroke="white" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M6.4 8.8 8.2 10.6 11.8 6.8" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            <IconLogo />
          </div>
          <div className="brand-name">
            <span className="brand-title">Agentico</span>
            <span className="brand-sub">Agentico Ops</span>
          </div>
        </div>

        <nav className="nav-section" aria-label="Main">
          <span className="nav-label">Workspace</span>
          {navItems.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={`nav-item ${active ? "active" : ""}`}>
                <Icon />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="agent-status">
            <div className="agent-status-dot idle" />
            <span className="agent-status-text">Policy agent ready</span>
          </div>
          <span className="sidebar-version">Returns, refunds, delivery, warranty</span>
        </div>
      </aside>

      <main className="main-shell">{children}</main>
    </div>
  );
}

