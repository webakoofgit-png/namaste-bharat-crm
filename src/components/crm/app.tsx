import { useState, useEffect, lazy, Suspense } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Users,
  Store,
  Footprints,
  ShoppingBag,
  Gift,
  ChartNoAxesCombined,
  Settings2,
  ShieldCheck,
  Bell,
  CreditCard,
  ScanLine,
  UserRound,
  LogOut,
  Menu,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  ChevronDown,
  X,
  CircleCheck,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { api, setCsrf } from "@/lib/api";
import type { User, Role, Notification } from "@/lib/crm-types";
import { Auth, Brand } from "./auth";
import { Loading, ErrorState } from "./primitives";
const Dashboard = lazy(() => import("./dashboard").then((m) => ({ default: m.Dashboard })));
const Accounts = lazy(() => import("./accounts").then((m) => ({ default: m.Accounts })));
const Profile = lazy(() => import("./accounts").then((m) => ({ default: m.Profile })));
const MembershipPage = lazy(() =>
  import("./membership").then((m) => ({ default: m.MembershipPage })),
);
const Verification = lazy(() => import("./activity").then((m) => ({ default: m.Verification })));
const Visits = lazy(() => import("./activity").then((m) => ({ default: m.Visits })));
const Purchases = lazy(() => import("./activity").then((m) => ({ default: m.Purchases })));
const Cashback = lazy(() => import("./finance").then((m) => ({ default: m.Cashback })));
const Settings = lazy(() => import("./finance").then((m) => ({ default: m.Settings })));
const Notifications = lazy(() => import("./finance").then((m) => ({ default: m.Notifications })));
const Reports = lazy(() => import("./finance").then((m) => ({ default: m.Reports })));
const Audit = lazy(() => import("./finance").then((m) => ({ default: m.Audit })));
const allMenus = [
  {
    id: "dashboard",
    label: "Overview",
    icon: LayoutDashboard,
    roles: ["ADMIN", "VENDOR", "CUSTOMER"],
  },
  { id: "customers", label: "Customers", icon: Users, roles: ["ADMIN"] },
  { id: "vendors", label: "Vendors", icon: Store, roles: ["ADMIN"] },
  { id: "card", label: "Membership card", icon: CreditCard, roles: ["CUSTOMER"] },
  { id: "verification", label: "Customer verification", icon: ScanLine, roles: ["VENDOR"] },
  {
    id: "visits",
    label: "Customer visits",
    icon: Footprints,
    roles: ["ADMIN", "VENDOR", "CUSTOMER"],
  },
  {
    id: "purchases",
    label: "Purchases",
    icon: ShoppingBag,
    roles: ["ADMIN", "VENDOR", "CUSTOMER"],
  },
  { id: "cashback", label: "Cashback", icon: Gift, roles: ["ADMIN", "CUSTOMER"] },
  { id: "confirmations", label: "Pending confirmations", icon: CircleCheck, roles: ["CUSTOMER"] },
  {
    id: "reports",
    label: "Reports & analytics",
    icon: ChartNoAxesCombined,
    roles: ["ADMIN", "VENDOR"],
  },
  { id: "settings", label: "Cashback settings", icon: Settings2, roles: ["ADMIN"] },
  { id: "audit", label: "Audit logs", icon: ShieldCheck, roles: ["ADMIN"] },
  {
    id: "notifications",
    label: "Notifications",
    icon: Bell,
    roles: ["ADMIN", "VENDOR", "CUSTOMER"],
  },
  { id: "profile", label: "My profile", icon: UserRound, roles: ["ADMIN", "VENDOR", "CUSTOMER"] },
];
const descriptions: Record<string, string> = {
  dashboard: "Here’s what’s happening in your network today.",
  customers: "Build lasting connections with your members.",
  vendors: "Manage the businesses that make your network stronger.",
  card: "Your connection to local businesses and rewards.",
  verification: "Look up an active customer membership securely.",
  visits: "Track visits with customer-confirmed presence.",
  purchases: "Manage bills, customer confirmations and verification.",
  confirmations: "Review the purchases waiting for your confirmation.",
  cashback: "Every reward from generation to manual payment.",
  reports: "Turn your business activity into useful insights.",
  settings: "Manage the rate for future purchase rewards.",
  audit: "A traceable history of actions across your CRM.",
  notifications: "All your updates in one place.",
  profile: "Your account and contact information.",
};
export function CRMApp() {
  const frontendOnly = import.meta.env["VITE_FRONTEND_ONLY"] === "true";
  const client = useQueryClient();
  const session = useQuery({
    queryKey: ["session"],
    enabled: !frontendOnly,
    queryFn: async () => {
      try {
        const data = await api<{ user: User; csrf: string }>("/auth/me");
        setCsrf(data.csrf);
        return data.user;
      } catch (e) {
        if ((e as Error).message.includes("Sign in") || (e as Error).message.includes("expired"))
          return null;
        throw e;
      }
    },
    retry: false,
    staleTime: 60000,
  });
  function onLogin(user: User) {
    client.removeQueries({ predicate: (query) => query.queryKey[0] !== "session" });
    client.setQueryData(["session"], user);
  }
  return (
    <>
      <Toaster richColors position="top-right" />
      {frontendOnly ? (
        <Auth onLogin={onLogin} />
      ) : session.isPending ? (
        <Loading />
      ) : session.error ? (
        <div className="connection-error">
          <Brand />
          <ErrorState message={session.error.message} retry={() => void session.refetch()} />
          <p>
            Start the backend with <code>npm --prefix backend run dev</code> and check your database
            configuration.
          </p>
        </div>
      ) : session.data ? (
        <Workspace
          user={session.data}
          onLogout={() => {
            setCsrf("");
            client.removeQueries({ predicate: (query) => query.queryKey[0] !== "session" });
            client.setQueryData(["session"], null);
          }}
        />
      ) : (
        <Auth onLogin={onLogin} />
      )}
    </>
  );
}
function Workspace({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [page, setPage] = useState("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const menus = allMenus.filter((m) => m.roles.includes(user.role));
  const navigate = (value: string) => {
    if (menus.some((m) => m.id === value)) {
      setPage(value);
      setMobile(false);
      window.location.hash = value;
    }
  };
  useEffect(() => {
    const change = () => {
      const value = window.location.hash.slice(1);
      if (menus.some((m) => m.id === value)) {
        setPage(value);
        setMobile(false);
      }
    };
    change();
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, [user.role]);
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<Notification[]>("/notifications"),
    refetchInterval: 30000,
  });
  const unread = notifications.data?.filter((n) => !n.read).length || 0;
  const rangeParams = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) });
  const range = rangeParams.size ? `?${rangeParams}` : "";
  const roleName =
    user.role === "ADMIN" ? "Super Admin" : user.role === "VENDOR" ? "Vendor" : "Customer";
  const datedPage = ["dashboard", "visits", "purchases", "cashback", "reports"].includes(page);
  return (
    <div className={`crm-layout ${collapsed ? "sidebar-collapsed" : ""}`}>
      {mobile && (
        <button
          className="mobile-overlay"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`crm-sidebar ${mobile ? "mobile-open" : ""}`}>
        <div className="sidebar-brand">
          <Brand compact />
          <button
            className="mobile-close icon-button"
            aria-label="Close navigation"
            onClick={() => setMobile(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-label">
          <span className="workspace-dot" />
          {roleName} workspace
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {menus
            .filter((m) => !["settings", "audit", "profile", "notifications"].includes(m.id))
            .map((m) => (
              <button
                key={m.id}
                title={m.label}
                className={`nav-item ${page === m.id ? "active" : ""}`}
                onClick={() => navigate(m.id)}
              >
                <m.icon size={19} />
                <span>{m.label}</span>
                {page === m.id && <i />}
              </button>
            ))}
          <div className="nav-label management-label">MANAGEMENT</div>
          {menus
            .filter((m) => ["settings", "audit", "profile", "notifications"].includes(m.id))
            .map((m) => (
              <button
                key={m.id}
                title={m.label}
                className={`nav-item ${page === m.id ? "active" : ""}`}
                onClick={() => navigate(m.id)}
              >
                <m.icon size={19} />
                <span>{m.label}</span>
                {m.id === "notifications" && unread > 0 && <b className="nav-count">{unread}</b>}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-help">
            <ShieldCheck size={23} />
            <strong>Connected. Protected.</strong>
            <p>Your workspace is secured with role-based access.</p>
          </div>
          <button
            className="nav-item"
            disabled={loggingOut}
            onClick={async () => {
              setLoggingOut(true);
              try {
                await api("/auth/logout", { method: "POST", body: "{}" });
                onLogout();
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setLoggingOut(false);
              }
            }}
          >
            <LogOut size={19} />
            <span>{loggingOut ? "Signing out…" : "Sign out"}</span>
          </button>
          <button
            className="collapse-button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight size={17} />
            ) : (
              <>
                <ChevronLeft size={17} />
                <span>Collapse sidebar</span>
              </>
            )}
          </button>
        </div>
      </aside>
      <div className="crm-main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{menus.find((m) => m.id === page)?.label}</strong>
          </div>
          <div className="topbar-right">
            <span className="live-status">
              <i /> Live workspace
            </span>
            <button
              className="notification-button icon-button"
              aria-label={`Notifications, ${unread} unread`}
              onClick={() => navigate("notifications")}
            >
              <Bell size={20} />
              {unread > 0 && <b>{unread}</b>}
            </button>
            <button className="user-menu" onClick={() => navigate("profile")}>
              <span className="avatar">{user.name[0]}</span>
              <span>
                <strong>{user.name}</strong>
                <small>{roleName}</small>
              </span>
              <ChevronDown size={14} />
            </button>
          </div>
        </header>
        <main className="workspace-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">NAMASTE BHARAT 24 / {roleName.toUpperCase()}</span>
              <h1>
                {page === "dashboard"
                  ? `Welcome back, ${user.name.split(" ")[0]}`
                  : menus.find((m) => m.id === page)?.label}
                <span className="heading-dot">.</span>
              </h1>
              <p>{descriptions[page]}</p>
            </div>
            {datedPage && (
              <div className="date-range">
                <CalendarDays size={17} />
                <label>
                  <span className="sr-only">From date</span>
                  <input
                    type="date"
                    aria-label="From date"
                    value={from}
                    max={to || undefined}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </label>
                <span>—</span>
                <label>
                  <span className="sr-only">To date</span>
                  <input
                    type="date"
                    aria-label="To date"
                    value={to}
                    min={from || undefined}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </label>
                {(from || to) && (
                  <button
                    aria-label="Clear date filters"
                    className="icon-button"
                    onClick={() => {
                      setFrom("");
                      setTo("");
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            )}
          </div>
          <Suspense fallback={<Loading />}>
            {page === "dashboard" && (
              <Dashboard role={user.role} range={range} navigate={navigate} />
            )}
            {page === "customers" && user.role === "ADMIN" && <Accounts kind="CUSTOMER" />}
            {page === "vendors" && user.role === "ADMIN" && <Accounts kind="VENDOR" />}
            {page === "verification" && user.role === "VENDOR" && <Verification />}
            {page === "card" && user.role === "CUSTOMER" && <MembershipPage />}
            {page === "visits" && <Visits role={user.role} range={range} />}
            {page === "purchases" && <Purchases role={user.role} range={range} />}
            {page === "confirmations" && user.role === "CUSTOMER" && (
              <Purchases key="pending" role={user.role} range={range} initialStatus="PENDING" />
            )}
            {page === "cashback" && user.role !== "VENDOR" && (
              <Cashback role={user.role} range={range} />
            )}
            {page === "reports" && user.role !== "CUSTOMER" && (
              <Reports role={user.role} range={range} />
            )}
            {page === "settings" && user.role === "ADMIN" && <Settings />}
            {page === "audit" && user.role === "ADMIN" && <Audit />}
            {page === "notifications" && <Notifications />}
            {page === "profile" && <Profile user={user} />}
          </Suspense>
          <footer className="workspace-footer">
            <span>© {new Date().getFullYear()} Namaste Bharat 24</span>
            <span>Built for connections that count.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
