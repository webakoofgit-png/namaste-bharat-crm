import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Pencil, Eye, ChevronLeft, ChevronRight, Upload } from "lucide-react";
import { toast } from "sonner";
import { api, apiUrl } from "@/lib/api";
import type { User, Purchase, Visit, Role } from "@/lib/crm-types";
import {
  Empty,
  Loading,
  ErrorState,
  Table,
  Status,
  Field,
  Modal,
  date,
  currency,
} from "./primitives";
import { MembershipCard } from "./membership";

export function Accounts({ kind }: { kind: "CUSTOMER" | "VENDOR" }) {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [category, setCategory] = useState("");
  const [active, setActive] = useState("");
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<User | "new" | null>(null);
  const [view, setView] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const params = new URLSearchParams({
    role: kind,
    search,
    page: String(page),
    ...(city ? { city } : {}),
    ...(category ? { category } : {}),
    ...(active ? { active } : {}),
  });
  const query = useQuery({
    queryKey: ["accounts", kind, search, page, city, category, active],
    queryFn: () =>
      api<{ items: User[]; total: number; pageSize: number }>(`/admin/users?${params}`),
  });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api(edit === "new" ? "/admin/users" : `/admin/users/${(edit as User).id}`, {
        method: edit === "new" ? "POST" : "PATCH",
        body: JSON.stringify({ ...values, ...(edit === "new" ? { role: kind } : {}) }),
      });
      await client.invalidateQueries();
      setEdit(null);
      toast.success("Account saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function update(user: User, data: object) {
    setBusy(true);
    try {
      await api(`/admin/users/${user.id}`, { method: "PATCH", body: JSON.stringify(data) });
      await client.invalidateQueries();
      toast.success("Account updated.");
      setView(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const title = kind === "CUSTOMER" ? "customer" : "vendor";
  return (
    <>
      <section className="panel">
        <div className="toolbar">
          <div className="search-input">
            <Search size={17} />
            <input
              aria-label={`Search ${title}s`}
              placeholder={`Search ${title}s, email or reference…`}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="toolbar-actions">
            <input
              className="filter-input"
              aria-label="Filter by city"
              placeholder="City"
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                setPage(1);
              }}
            />
            {kind === "VENDOR" && (
              <input
                className="filter-input"
                aria-label="Filter by category"
                placeholder="Category"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setPage(1);
                }}
              />
            )}
            <select
              aria-label="Filter by account status"
              value={active}
              onChange={(e) => {
                setActive(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All accounts</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
            <button
              className="btn primary"
              onClick={() => {
                setEdit("new");
                setError("");
              }}
            >
              <Plus size={16} /> Add {title}
            </button>
          </div>
        </div>
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <ErrorState message={query.error.message} retry={() => void query.refetch()} />
        ) : query.data.items.length ? (
          <Table
            headings={[
              kind === "VENDOR" ? "Business / owner" : "Customer",
              "Contact",
              kind === "VENDOR" ? "Category / city" : "Membership",
              "Status",
              "Registered",
              "Actions",
            ]}
          >
            {query.data.items.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="person-cell">
                    <span className="avatar small">{u.name[0]}</span>
                    <span>
                      <strong>{u.vendor?.businessName || u.name}</strong>
                      <small>{u.vendor ? u.name : u.city || "—"}</small>
                    </span>
                  </div>
                </td>
                <td>
                  {u.email}
                  <small>{u.mobile}</small>
                </td>
                <td>
                  {u.vendor?.category || u.customer?.reference}
                  <small>{u.vendor ? u.city : "Digital membership"}</small>
                </td>
                <td>
                  <Status value={u.active ? u.vendor?.approval || "Active" : "Inactive"} />
                </td>
                <td>{date(u.createdAt)}</td>
                <td>
                  <div className="row-actions">
                    <button
                      className="icon-button"
                      aria-label={`View ${u.name}`}
                      onClick={() => setView(u)}
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Edit ${u.name}`}
                      onClick={() => {
                        setEdit(u);
                        setError("");
                      }}
                    >
                      <Pencil size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty
            title={`No ${title}s found`}
            description={`Add your first ${title}, or try another search.`}
          />
        )}
        {query.data && (
          <div className="pagination">
            <span>
              {query.data.total} {title}s · Page {page} of{" "}
              {Math.max(1, Math.ceil(query.data.total / 20))}
            </span>
            <div>
              <button
                className="icon-button"
                aria-label="Previous page"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                className="icon-button"
                aria-label="Next page"
                disabled={page * 20 >= query.data.total}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </section>
      {edit && (
        <Modal title={`${edit === "new" ? "Add" : "Edit"} ${title}`} close={() => setEdit(null)}>
          <form onSubmit={submit}>
            <div className="form-grid">
              <Field
                label="Full name / owner"
                name="name"
                value={edit === "new" ? "" : edit.name}
              />
              <Field
                label="Mobile"
                name="mobile"
                type="tel"
                value={edit === "new" ? "" : edit.mobile}
              />
            </div>
            <Field
              label="Email address"
              name="email"
              type="email"
              value={edit === "new" ? "" : edit.email}
            />
            {edit === "new" && (
              <Field
                label="Initial password (10+ characters)"
                name="password"
                type="password"
                minLength={10}
              />
            )}
            {kind === "VENDOR" && (
              <>
                <Field
                  label="Business name"
                  name="businessName"
                  value={edit === "new" ? "" : edit.vendor?.businessName}
                />
                <div className="form-grid">
                  <Field
                    label="Category"
                    name="category"
                    value={edit === "new" ? "" : edit.vendor?.category}
                  />
                  <Field
                    label="WhatsApp number"
                    name="whatsapp"
                    type="tel"
                    required={false}
                    value={edit === "new" ? "" : edit.vendor?.whatsapp}
                  />
                </div>
              </>
            )}
            <Field
              label="Address"
              name="address"
              required={false}
              value={edit === "new" ? "" : edit.address}
            />
            <div className="form-grid">
              <Field
                label="City"
                name="city"
                required={false}
                value={edit === "new" ? "" : edit.city}
              />
              <Field
                label="PIN code"
                name="pinCode"
                required={false}
                value={edit === "new" ? "" : edit.pinCode}
              />
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="form-footer">
              <button type="button" className="btn secondary" onClick={() => setEdit(null)}>
                Cancel
              </button>
              <button className="btn primary" disabled={busy}>
                {busy ? "Saving…" : "Save account"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {view && (
        <Modal title={view.vendor?.businessName || view.name} close={() => setView(null)}>
          <div className="profile-details">
            <p>
              <b>Name:</b> {view.name}
            </p>
            <p>
              <b>Contact:</b> {view.email} · {view.mobile}
            </p>
            <p>
              <b>Address:</b> {view.address}, {view.city} {view.pinCode}
            </p>
            <p>
              <b>Status:</b> {view.active ? "Active" : "Inactive"} {view.vendor?.approval}
            </p>
          </div>
          {view.customer && (
            <MembershipCard customer={view.customer} name={view.name} active={view.active} />
          )}
          <div className="form-footer">
            {view.vendor && (
              <>
                <button
                  className="btn primary"
                  disabled={busy || view.vendor.approval === "APPROVED"}
                  onClick={() => void update(view, { approval: "APPROVED" })}
                >
                  Approve vendor
                </button>
                <button
                  className="btn danger"
                  disabled={busy || view.vendor.approval === "REJECTED"}
                  onClick={() => {
                    if (window.confirm("Reject this vendor? Business login will be blocked."))
                      void update(view, { approval: "REJECTED" });
                  }}
                >
                  Reject
                </button>
              </>
            )}
            <button
              className="btn secondary"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    `${view.active ? "Deactivate" : "Activate"} this account? Existing sessions will be invalidated.`,
                  )
                )
                  void update(view, { active: !view.active });
              }}
            >
              {view.active ? "Deactivate" : "Activate"}
            </button>
            {import.meta.env["VITE_WEBSITE_AUTH_ENABLED"] !== "true" && (
              <button
                className="btn secondary"
                onClick={async () => {
                  try {
                    const result = await api<{ url: string }>(
                      "/admin/users/" + view.id + "/reset-link",
                      { method: "POST", body: "{}" },
                    );
                    await navigator.clipboard.writeText(result.url);
                    toast.success(
                      "Reset link copied. Share only after verifying identity. Expires in 30 minutes.",
                    );
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                Issue reset link
              </button>
            )}
          </div>
          {import.meta.env["VITE_WEBSITE_AUTH_ENABLED"] === "true" && (
            <WebsiteAccountLink user={view} />
          )}
          {view.vendor && <VendorMedia vendorId={view.vendor.id} media={view.vendor.media || []} />}
          <AccountHistory user={view} />
        </Modal>
      )}
    </>
  );
}
function WebsiteAccountLink({ user }: { user: User }) {
  const [subject, setSubject] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["website-identity", user.id],
    queryFn: () => api<{ subject: string } | null>(`/admin/users/${user.id}/website-identity`),
  });
  if (query.isPending) return <Loading />;
  if (query.error)
    return <ErrorState message={query.error.message} retry={() => void query.refetch()} />;
  if (query.data)
    return (
      <p>
        Linked website user ID: <strong>{query.data.subject}</strong>
      </p>
    );
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        try {
          await api(`/admin/users/${user.id}/website-identity`, {
            method: "POST",
            body: JSON.stringify({ subject: subject.trim() }),
          });
          await client.invalidateQueries({ queryKey: ["website-identity", user.id] });
          toast.success("Website account linked.");
        } catch (error) {
          toast.error((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>Connect website account</h3>
      <label className="field">
        Website user ID
        <input
          required
          maxLength={190}
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
        />{" "}
        I verified that this website account belongs to this person.
      </label>
      <button className="btn secondary" disabled={busy || !confirmed || !subject.trim()}>
        Link website account
      </button>
    </form>
  );
}
function AccountHistory({ user }: { user: User }) {
  const filter = user.customer ? `customerId=${user.customer.id}` : `vendorId=${user.vendor!.id}`;
  const purchases = useQuery({
    queryKey: ["history", user.id],
    queryFn: () => api<Purchase[]>(`/transactions?${filter}`),
  });
  const visits = useQuery({
    queryKey: ["history-visits", user.id],
    queryFn: () => api<Visit[]>(`/visits?${filter}`),
  });
  return (
    <div className="history-section">
      <h3>Visit history</h3>
      {visits.isPending ? (
        <Loading />
      ) : visits.error ? (
        <ErrorState message={visits.error.message} />
      ) : visits.data.length ? (
        <Table headings={["Date", "Customer / vendor", "Status"]}>
          {visits.data.map((v) => (
            <tr key={v.id}>
              <td>{date(v.createdAt)}</td>
              <td>{user.customer ? v.vendor.businessName : v.customer.reference}</td>
              <td>
                <Status value={v.status} />
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty title="No visits" />
      )}
      <h3>Purchases & cashback</h3>
      {purchases.isPending ? (
        <Loading />
      ) : purchases.error ? (
        <ErrorState message={purchases.error.message} />
      ) : purchases.data.length ? (
        <Table headings={["Bill", "Amount", "Status", "Cashback"]}>
          {purchases.data.map((p) => (
            <tr key={p.id}>
              <td>{p.billNumber}</td>
              <td>{currency(p.amountPaise)}</td>
              <td>
                <Status value={p.status} />
              </td>
              <td>
                {p.cashback ? (
                  <>
                    {currency(p.cashback.amountPaise)} <Status value={p.cashback.status} />
                  </>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty title="No purchases" />
      )}
    </div>
  );
}
export function VendorMedia({
  vendorId,
  media,
}: {
  vendorId: number;
  media: { id: number; kind: string; originalName: string }[];
}) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  return (
    <section className="history-section">
      <h3>Business logo & images</h3>
      <div className="media-list">
        {media.map((m) => (
          <a key={m.id} href={apiUrl(`/documents/${m.id}`)} target="_blank" rel="noreferrer">
            {m.kind}: {m.originalName}
          </a>
        ))}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const form = e.currentTarget;
          try {
            await api(`/uploads/vendor/${vendorId}`, { method: "POST", body: new FormData(form) });
            await client.invalidateQueries();
            form.reset();
            toast.success("Business image uploaded.");
          } catch (err) {
            toast.error((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          <span>Image type</span>
          <select name="kind">
            <option value="LOGO">Business logo</option>
            <option value="IMAGE">Business image</option>
          </select>
        </label>
        <label className="field">
          <span>JPEG or PNG · Max 5 MB</span>
          <input type="file" name="file" accept="image/png,image/jpeg" required />
        </label>
        <button className="btn secondary" disabled={busy}>
          <Upload size={15} />
          {busy ? "Uploading…" : "Upload image"}
        </button>
      </form>
    </section>
  );
}
export function Profile({ user }: { user: User }) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const query = useQuery({ queryKey: ["profile"], queryFn: () => api<User>("/profile") });
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorState message={query.error.message} />;
  return (
    <section className="panel profile-panel">
      <div className="panel-heading">
        <div>
          <h3>Your account details</h3>
          <p>Keep your contact information up to date</p>
        </div>
        <span className="avatar">{user.name[0]}</span>
      </div>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          const values = Object.fromEntries(new FormData(event.currentTarget));
          try {
            await api("/profile", { method: "PATCH", body: JSON.stringify(values) });
            await client.invalidateQueries();
            toast.success("Profile updated.");
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <Field label="Full name" name="name" value={query.data.name} />
          <Field label="Mobile number" name="mobile" value={query.data.mobile} />
        </div>
        <Field label="Email" name="email" type="email" value={query.data.email} />
        <Field label="Address" name="address" required={false} value={query.data.address} />
        <div className="form-grid">
          <Field label="City" name="city" required={false} value={query.data.city} />
          <Field label="PIN code" name="pinCode" required={false} value={query.data.pinCode} />
        </div>
        {error && <p className="form-error">{error}</p>}
        <button className="btn primary" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </button>
      </form>
      {query.data.vendor && (
        <VendorMedia vendorId={query.data.vendor.id} media={query.data.vendor.media || []} />
      )}
    </section>
  );
}
