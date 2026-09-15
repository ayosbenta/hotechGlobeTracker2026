import {
  Bell,
  ClipboardList,
  FilePlus2,
  LayoutDashboard,
  LogOut,
  Menu,
  Orbit,
  Search,
  Settings,
  UserCircle,
  Users,
  Wrench,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { useAuth } from "@/auth/auth-context";
import { Button } from "@/components/ui/button";
import { environment } from "@/config/env";
import { cn } from "@/lib/utils";
import { routeForRole } from "@/routes/constants";
import { ROLE_DEFINITIONS, type Role } from "@/types/roles";

interface DashboardShellProps {
  readonly role: Role;
  readonly children: ReactNode;
}

interface NavigationItem {
  readonly label: string;
  readonly icon: LucideIcon;
}

const navigationByRole: Record<Role, readonly NavigationItem[]> = {
  admin: [
    { label: "Dashboard", icon: LayoutDashboard },
    { label: "Applications", icon: ClipboardList },
    { label: "Agents", icon: Users },
    { label: "Processors", icon: Wrench },
    { label: "Reports", icon: ClipboardList },
    { label: "Settings", icon: Settings },
  ],
  agent: [
    { label: "Dashboard", icon: LayoutDashboard },
    { label: "New Application", icon: FilePlus2 },
    { label: "My Applications", icon: ClipboardList },
    { label: "Globe Plans", icon: Orbit },
    { label: "Profile", icon: UserCircle },
  ],
  processor: [
    { label: "Dashboard", icon: LayoutDashboard },
    { label: "Application Queue", icon: ClipboardList },
    { label: "My Assigned", icon: UserCircle },
    { label: "Profile", icon: UserCircle },
  ],
};

const profileByRole: Record<
  Role,
  { readonly name: string; readonly initials: string }
> = {
  admin: { name: "Admin User", initials: "AD" },
  agent: { name: "Maria Santos", initials: "MS" },
  processor: { name: "Juan Dela Cruz", initials: "JD" },
};

function Sidebar({
  onNavigate,
  role,
}: Pick<DashboardShellProps, "role"> & { readonly onNavigate: () => void }) {
  const navigation = navigationByRole[role];
  const roleLabel = ROLE_DEFINITIONS[role].label;

  return (
    <aside className="flex h-full flex-col bg-[linear-gradient(155deg,#06357f_0%,#0867cc_55%,#20b9ee_100%)] px-3 py-6 text-white">
      <NavLink
        className="flex items-center gap-3 px-3"
        onClick={onNavigate}
        to={routeForRole(role)}
      >
        <span className="grid size-9 place-items-center rounded-xl bg-white/15 text-cyan-100">
          <Orbit aria-hidden="true" className="size-6" />
        </span>
        <span>
          <span className="block text-base font-bold tracking-tight">
            {environment.appName}
          </span>
          <span className="block pt-0.5 text-sm text-cyan-100">
            {roleLabel} Portal
          </span>
        </span>
      </NavLink>

      <nav aria-label={`${roleLabel} navigation`} className="mt-9 space-y-1.5">
        {navigation.map(({ icon: Icon, label }, index) => {
          const isDashboard = index === 0;

          return isDashboard ? (
            <NavLink
              className={({ isActive }) =>
                cn(
                  "flex min-h-12 items-center gap-3 rounded-lg px-4 text-sm font-semibold transition-colors",
                  isActive
                    ? "bg-[#1984ed] text-white shadow-lg shadow-blue-950/15"
                    : "text-blue-50 hover:bg-white/10",
                )
              }
              key={label}
              onClick={onNavigate}
              to={routeForRole(role)}
            >
              <Icon aria-hidden="true" className="size-5" />
              {label}
            </NavLink>
          ) : (
            <button
              className="flex min-h-12 w-full items-center gap-3 rounded-lg px-4 text-left text-sm font-medium text-blue-50 transition-colors hover:bg-white/10"
              key={label}
              onClick={onNavigate}
              type="button"
            >
              <Icon aria-hidden="true" className="size-5" />
              {label}
            </button>
          );
        })}
      </nav>

      <p className="mt-auto border-t border-white/20 px-3 pt-6 text-sm leading-5 text-cyan-100">
        {role === "agent"
          ? "Connecting more homes for a brighter tomorrow."
          : "Tracking today. Building a stronger tomorrow."}
      </p>
    </aside>
  );
}

export function DashboardShell({ role, children }: DashboardShellProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const profile = profileByRole[role];
  const roleLabel = ROLE_DEFINITIONS[role].label;
  const { logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      // logout() always resolves the frontend to unauthenticated even if
      // the network call itself failed (safe/idempotent server contract);
      // navigating to /login is therefore correct in every outcome.
      navigate("/login", { replace: true });
    }
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f4f9ff] text-[#07183f]">
      <div className="fixed inset-y-0 left-0 z-30 hidden w-[272px] lg:block">
        <Sidebar onNavigate={() => undefined} role={role} />
      </div>

      {isDrawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="presentation">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-950/35"
            onClick={() => setIsDrawerOpen(false)}
            type="button"
          />
          <div className="relative h-full w-[min(84vw,288px)] shadow-2xl">
            <Sidebar onNavigate={() => setIsDrawerOpen(false)} role={role} />
          </div>
        </div>
      ) : null}

      <div className="min-h-screen lg:pl-[272px]">
        <header className="sticky top-0 z-20 border-b border-[#dbe8f7] bg-white/95 backdrop-blur">
          <div className="flex min-h-[72px] items-center gap-3 px-4 sm:px-6 lg:px-9">
            <Button
              aria-label="Open navigation"
              className="lg:hidden"
              onClick={() => setIsDrawerOpen(true)}
              size="lg"
              variant="ghost"
            >
              <Menu aria-hidden="true" className="size-5" />
            </Button>
            <label className="relative min-w-0 flex-1 lg:max-w-[410px]">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-500"
              />
              <input
                aria-label="Search applications"
                className="h-11 w-full rounded-lg border border-[#ccdced] bg-[#fbfdff] pl-11 pr-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder={
                  role === "admin"
                    ? "Search applications, customers, or agents..."
                    : "Search applications, applicant name, or plan..."
                }
                type="search"
              />
            </label>
            <button
              aria-label="Notifications"
              className="relative grid size-11 shrink-0 place-items-center rounded-lg text-slate-600 hover:bg-blue-50"
              type="button"
            >
              <Bell aria-hidden="true" className="size-5" />
              <span className="absolute right-2 top-2 size-2 rounded-full bg-red-500 ring-2 ring-white" />
            </button>
            <button
              aria-label={isLoggingOut ? "Signing out…" : "Sign out"}
              className="hidden min-h-11 items-center gap-3 rounded-lg px-2 text-left hover:bg-blue-50 disabled:opacity-60 sm:flex"
              disabled={isLoggingOut}
              onClick={() => void handleLogout()}
              type="button"
            >
              <span className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-blue-800 to-cyan-500 text-xs font-bold text-white">
                {profile.initials}
              </span>
              <span className="hidden xl:block">
                <span className="block text-sm font-bold text-slate-900">
                  {profile.name}
                </span>
                <span className="block text-xs text-slate-500">
                  {roleLabel}
                </span>
              </span>
              <LogOut aria-hidden="true" className="size-4 text-slate-500" />
            </button>
            <Button
              aria-label="Close navigation"
              className="hidden"
              onClick={() => setIsDrawerOpen(false)}
              size="sm"
              variant="ghost"
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-9 lg:py-7">
          {children}
        </main>
      </div>
    </div>
  );
}
