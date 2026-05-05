"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";
import { Menu, X, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { usePermissions } from "@/hooks/use-permissions";
import { navigation, bottomNav, externalNav } from "./nav-items";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { canManageSettings } = usePermissions();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        onClick={() => setOpen(true)}
        className="p-2 hover:bg-gray-50"
        aria-label="Open navigation menu"
      >
        <Menu size={20} strokeWidth={1.5} className="text-gray-900" />
      </button>

      {open && createPortal(
        <>
          <button
            type="button"
            aria-label="Close navigation menu"
            tabIndex={-1}
            className="fixed inset-0 z-40 bg-black/40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            className="fixed inset-y-0 left-0 z-50 w-[200px] bg-white border-r border-gray-900 flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-label="Main navigation"
          >
            <div className="flex items-center justify-between p-4 h-16">
              <Link href="/overview" onClick={() => setOpen(false)} className="flex items-center gap-2">
                <Logo className="h-8 w-auto" />
              </Link>
              <button onClick={() => setOpen(false)} className="p-1.5 hover:bg-gray-50" aria-label="Close navigation menu">
                <X size={16} strokeWidth={1.5} className="text-gray-900" />
              </button>
            </div>

            <nav className="flex-1 px-3 py-2 space-y-0.5" aria-label="Main navigation">
              {navigation.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-label={item.name}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 text-[14px] font-medium uppercase tracking-caps",
                      isActive
                        ? "text-gray-900 border-l-2 border-accent"
                        : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                    )}
                  >
                    <Icon size={18} strokeWidth={1.5} />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="px-3 py-3 border-t border-gray-100 space-y-0.5">
              {canManageSettings && bottomNav.map((item) => {
                const isActive = pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-label={item.name}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 text-[14px] font-medium uppercase tracking-caps",
                      isActive
                        ? "text-gray-900 border-l-2 border-accent"
                        : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                    )}
                  >
                    <Icon size={18} strokeWidth={1.5} />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
              {externalNav.map((item) => {
                const Icon = item.icon;
                return (
                  <a
                    key={item.name}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setOpen(false)}
                    aria-label={item.name}
                    className="flex items-center gap-3 px-3 py-2.5 text-[14px] font-medium uppercase tracking-caps text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                  >
                    <Icon size={18} strokeWidth={1.5} />
                    <span>{item.name}</span>
                  </a>
                );
              })}
              <button
                onClick={() => signOut({ redirectTo: "/login" })}
                aria-label="Sign out"
                className="flex items-center gap-3 px-3 py-2.5 text-[14px] font-medium uppercase tracking-caps w-full text-gray-500 hover:text-gray-900 hover:bg-gray-50"
              >
                <LogOut size={18} strokeWidth={1.5} />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
