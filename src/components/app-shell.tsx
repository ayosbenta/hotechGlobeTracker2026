import { LayoutDashboard, Menu, X } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { NavLink } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { environment } from "@/config/env";
import { cn } from "@/lib/utils";
import { APP_ROUTES, routeForRole } from "@/routes/constants";
import { ROLE_DEFINITIONS, ROLES, type Role } from "@/types/roles";

interface AppShellProps {
  readonly role: Role;
  readonly children: ReactNode;
}

const navigation = [
  { label: "Overview", icon: LayoutDashboard, path: APP_ROUTES.home },
] as const;

export function AppShell({ role, children }: AppShellProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const roleDefinition = ROLE_DEFINITIONS[role];

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f7fbff] text-slate-950">
      <header className="sticky top-0 z-20 border-b border-blue-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <NavLink
            className="flex min-w-0 items-center gap-3"
            to={routeForRole(role)}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-600 text-sm font-bold text-white">
              HG
            </span>
            <span className="truncate text-sm font-bold tracking-tight text-blue-950 sm:text-base">
              {environment.appName}
            </span>
          </NavLink>

          <div className="hidden items-center gap-2 sm:flex">
            <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-800">
              {roleDefinition.label} portal
            </span>
          </div>

          <Button
            aria-expanded={isMenuOpen}
            aria-label="Toggle navigation"
            className="sm:hidden"
            onClick={() => setIsMenuOpen((current) => !current)}
            size="sm"
            variant="ghost"
          >
            {isMenuOpen ? (
              <X aria-hidden="true" />
            ) : (
              <Menu aria-hidden="true" />
            )}
          </Button>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl">
        <aside
          className={cn(
            "fixed inset-x-0 top-16 z-10 border-b border-blue-100 bg-white px-4 py-3 shadow-panel sm:static sm:block sm:w-60 sm:shrink-0 sm:border-b-0 sm:border-r sm:px-4 sm:py-6 sm:shadow-none",
            isMenuOpen ? "block" : "hidden",
          )}
        >
          <nav aria-label="Portal navigation" className="space-y-1">
            {navigation.map(({ label, icon: Icon }) => (
              <NavLink
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold",
                    isActive
                      ? "bg-blue-600 text-white"
                      : "text-slate-600 hover:bg-cyan-50 hover:text-blue-800",
                  )
                }
                key={label}
                onClick={() => setIsMenuOpen(false)}
                to={routeForRole(role)}
              >
                <Icon aria-hidden="true" className="size-4" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="px-3 pb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
              Role preview
            </p>
            <div className="flex flex-wrap gap-1 px-2">
              {ROLES.map((previewRole) => (
                <NavLink
                  className={({ isActive }) =>
                    cn(
                      "rounded-lg px-2 py-1 text-xs font-semibold",
                      isActive
                        ? "bg-cyan-100 text-blue-800"
                        : "text-slate-500 hover:bg-slate-100",
                    )
                  }
                  key={previewRole}
                  onClick={() => setIsMenuOpen(false)}
                  to={routeForRole(previewRole)}
                >
                  {ROLE_DEFINITIONS[previewRole].label}
                </NavLink>
              ))}
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
