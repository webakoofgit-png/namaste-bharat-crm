import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Gift, ShieldCheck, Bell, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { api, apiUrl } from "@/lib/api";
import type { Cashback as CashbackData, Notification, Purchase, Role } from "@/lib/crm-types";
import {
  Table,
  Empty,
  Loading,
  ErrorState,
  Status,
  currency,
  date,
  Modal,
  Field,
} from "./primitives";
import { LocalPagination } from "./activity";
import { ReportSummary } from "./report-summary";

export function Cashback({ role, range }: { role: Role; range: string }) {
  const client = useQueryClient();
  const [pay, setPay] = useState<CashbackData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["cashback", range],
    queryFn: () => api<CashbackData[]>(`/cashback${range}`),
  });
  const items = query.data?.filter((c) => !status || c.status === status) || [];
  const sum = (value: string) =>
    query.data?.filter((c) => c.status === value).reduce((total, c) => total + c.amountPaise, 0) ||
    0;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return (
    <>
      <div className="kpi-grid finance-kpis">
        {["PENDING", "APPROVED", "PAID", "CANCELLED"].map((s, i) => (
          <div className="kpi-card" key={s}>
            <div className="kpi-top">
              <span>{s[0] + s.slice(1).toLowerCase()} cashback</span>
              <div className={`metric-icon ${["orange", "blue", "green", "purple"][i]}`}>
                <Gift size={19} />
              </div>
            </div>
            <strong>{currency(sum(s))}</strong>
            <small>Matching purchases in this period</small>
          </div>
        ))}
      </div>
      <section className="panel">
        <div className="toolbar">
          <div>
            <h3>Reward history</h3>
            <p>Payments are made manually outside the CRM</p>
          </div>
          <select
            aria-label="Cashback status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {["PENDING", "APPROVED", "PAID", "CANCELLED"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <ErrorState message={query.error.message} retry={() => void query.refetch()} />
        ) : items.length ? (
          <Table
            headings={[
              "Bill / customer",
              "Vendor",
              "Purchase",
              "Cashback",
              "Status",
              "Payment",
              "Actions",
            ]}
          >
            {items.slice((page - 1) * 20, page * 20).map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{c.transaction?.billNumber}</strong>
                  <small>{c.transaction?.customer.reference}</small>
                </td>
                <td>{c.transaction?.vendor.businessName}</td>
                <td>{currency(c.transaction?.amountPaise || 0)}</td>
                <td className="money">
                  {currency(c.amountPaise)}
                  <small>{(c.transaction?.rateBps || 0) / 100}% saved rate</small>
                </td>
                <td>
                  <Status value={c.status} />
                </td>
                <td>
                  {c.payment ? (
                    <>
                      {c.payment.reference}
                      <small>
                        {c.payment.method} · {date(c.payment.paymentDate)}
                      </small>
                      <small>{c.payment.remarks}</small>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  {role === "ADMIN" && (
                    <div className="row-actions">
                      {c.status === "PENDING" && (
                        <button
                          className="btn primary small"
                          disabled={busy}
                          onClick={async () => {
                            if (!window.confirm(`Approve ${currency(c.amountPaise)} cashback?`))
                              return;
                            setBusy(true);
                            try {
                              await api(`/cashback/${c.id}/approve`, {
                                method: "POST",
                                body: "{}",
                              });
                              await client.invalidateQueries();
                              toast.success("Cashback approved.");
                            } catch (e) {
                              toast.error((e as Error).message);
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          Approve
                        </button>
                      )}
                      {c.status === "APPROVED" && (
                        <button
                          className="btn secondary small"
                          onClick={() => {
                            setPay(c);
                            setError("");
                          }}
                        >
                          Record payment
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty
            title="No cashback records yet"
            description="Rewards are generated after a purchase is confirmed and verified."
          />
        )}
        <LocalPagination page={page} total={items.length} setPage={setPage} />
      </section>
      {pay && (
        <Modal title="Record a manual cashback payment" close={() => setPay(null)}>
          <div className="payment-summary">
            <Gift size={22} />
            <strong>{currency(pay.amountPaise)}</strong>
            <span>
              Bill {pay.transaction?.billNumber} · {pay.transaction?.customer.reference}
            </span>
          </div>
          <p>Confirm the payment has already been made outside the CRM.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const values = Object.fromEntries(new FormData(e.currentTarget));
              try {
                await api(`/cashback/${pay.id}/pay`, {
                  method: "POST",
                  body: JSON.stringify(values),
                });
                await client.invalidateQueries();
                setPay(null);
                toast.success("Manual payment recorded.");
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Payment date" name="paymentDate" type="date" value={today} />
            <label className="field">
              <span>Payment method</span>
              <select name="method">
                <option value="UPI">UPI (paid externally)</option>
                <option value="BANK">Bank transfer (paid externally)</option>
                <option value="CASH">Cash</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <Field label="Payment reference / receipt number" name="reference" minLength={3} />
            <label className="field">
              <span>Remarks</span>
              <textarea name="remarks" maxLength={1000} />
            </label>
            <label className="checkbox-label">
              <input type="checkbox" required /> I confirm this cashback has been paid manually.
            </label>
            {error && <p className="form-error">{error}</p>}
            <div className="form-footer">
              <button type="button" className="btn secondary" onClick={() => setPay(null)}>
                Cancel
              </button>
              <button className="btn primary" disabled={busy}>
                {busy ? "Saving…" : "Mark as paid"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
interface Setting {
  id: number;
  rateBps: number;
  createdAt: string;
  updatedBy?: { name: string } | null;
}
export function Settings() {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const query = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<Setting[]>("/settings/cashback"),
  });
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorState message={query.error.message} />;
  const current = query.data[0];
  return (
    <>
      <section className="panel settings-panel">
        <div className="panel-heading">
          <div>
            <h3>Cashback percentage</h3>
            <p>Only the Super Admin can change the cashback rate</p>
          </div>
          <Settings2 size={22} />
        </div>
        <div className="rate-display">
          <strong>
            {(current?.rateBps || 0) / 100}
            <span>%</span>
          </strong>
          <small>Current cashback rate</small>
        </div>
        <form
          onSubmit={async (e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.currentTarget));
            if (
              !window.confirm(`Set the cashback rate to ${data["percentage"]}% for new purchases?`)
            )
              return;
            setBusy(true);
            setError("");
            try {
              await api("/settings/cashback", { method: "POST", body: JSON.stringify(data) });
              await client.invalidateQueries();
              toast.success(
                "Cashback rate updated. Historical transactions retain their saved rate.",
              );
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field
            label="New cashback percentage (0–100)"
            name="percentage"
            value={String((current?.rateBps || 0) / 100)}
          />
          <button className="btn primary" disabled={busy}>
            {busy ? "Updating…" : "Update percentage"}
          </button>
          {error && <p className="form-error">{error}</p>}
        </form>
        <div className="info-note">
          <ShieldCheck size={19} />
          <p>
            The rate is saved when a purchase is created. Updating this setting does not change
            historical purchases or cashback amounts.
          </p>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h3>Rate change history</h3>
            <p>An auditable record of every update</p>
          </div>
        </div>
        <Table headings={["Rate", "Updated by", "Updated date"]}>
          {query.data.map((s) => (
            <tr key={s.id}>
              <td>
                <strong>{s.rateBps / 100}%</strong>
              </td>
              <td>{s.updatedBy?.name || "System initialization"}</td>
              <td>{date(s.createdAt)}</td>
            </tr>
          ))}
        </Table>
      </section>
    </>
  );
}
export function Notifications() {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<Notification[]>("/notifications"),
    refetchInterval: 30000,
  });
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h3>Your notifications</h3>
          <p>Stay up to date with purchases, visits and rewards</p>
        </div>
        <button
          className="btn secondary small"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api("/notifications/read", { method: "POST", body: "{}" });
              await client.invalidateQueries({ queryKey: ["notifications"] });
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Mark all as read
        </button>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState message={query.error.message} />
      ) : query.data.length ? (
        <div className="notification-list">
          {query.data.map((n) => (
            <article key={n.id} className={n.read ? "" : "unread"}>
              <div className="metric-icon orange">
                <Bell size={18} />
              </div>
              <div>
                <strong>{n.title}</strong>
                <p>{n.message}</p>
                <small>{date(n.createdAt)}</small>
              </div>
              {!n.read && <span className="unread-dot" aria-label="Unread" />}
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="You're all caught up"
          description="Your purchase and cashback updates will appear here."
        />
      )}
    </section>
  );
}
export function Reports({ range, role }: { range: string; role: Role }) {
  const [status, setStatus] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");
  const [page, setPage] = useState(1);
  const params = new URLSearchParams(range.replace(/^\?/, ""));
  if (status) params.set("status", status);
  if (customerId) params.set("customerId", customerId);
  if (vendorId) params.set("vendorId", vendorId);
  if (category) params.set("category", category);
  if (city) params.set("city", city);
  const filter = `?${params}`;
  const query = useQuery({
    queryKey: ["report", filter],
    queryFn: () => api<Purchase[]>(`/transactions${filter}`),
  });
  const verified = query.data?.filter((t) => t.status === "VERIFIED") || [];
  const sales = verified.reduce((s, t) => s + t.amountPaise, 0);
  const rewards = verified.reduce((s, t) => s + (t.cashback?.amountPaise || 0), 0);
  return (
    <>
      <div className="mini-kpi-grid">
        <div>
          <span>
            Verified transactions<strong>{verified.length}</strong>
          </span>
        </div>
        <div>
          <span>
            Verified sales<strong>{currency(sales)}</strong>
          </span>
        </div>
        <div>
          <span>
            Cashback generated<strong>{currency(rewards)}</strong>
          </span>
        </div>
        <div>
          <span>
            Matching transactions<strong>{query.data?.length || 0}</strong>
          </span>
        </div>
      </div>
      <section className="panel">
        <div className="toolbar">
          <div>
            <h3>Transaction & cashback report</h3>
            <p>Use the date filters above to narrow your report</p>
          </div>
          <a className="btn primary" href={apiUrl(`/reports/export${filter}`)}>
            <Download size={16} /> Export CSV / Excel
          </a>
        </div>
        <div className="report-filters">
          <label className="field">
            <span>Transaction status</span>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {["PENDING", "CONFIRMED", "VERIFIED", "DISPUTED", "CANCELLED"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          {role === "ADMIN" && (
            <>
              <label className="field">
                <span>Customer ID</span>
                <input
                  type="number"
                  min="1"
                  value={customerId}
                  onChange={(e) => {
                    setCustomerId(e.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <label className="field">
                <span>Vendor ID</span>
                <input
                  type="number"
                  min="1"
                  value={vendorId}
                  onChange={(e) => {
                    setVendorId(e.target.value);
                    setPage(1);
                  }}
                />
              </label>
            </>
          )}
          <label className="field">
            <span>Category</span>
            <input
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="field">
            <span>City</span>
            <input
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <ErrorState message={query.error.message} />
        ) : query.data.length ? (
          <Table
            headings={[
              "Bill / date",
              "Customer",
              "Vendor",
              "Purchase",
              "Status",
              "Cashback",
              "Reward status",
            ]}
          >
            {query.data.slice((page - 1) * 20, page * 20).map((t) => (
              <tr key={t.id}>
                <td>
                  {t.billNumber}
                  <small>{date(t.billDate)}</small>
                </td>
                <td>{t.customer.reference}</td>
                <td>{t.vendor.businessName}</td>
                <td>{currency(t.amountPaise)}</td>
                <td>
                  <Status value={t.status} />
                </td>
                <td>{t.cashback ? currency(t.cashback.amountPaise) : "—"}</td>
                <td>{t.cashback ? <Status value={t.cashback.status} /> : "—"}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty title="No transactions match these filters" />
        )}
        <LocalPagination page={page} total={query.data?.length || 0} setPage={setPage} />
      </section>
      <ReportSummary filter={filter} />
      <p className="data-note">
        CSV opens in Excel and includes saved rates, cashback statuses and payment references.
        Screen: up to 500 transactions; export: up to 10,000. Sales totals count verified purchases
        only.
      </p>
    </>
  );
}
export function Audit() {
  const query = useQuery({
    queryKey: ["audit"],
    queryFn: () =>
      api<
        {
          id: number;
          user?: { name: string };
          action: string;
          entity: string;
          entityId: number | null;
          detail: string;
          createdAt: string;
        }[]
      >("/admin/audit"),
  });
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h3>System audit trail</h3>
          <p>The most recent 200 account and financial events</p>
        </div>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState message={query.error.message} />
      ) : query.data.length ? (
        <Table headings={["When", "Actor", "Action", "Entity", "Details"]}>
          {query.data.map((a) => (
            <tr key={a.id}>
              <td>{date(a.createdAt)}</td>
              <td>{a.user?.name || "System"}</td>
              <td>{a.action.replaceAll("_", " ")}</td>
              <td>
                {a.entity} {a.entityId ? `#${a.entityId}` : ""}
              </td>
              <td className="audit-detail">{a.detail || "—"}</td>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty title="No audit events" />
      )}
    </section>
  );
}
