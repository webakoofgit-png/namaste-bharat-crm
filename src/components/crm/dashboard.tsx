import { useQuery } from "@tanstack/react-query";
import {
  Users,
  Store,
  Footprints,
  ShoppingBag,
  IndianRupee,
  Clock3,
  CircleCheck,
  Gift,
  ArrowUpRight,
  Wallet,
  ChartNoAxesCombined,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { api } from "@/lib/api";
import { MembershipPage } from "./membership";
import type { Dashboard as DashboardData, Role } from "@/lib/crm-types";
import { currency, date, Status, Empty, Loading, ErrorState, Table } from "./primitives";

export function Dashboard({
  role,
  range,
  navigate,
}: {
  role: Role;
  range: string;
  navigate: (page: string) => void;
}) {
  const query = useQuery({
    queryKey: ["dashboard", range],
    queryFn: () => api<DashboardData>(`/dashboard${range}`),
  });
  if (query.isPending) return <Loading />;
  if (query.error)
    return <ErrorState message={query.error.message} retry={() => void query.refetch()} />;
  const d = query.data;
  const metrics =
    role === "ADMIN"
      ? [
          {
            label: "Registered customers",
            value: d.customers.toLocaleString("en-IN"),
            icon: Users,
            color: "orange",
            detail: "Customers in your network",
            page: "customers",
          },
          {
            label: "Registered vendors",
            value: d.vendors.toLocaleString("en-IN"),
            icon: Store,
            color: "blue",
            detail: `${d.activeVendors} active · ${d.inactiveVendors} inactive`,
            page: "vendors",
          },
          {
            label: "Verified sales",
            value: currency(d.salesPaise),
            icon: IndianRupee,
            color: "green",
            detail: `${d.verifiedTransactions} verified purchases`,
            page: "purchases",
          },
          {
            label: "Cashback generated",
            value: currency(d.generatedPaise),
            icon: Gift,
            color: "purple",
            detail: "Rewards on verified purchases",
            page: "cashback",
          },
        ]
      : [
          {
            label: "Verified visits",
            value: String(d.visits),
            icon: Footprints,
            color: "orange",
            detail: `${d.pendingVisits} awaiting confirmation`,
            page: "visits",
          },
          {
            label: "Verified purchases",
            value: String(d.purchases),
            icon: ShoppingBag,
            color: "blue",
            detail: `${d.pendingTransactions} pending transactions`,
            page: "purchases",
          },
          {
            label: role === "VENDOR" ? "Total sales" : "Purchase amount",
            value: currency(d.salesPaise),
            icon: IndianRupee,
            color: "green",
            detail: "Verified purchases only",
            page: "purchases",
          },
          {
            label: role === "VENDOR" ? "Pending confirmations" : "Cashback earned",
            value: role === "VENDOR" ? String(d.pendingTransactions) : currency(d.generatedPaise),
            icon: role === "VENDOR" ? Clock3 : Gift,
            color: "purple",
            detail: role === "VENDOR" ? "Waiting for review" : `${currency(d.paidPaise)} paid`,
            page: role === "VENDOR" ? "purchases" : "cashback",
          },
        ];
  return (
    <>
      {role === "CUSTOMER" && <MembershipPage />}
      <div className="welcome-banner">
        <div>
          <span className="eyebrow">YOUR NETWORK AT A GLANCE</span>
          <h2>A little connection. A lot of growth.</h2>
          <p>Keep your business, customers and rewards moving forward.</p>
        </div>
        <div className="welcome-symbol">
          <ChartNoAxesCombined size={62} />
        </div>
      </div>
      <div className="kpi-grid">
        {metrics.map((m) => (
          <button className="kpi-card" key={m.label} onClick={() => navigate(m.page)}>
            <div className="kpi-top">
              <span>{m.label}</span>
              <div className={`metric-icon ${m.color}`}>
                <m.icon size={20} />
              </div>
            </div>
            <strong>{m.value}</strong>
            <small>
              {m.detail}
              <ArrowUpRight size={14} />
            </small>
          </button>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel sales-panel">
          <div className="panel-heading">
            <div>
              <h3>Sales overview</h3>
              <p>Verified purchase value over time</p>
            </div>
            <span className="legend-dot">Sales (₹)</span>
          </div>
          {d.monthly.length ? (
            <div className="chart">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={d.monthly}>
                  <defs>
                    <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#e78032" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#e78032" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#edf0f2" />
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: "#818791" }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: "#818791" }}
                  />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="sales"
                    stroke="#df792e"
                    fill="url(#salesFill)"
                    strokeWidth={3}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty
              title="Your growth story starts here"
              description="Sales charts appear after purchases are verified."
            />
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h3>Cashback overview</h3>
              <p>Every reward, accounted for</p>
            </div>
            <Wallet size={19} />
          </div>
          {d.generatedPaise ? (
            <div className="donut-chart">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={[
                      { name: "Pending", value: d.pendingPaise },
                      { name: "Approved", value: d.approvedPaise },
                      { name: "Paid", value: d.paidPaise },
                    ]}
                    innerRadius={56}
                    outerRadius={76}
                    dataKey="value"
                    paddingAngle={4}
                  >
                    {["#edab64", "#648bc4", "#469274"].map((c) => (
                      <Cell key={c} fill={c} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => currency(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="cashback-zero">
              <Gift size={35} />
              <strong>{currency(0)}</strong>
              <span>No rewards generated yet</span>
            </div>
          )}
          <div className="cashback-breakdown">
            <div>
              <span>
                <i className="dot pending" />
                Pending
              </span>
              <strong>{currency(d.pendingPaise)}</strong>
            </div>
            <div>
              <span>
                <i className="dot approved" />
                Approved
              </span>
              <strong>{currency(d.approvedPaise)}</strong>
            </div>
            <div>
              <span>
                <i className="dot paid" />
                Paid
              </span>
              <strong>{currency(d.paidPaise)}</strong>
            </div>
          </div>
        </section>
      </div>
      <div className="mini-kpi-grid">
        <div>
          <div className="metric-icon orange">
            <Footprints size={19} />
          </div>
          <span>
            Verified visits<strong>{d.visits}</strong>
          </span>
        </div>
        <div>
          <div className="metric-icon blue">
            <ShoppingBag size={19} />
          </div>
          <span>
            Verified purchases<strong>{d.purchases}</strong>
          </span>
        </div>
        <div>
          <div className="metric-icon purple">
            <Clock3 size={19} />
          </div>
          <span>
            Pending transactions<strong>{d.pendingTransactions}</strong>
          </span>
        </div>
        <div>
          <div className="metric-icon green">
            <CircleCheck size={19} />
          </div>
          <span>
            Visit conversion<strong>{d.conversion}%</strong>
          </span>
        </div>
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h3>Recent transactions</h3>
              <p>The latest activity across your workspace</p>
            </div>
            <button className="text-link" onClick={() => navigate("purchases")}>
              View all <ArrowUpRight size={14} />
            </button>
          </div>
          {d.recentTransactions.length ? (
            <Table headings={["Bill / customer", "Vendor", "Amount", "Status"]}>
              {d.recentTransactions.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.billNumber}</strong>
                    <small>
                      {t.customer.reference} · {date(t.createdAt)}
                    </small>
                  </td>
                  <td>{t.vendor.businessName}</td>
                  <td className="money">{currency(t.amountPaise)}</td>
                  <td>
                    <Status value={t.status} />
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty
              title="No transactions yet"
              description="New purchases and confirmations will appear here."
            />
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h3>{role === "ADMIN" ? "Pending approvals" : "Quick actions"}</h3>
              <p>
                {role === "ADMIN"
                  ? "Businesses ready to join your network"
                  : "Pick up where you left off"}
              </p>
            </div>
          </div>
          {role === "ADMIN" ? (
            d.pendingApprovals.length ? (
              <div className="approval-list">
                {d.pendingApprovals.map((v) => (
                  <button key={v.id} onClick={() => navigate("vendors")}>
                    <span className="avatar small">{v.name[0]}</span>
                    <span>
                      <strong>{v.name}</strong>
                      <small>Awaiting business approval</small>
                    </span>
                    <ArrowUpRight size={16} />
                  </button>
                ))}
              </div>
            ) : (
              <Empty title="All caught up" description="No businesses waiting for approval." />
            )
          ) : (
            <div className="quick-actions">
              <button onClick={() => navigate(role === "CUSTOMER" ? "card" : "verification")}>
                {role === "CUSTOMER" ? "View membership card" : "Verify a customer"}
                <ArrowUpRight size={17} />
              </button>
              <button onClick={() => navigate("visits")}>
                Review customer visits
                <ArrowUpRight size={17} />
              </button>
              <button onClick={() => navigate("purchases")}>
                {role === "CUSTOMER" ? "Confirm a purchase" : "Record a purchase"}
                <ArrowUpRight size={17} />
              </button>
            </div>
          )}
        </section>
      </div>
      {role === "ADMIN" && (
        <div className="dashboard-grid">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h3>Network registrations</h3>
                <p>New customers and vendors by month</p>
              </div>
            </div>
            {d.monthly.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={d.monthly}>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="month" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="customers" fill="#e6a05d" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="vendors" fill="#648bc4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Empty title="No registrations in this period" />
            )}
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h3>Top performing vendors</h3>
                <p>Ranked by verified sales</p>
              </div>
            </div>
            {d.topVendors.length ? (
              <div className="rank-list">
                {d.topVendors.map((v, i) => (
                  <div key={v.name}>
                    <span className="rank">0{i + 1}</span>
                    <span>
                      <strong>{v.name}</strong>
                      <small>{v.purchases} purchases</small>
                    </span>
                    <b>{currency(v.salesPaise)}</b>
                  </div>
                ))}
              </div>
            ) : (
              <Empty title="No verified sales yet" />
            )}
          </section>
        </div>
      )}
      <p className="data-note">
        Sales and purchase totals include verified transactions only. Visit conversion uses linked,
        verified visits and purchases.
      </p>
    </>
  );
}
