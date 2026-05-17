"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { GitHubLink } from "@/components/ui/built-by";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { usePermissions } from "@/hooks/use-permissions";
import { navigation, bottomNav, externalNav } from "./nav-items";

interface SidebarProps {
  companyName?: string;
}

function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative group/tooltip">
      {children}
      <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1 bg-gray-900 text-white text-[12px] font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover/tooltip:opacity-100 z-50 border border-gray-900">
        {label}
      </div>
    </div>
  );
}

export function Sidebar({ companyName }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { canManageSettings } = usePermissions();

  function NavLink({ name, href, icon: Icon }: { name: string; href: string; icon: LucideIcon }) {
    const isActive = pathname === href || pathname.startsWith(href + "/");
    const link = (
      <Link
        href={href}
        aria-label={collapsed ? name : undefined}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 text-[14px] font-medium uppercase tracking-caps",
          isActive
            ? "text-gray-900 border-l-2 border-accent bg-error-tint"
            : "text-gray-500 hover:text-gray-900 hover:bg-gray-50",
          collapsed && "justify-center px-2"
        )}
      >
        <Icon size={20} strokeWidth={1.5} className="text-gray-900" />
        {!collapsed && <span>{name}</span>}
      </Link>
    );
    return collapsed ? <Tooltip label={name}>{link}</Tooltip> : link;
  }

  return (
    <aside
      className={cn(
        "hidden lg:flex h-screen bg-white border-r border-gray-900 flex-col",
        collapsed ? "w-[72px]" : "w-[260px]"
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          "flex items-center p-4",
          collapsed ? "flex-col justify-center gap-2 py-3" : "h-16 justify-between"
        )}
      >
        <Link
          href="/overview"
          className={cn("flex items-center gap-2", collapsed && "justify-center")}
        >
          {collapsed ? (
            <span className="text-lg font-bold text-gray-900">P</span>
          ) : (
            <Logo className="h-8 w-auto" />
          )}
        </Link>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 hover:bg-gray-50"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronLeft
            size={16}
            strokeWidth={1.5}
            className={cn("text-gray-900", collapsed && "rotate-180")}
          />
        </button>
      </div>

      {/* Company name */}
      {companyName && !collapsed && (
        <div className="px-4 pb-2">
          <p className="text-[12px] font-medium text-gray-400 uppercase tracking-caps truncate">
            {companyName}
          </p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-0.5" aria-label="Main navigation">
        {navigation.map((item) => (
          <NavLink key={item.name} {...item} />
        ))}
      </nav>

      {/* Bottom Navigation */}
      <div className="px-3 py-3 border-t border-gray-100 space-y-0.5">
        {canManageSettings && bottomNav.map((item) => (
          <NavLink key={item.name} {...item} />
        ))}
        {externalNav.map((item) => {
          const Icon = item.icon;
          const link = (
            <a
              key={item.name}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={collapsed ? item.name : undefined}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 text-[14px] font-medium uppercase tracking-caps text-gray-500 hover:text-gray-900 hover:bg-gray-50",
                collapsed && "justify-center px-2"
              )}
            >
              <Icon size={20} strokeWidth={1.5} />
              {!collapsed && <span>{item.name}</span>}
            </a>
          );
          return collapsed ? <Tooltip key={item.name} label={item.name}>{link}</Tooltip> : link;
        })}
        {collapsed ? (
          <Tooltip label="GitHub"><GitHubLink collapsed /></Tooltip>
        ) : (
          <GitHubLink />
        )}
        {(() => {
          const signOutButton = (
            <button
              onClick={() => signOut({ redirectTo: "/login" })}
              aria-label={collapsed ? "Sign out" : undefined}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 text-[14px] font-medium uppercase tracking-caps w-full text-gray-500 hover:text-gray-900 hover:bg-gray-50",
                collapsed && "justify-center px-2"
              )}
            >
              <LogOut size={20} strokeWidth={1.5} />
              {!collapsed && <span>Sign out</span>}
            </button>
          );
          return collapsed ? <Tooltip label="Sign out">{signOutButton}</Tooltip> : signOutButton;
        })()}
      </div>
    </aside>
  );
}
