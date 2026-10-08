import { useEffect, useRef, useState } from "react";
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Crown,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { hasPermission, Permission, type Role } from "@fixora/shared-types";
import { cx, Logo } from "@fixora/ui";
import { Avatar } from "../../components/Avatar";
import { PermissionsSheet } from "../../components/PermissionsSheet";
import { notificationApi } from "../../lib/endpoints";
import { signOut, useAuth } from "../../store/auth";
import { ADMIN_NAV, ALL_NAV, MAIN_NAV, type AdminNavItem } from "./nav";

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  OPERATIONS: "Operations",
  SUPPORT: "Support",
  FINANCE: "Finance",
  FRANCHISE_ADMIN: "Franchise Manager",
  TECHNICIAN: "Technician",
  CUSTOMER: "Customer",
};

/** Desktop-first admin shell: navy sidebar (collapsible / drawer on small screens) + top bar. */
export function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  // The drawer belongs to the page it was opened on, so navigating closes it.
  const location = useLocation();
  const [drawerAt, setDrawerAt] = useState<string | null>(null);
  const drawer = drawerAt === location.pathname;
  const setDrawer = (open: boolean) =>
    setDrawerAt(open ? location.pathname : null);

  return (
    <div className="min-h-dvh overflow-x-clip bg-[#F5F7FB]">
      {/* Desktop sidebar */}
      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-40 hidden flex-col bg-fixora-navy text-white transition-[width] lg:flex",
          collapsed ? "w-[76px]" : "w-[264px]",
        )}
      >
        <SidebarContent
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
        />
      </aside>

      {/* Mobile / tablet drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-slate-900/50"
            onClick={() => setDrawer(false)}
          />
          <aside className="relative flex h-full w-[min(264px,85vw)] flex-col bg-fixora-navy pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-white">
            <button
              onClick={() => setDrawer(false)}
              aria-label="Close menu"
              className="absolute top-[calc(1.25rem+env(safe-area-inset-top))] right-3 rounded-lg p-1.5 text-white/70 hover:bg-white/10"
            >
              <X className="size-5" />
            </button>
            <SidebarContent collapsed={false} />
          </aside>
        </div>
      )}

      <div
        className={cx(
          "min-w-0 transition-[padding]",
          collapsed ? "lg:pl-[76px]" : "lg:pl-[264px]",
        )}
      >
        <TopBar onMenu={() => setDrawer(true)} />
        <main className="min-w-0 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 lg:px-8">
          <ModuleGuard />
        </main>
        <PermissionsSheet location={false} />
      </div>
    </div>
  );
}

/** Each module needs its own permission (the API enforces it too); others go back to the dashboard. */
function ModuleGuard() {
  const role = useAuth((s) => s.user?.role);
  const slug = useLocation().pathname.split("/")[2] ?? "";
  const item = ALL_NAV.find((n) => n.slug === slug);
  if (item && role && !hasPermission(role, item.permission))
    return <Navigate to="/admin" replace />;
  return <Outlet />;
}

function SidebarContent({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle?: () => void;
}) {
  const role = useAuth((s) => s.user?.role);
  const franchise = useAuth((s) => s.user?.franchise);
  const allowed = (i: AdminNavItem) =>
    !!role && hasPermission(role, i.permission);
  const main = MAIN_NAV.filter(allowed);
  const admin = ADMIN_NAV.filter(allowed);

  return (
    <>
      <div
        className={cx(
          "flex h-[76px] items-center border-b border-white/10",
          collapsed ? "justify-center" : "justify-between px-5",
        )}
      >
        <Link to="/admin" aria-label="RapidFix admin home">
          {collapsed ? (
            <Logo tone="light" markOnly size="sm" />
          ) : (
            <Logo tone="light" size="sm" />
          )}
        </Link>
        {onToggle && !collapsed && (
          <button
            onClick={onToggle}
            aria-label="Collapse sidebar"
            className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <ChevronsLeft className="size-5" />
          </button>
        )}
      </div>
      {onToggle && collapsed && (
        <button
          onClick={onToggle}
          aria-label="Expand sidebar"
          className="mx-auto mt-3 rounded-lg p-1.5 text-white/70 hover:bg-white/10"
        >
          <ChevronsRight className="size-5" />
        </button>
      )}
      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Admin">
        <NavGroup items={main} collapsed={collapsed} />
        {admin.length > 0 && (
          <>
            <p
              className={cx(
                "mt-6 mb-2 px-3 text-[11px] font-semibold tracking-wider text-white/50",
                collapsed && "sr-only",
              )}
            >
              ADMIN
            </p>
            <NavGroup items={admin} collapsed={collapsed} />
          </>
        )}
      </nav>
      {role && !collapsed && (
        <div className="m-3 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
          {role === "SUPER_ADMIN" ? (
            <Crown
              className="size-6 fill-amber-400 text-amber-400"
              aria-hidden
            />
          ) : (
            <ShieldCheck className="size-6 text-fixora-cyan" aria-hidden />
          )}
          <div>
            <p className="text-sm font-semibold">{ROLE_LABEL[role]}</p>
            <p className="text-xs text-white/60">
              {role === "SUPER_ADMIN"
                ? "Full Access"
                : franchise
                  ? `${franchise.name} only`
                  : "Role-based access"}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function NavGroup({
  items,
  collapsed,
}: {
  items: AdminNavItem[];
  collapsed: boolean;
}) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map(({ slug, label, icon: Icon }) => (
        <li key={slug}>
          <NavLink
            to={slug ? `/admin/${slug}` : "/admin"}
            end={!slug}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              cx(
                "flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors",
                collapsed && "justify-center px-0",
                isActive
                  ? "bg-fixora-blue text-white shadow-[0_6px_16px_rgb(37_99_235/0.35)]"
                  : "text-white/80 hover:bg-white/8 hover:text-white",
              )
            }
          >
            <Icon className="size-5 shrink-0" aria-hidden />
            <span className={cx(collapsed && "sr-only")}>{label}</span>
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

function TopBar({ onMenu }: { onMenu(): void }) {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const canSearch = !!user && hasPermission(user.role, Permission.USERS_MANAGE);
  const unread =
    useQuery({
      queryKey: ["notifications", "unread"],
      queryFn: notificationApi.unreadCount,
      refetchInterval: 60_000,
    }).data?.count ?? 0;

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenu(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex min-h-[64px] items-center gap-2 border-b border-slate-200/70 bg-white/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur sm:min-h-[76px] sm:gap-3 sm:px-6 lg:px-8">
      <button
        onClick={onMenu}
        aria-label="Open menu"
        className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 lg:hidden"
      >
        <Menu className="size-5" />
      </button>
      {canSearch ? (
        <form
          role="search"
          className="flex h-11 min-w-0 max-w-xl flex-1 items-center gap-2 rounded-xl bg-slate-100 px-3 sm:px-4"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(`/admin/users?q=${encodeURIComponent(q.trim())}`);
          }}
        >
          <Search className="size-4.5 shrink-0 text-slate-500" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search customers, technicians, staff…"
            aria-label="Search people"
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-500"
          />
        </form>
      ) : (
        <p className="min-w-0 truncate text-[15px] font-semibold text-slate-900">
          {user?.franchise?.name ?? "RapidFix"}
        </p>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-4">
        <span
          className="relative hidden size-10 items-center justify-center rounded-full text-slate-700 sm:flex"
          aria-label={`${unread} unread notifications`}
        >
          <Bell className="size-5.5" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 flex min-w-4.5 items-center justify-center rounded-full bg-danger px-1 text-[10px] leading-4.5 font-bold text-white">
              {unread}
            </span>
          )}
        </span>
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenu((v) => !v)}
            aria-expanded={menu}
            aria-haspopup="menu"
            className="flex items-center gap-3 rounded-xl py-1.5 pr-1 pl-1.5 hover:bg-slate-100"
          >
            <Avatar name={user?.name} src={user?.avatarUrl} size={36} />
            <span className="hidden text-left sm:block">
              <span className="block text-sm font-semibold text-slate-900">
                {user?.name ?? "Admin"}
              </span>
              <span className="block text-xs text-slate-500">
                {user && ROLE_LABEL[user.role]}
              </span>
            </span>
            <ChevronDown className="size-4 text-slate-500" aria-hidden />
          </button>
          {menu && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-100 bg-white p-1.5 shadow-raised"
            >
              <p className="truncate px-3 py-2 text-xs text-slate-500">
                {user?.email ?? user?.phone}
              </p>
              <button
                role="menuitem"
                onClick={async () => {
                  await signOut();
                  navigate("/login", { replace: true });
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-danger hover:bg-danger-soft"
              >
                <LogOut className="size-4" /> Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
