import { useState, useEffect, useRef, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ScanLine, Search, Camera, CircleCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { api, apiUrl } from "@/lib/api";
import type { Customer, Purchase, Visit, Role } from "@/lib/crm-types";
import {
  Loading,
  ErrorState,
  Empty,
  Field,
  Modal,
  Table,
  Status,
  currency,
  date,
} from "./primitives";

export function Verification() {
  const [reference, setReference] = useState("");
  const [qr, setQr] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [camera, setCamera] = useState(false);
  async function identify(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError("");
    setCustomer(null);
    try {
      const data = qr.trim() ? { token: qr.trim().replace("nb24:card:", "") } : { reference };
      setCustomer(
        await api<Customer>("/customers/verify", { method: "POST", body: JSON.stringify(data) }),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel verification-panel">
      <div className="verification-icon">
        <ScanLine size={36} />
      </div>
      <h3>Connect with a customer</h3>
      <p>Verify their membership by reference number or QR code.</p>
      <form onSubmit={identify}>
        <label className="field">
          <span>Customer reference number</span>
          <input
            value={reference}
            onChange={(e) => {
              setReference(e.target.value.toUpperCase());
              setQr("");
              setCustomer(null);
            }}
            placeholder="NB24-100001"
          />
        </label>
        <div className="or-line">or use a membership QR</div>
        <label className="field">
          <span>Scanned QR value</span>
          <input
            value={qr}
            onChange={(e) => {
              setQr(e.target.value);
              setCustomer(null);
            }}
            placeholder="nb24:card:…"
          />
        </label>
        <div className="form-footer">
          <button type="button" className="btn secondary" onClick={() => setCamera(true)}>
            <Camera size={16} /> Scan QR
          </button>
          <button className="btn primary" disabled={busy || (!reference && !qr)}>
            <Search size={16} />
            {busy ? "Checking…" : "Verify membership"}
          </button>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </form>
      {customer && (
        <div className="verified-customer">
          <CircleCheck size={25} />
          <div>
            <strong>{customer.user?.name}</strong>
            <span>{customer.reference} · Active membership</span>
          </div>
        </div>
      )}
      <p className="data-note">
        Membership lookup does not verify physical presence. Record a visit and ask the customer to
        confirm in their account.
      </p>
      {camera && (
        <CameraScanner
          close={() => setCamera(false)}
          found={(value) => {
            setQr(value);
            setCustomer(null);
            setCamera(false);
          }}
        />
      )}
    </section>
  );
}
function CameraScanner({ close, found }: { close: () => void; found: (value: string) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function start() {
      try {
        type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
        const Constructor = (
          window as unknown as { BarcodeDetector?: new (config: { formats: string[] }) => Detector }
        ).BarcodeDetector;
        if (!Constructor)
          throw new Error(
            "This browser does not support camera QR scanning. Scan with your phone and paste the QR value.",
          );
        const detector = new Constructor({ formats: ["qr_code"] });
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (ref.current) {
          ref.current.srcObject = stream;
          await ref.current.play();
        }
        const scan = async () => {
          if (!active || !ref.current) return;
          try {
            const results = await detector.detect(ref.current);
            const value = results.find((r) => r.rawValue.startsWith("nb24:card:"));
            if (value) {
              found(value.rawValue);
              return;
            }
          } catch {
            /* Try another frame while camera is warming up. */
          }
          if (active) timer = setTimeout(() => void scan(), 300);
        };
        void scan();
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    }
    void start();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [found]);
  return (
    <Modal title="Scan customer membership" close={close}>
      {error ? (
        <p className="form-error">{error}</p>
      ) : (
        <>
          <video ref={ref} className="scanner-video" muted playsInline />
          <p>Point your camera at the membership QR code.</p>
        </>
      )}
    </Modal>
  );
}
export function Visits({ role, range }: { role: Role; range: string }) {
  const client = useQueryClient();
  const [add, setAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["visits", range],
    queryFn: () => api<Visit[]>(`/visits${range}`),
  });
  async function action(v: Visit, value: "confirm" | "dispute") {
    if (
      !window.confirm(
        `${value === "confirm" ? "Confirm you visited" : "Dispute this visit to"} ${v.vendor.businessName}?`,
      )
    )
      return;
    setBusy(true);
    try {
      await api(`/visits/${v.id}/${value}`, { method: "POST", body: "{}" });
      await client.invalidateQueries();
      toast.success("Visit updated.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const items =
    query.data?.filter(
      (v) =>
        (!status || v.status === status) &&
        `${v.customer.reference} ${v.customer.user?.name} ${v.vendor.businessName}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    ) || [];
  return (
    <>
      <section className="panel">
        <div className="toolbar">
          <div className="search-input">
            <Search size={17} />
            <input
              aria-label="Search visits"
              placeholder="Search reference, customer or vendor…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="toolbar-actions">
            <select
              aria-label="Visit status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              <option>PENDING</option>
              <option>VERIFIED</option>
              <option>DISPUTED</option>
            </select>
            {role === "VENDOR" && (
              <button
                className="btn primary"
                onClick={() => {
                  setAdd(true);
                  setError("");
                }}
              >
                <Plus size={16} /> Record visit
              </button>
            )}
          </div>
        </div>
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <ErrorState message={query.error.message} retry={() => void query.refetch()} />
        ) : items.length ? (
          <Table headings={["Visit", "Customer", "Vendor", "Verification", "Purchase", "Actions"]}>
            {items.slice((page - 1) * 20, page * 20).map((v) => (
              <tr key={v.id}>
                <td>
                  <strong>#{v.id}</strong>
                  <small>{date(v.createdAt)}</small>
                </td>
                <td>
                  {v.customer.user?.name}
                  <small>{v.customer.reference}</small>
                </td>
                <td>{v.vendor.businessName}</td>
                <td>
                  <Status value={v.status} />
                  <small>
                    {v.status === "PENDING" && new Date(v.expiresAt) < new Date()
                      ? "Confirmation expired"
                      : v.method}
                  </small>
                </td>
                <td>
                  {v.transaction && v.transaction.status !== "CANCELLED"
                    ? "Purchase completed"
                    : "No purchase"}
                </td>
                <td>
                  {role === "CUSTOMER" && v.status === "PENDING" && (
                    <div className="row-actions">
                      <button
                        className="btn small primary"
                        disabled={busy || new Date(v.expiresAt) < new Date()}
                        onClick={() => void action(v, "confirm")}
                      >
                        Confirm
                      </button>
                      <button
                        className="btn small danger"
                        disabled={busy}
                        onClick={() => void action(v, "dispute")}
                      >
                        Dispute
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty
            title="No visits found"
            description="Visits appear after an approved vendor records them."
          />
        )}
        <LocalPagination page={page} total={items.length} setPage={setPage} />
      </section>
      {add && (
        <Modal title="Record a customer visit" close={() => setAdd(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const values = Object.fromEntries(new FormData(e.currentTarget));
              const body = values["token"]
                ? { token: String(values["token"]).replace("nb24:card:", "").trim() }
                : { reference: values["reference"] };
              try {
                await api("/visits", { method: "POST", body: JSON.stringify(body) });
                await client.invalidateQueries();
                setAdd(false);
                toast.success("Visit requested. Customer must confirm within 15 minutes.");
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field
              label="Customer reference"
              name="reference"
              placeholder="NB24-100001"
              required={false}
            />
            <Field
              label="Or membership QR value"
              name="token"
              placeholder="nb24:card:…"
              required={false}
            />
            <p className="data-note">
              This creates a pending visit. The customer must confirm presence in their own
              dashboard.
            </p>
            {error && <p className="form-error">{error}</p>}
            <button className="btn primary" disabled={busy}>
              {busy ? "Recording…" : "Request visit confirmation"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function LocalPagination({
  page,
  total,
  setPage,
}: {
  page: number;
  total: number;
  setPage: (value: number) => void;
}) {
  return (
    <div className="pagination">
      <span>
        {total} records · Page {page} of {Math.max(1, Math.ceil(total / 20))}
      </span>
      <div>
        <button
          className="btn small secondary"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </button>
        <button
          className="btn small secondary"
          disabled={page * 20 >= total}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
export function Purchases({
  role,
  range,
  initialStatus = "",
}: {
  role: Role;
  range: string;
  initialStatus?: string;
}) {
  const client = useQueryClient();
  const [add, setAdd] = useState(false);
  const [view, setView] = useState<Purchase | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [page, setPage] = useState(1);
  const [actionModal, setActionModal] = useState<{ purchase: Purchase; action: string } | null>(
    null,
  );
  const query = useQuery({
    queryKey: ["purchases", range],
    queryFn: () => api<Purchase[]>(`/transactions${range}`),
  });
  const visits = useQuery({
    queryKey: ["visits", range],
    queryFn: () => api<Visit[]>(`/visits${range}`),
    enabled: role === "VENDOR",
  });
  async function action(p: Purchase, value: string, reason = "") {
    setBusy(true);
    setError("");
    try {
      await api(`/transactions/${p.id}/${value}`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      await client.invalidateQueries();
      setActionModal(null);
      setView(null);
      toast.success("Transaction updated.");
    } catch (e) {
      setError((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const items =
    query.data?.filter(
      (t) =>
        (!status || t.status === status) &&
        `${t.billNumber} ${t.customer.reference} ${t.vendor.businessName} ${t.customer.user?.name}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    ) || [];
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return (
    <>
      <section className="panel">
        <div className="toolbar">
          <div className="search-input">
            <Search size={17} />
            <input
              aria-label="Search purchases"
              placeholder="Search bill, reference or business…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="toolbar-actions">
            <select
              aria-label="Purchase status"
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
            {role === "VENDOR" && (
              <button
                className="btn primary"
                onClick={() => {
                  setAdd(true);
                  setError("");
                }}
              >
                <Plus size={16} /> Add purchase
              </button>
            )}
          </div>
        </div>
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <ErrorState message={query.error.message} retry={() => void query.refetch()} />
        ) : items.length ? (
          <Table
            headings={[
              "Bill / date",
              "Customer",
              "Vendor",
              "Amount",
              "Cashback rate",
              "Status",
              "Actions",
            ]}
          >
            {items.slice((page - 1) * 20, page * 20).map((t) => (
              <tr key={t.id}>
                <td>
                  <strong>{t.billNumber}</strong>
                  <small>{date(t.billDate)}</small>
                </td>
                <td>
                  {t.customer.user?.name}
                  <small>{t.customer.reference}</small>
                </td>
                <td>{t.vendor.businessName}</td>
                <td className="money">{currency(t.amountPaise)}</td>
                <td>{t.rateBps / 100}%</td>
                <td>
                  <Status value={t.status} />
                </td>
                <td>
                  <div className="row-actions">
                    <button className="btn small secondary" onClick={() => setView(t)}>
                      View
                    </button>
                    {role === "CUSTOMER" && t.status === "PENDING" && (
                      <button
                        className="btn small primary"
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Confirm bill ${t.billNumber} for ${currency(t.amountPaise)} at ${t.vendor.businessName}?`,
                            )
                          )
                            void action(t, "confirm");
                        }}
                      >
                        Confirm
                      </button>
                    )}
                    {role === "CUSTOMER" && ["PENDING", "CONFIRMED"].includes(t.status) && (
                      <button
                        className="btn small danger"
                        onClick={() => {
                          setError("");
                          setActionModal({ purchase: t, action: "dispute" });
                        }}
                      >
                        Dispute
                      </button>
                    )}
                    {role === "ADMIN" && t.status === "CONFIRMED" && (
                      <button
                        className="btn small primary"
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Verify bill ${t.billNumber} and generate cashback at ${t.rateBps / 100}%?`,
                            )
                          )
                            void action(t, "verify");
                        }}
                      >
                        Verify
                      </button>
                    )}
                    {role === "ADMIN" && t.status !== "CANCELLED" && (
                      <button
                        className="btn small danger"
                        onClick={() => {
                          setError("");
                          setActionModal({ purchase: t, action: "cancel" });
                        }}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty
            title="No purchases found"
            description="Record a purchase to start the customer confirmation workflow."
          />
        )}
        <LocalPagination page={page} total={items.length} setPage={setPage} />
      </section>
      {add && (
        <Modal title="Record a purchase" close={() => setAdd(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const values = Object.fromEntries(new FormData(e.currentTarget));
              const file = values["file"] as File;
              delete values["file"];
              if (!values["visitId"]) delete values["visitId"];
              const body = {
                ...values,
                ...(values["visitId"] ? { visitId: Number(values["visitId"]) } : {}),
              };
              let created: { id: number } | undefined;
              try {
                created = await api<{ id: number }>("/transactions", {
                  method: "POST",
                  body: JSON.stringify(body),
                });
                if (file?.size) {
                  const data = new FormData();
                  data.append("file", file);
                  await api(`/uploads/bill/${created.id}`, { method: "POST", body: data });
                }
                await client.invalidateQueries();
                setAdd(false);
                toast.success("Purchase recorded. Customer confirmation requested.");
              } catch (err) {
                if (created) {
                  await client.invalidateQueries();
                  setAdd(false);
                  toast.error(
                    `Purchase #${created.id} was saved, but its upload failed: ${(err as Error).message}. Open the purchase to retry the bill upload.`,
                  );
                } else setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Customer reference number" name="reference" placeholder="NB24-100001" />
            <div className="form-grid">
              <Field label="Purchase amount (₹)" name="amount" placeholder="5000.00" />
              <Field label="Bill number" name="billNumber" />
            </div>
            <Field label="Bill date" name="billDate" type="date" value={today} />
            <label className="field">
              <span>Link a verified visit (optional)</span>
              <select name="visitId">
                <option value="">No linked visit</option>
                {visits.data
                  ?.filter((v) => v.status === "VERIFIED" && !v.transaction)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.customer.reference} · {date(v.createdAt)} · #{v.id}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              <span>Bill upload (PDF, JPEG or PNG · max 5 MB)</span>
              <input type="file" name="file" accept="application/pdf,image/png,image/jpeg" />
            </label>
            <label className="field">
              <span>Notes</span>
              <textarea name="notes" maxLength={1000} />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <p className="data-note">
              The current cashback rate will be saved with this purchase. Cashback is generated only
              after customer confirmation and administrator verification.
            </p>
            <div className="form-footer">
              <button type="button" className="btn secondary" onClick={() => setAdd(false)}>
                Cancel
              </button>
              <button className="btn primary" disabled={busy}>
                {busy ? "Saving…" : "Record purchase"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {view && (
        <Modal title={`Purchase · ${view.billNumber}`} close={() => setView(null)}>
          <div className="purchase-details">
            <div>
              <span>Vendor</span>
              <strong>{view.vendor.businessName}</strong>
            </div>
            <div>
              <span>Customer</span>
              <strong>
                {view.customer.user?.name} · {view.customer.reference}
              </strong>
            </div>
            <div>
              <span>Purchase amount</span>
              <strong>{currency(view.amountPaise)}</strong>
            </div>
            <div>
              <span>Saved cashback rate</span>
              <strong>{view.rateBps / 100}%</strong>
            </div>
            <div>
              <span>Status</span>
              <Status value={view.status} />
            </div>
            <div>
              <span>Bill date</span>
              <strong>{date(view.billDate)}</strong>
            </div>
          </div>
          <p>{view.notes}</p>
          {view.disputeReason && <p className="form-error">Reason: {view.disputeReason}</p>}
          <h3>Bill documents</h3>
          {view.documents.length ? (
            <div className="media-list">
              {view.documents.map((d) => (
                <a key={d.id} href={apiUrl(`/documents/${d.id}`)} target="_blank" rel="noreferrer">
                  {d.originalName}
                </a>
              ))}
            </div>
          ) : (
            <p className="muted">No bill uploaded.</p>
          )}
          {role === "VENDOR" && view.status === "PENDING" && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await api(`/uploads/bill/${view.id}`, {
                    method: "POST",
                    body: new FormData(e.currentTarget),
                  });
                  await client.invalidateQueries();
                  setView(null);
                  toast.success("Bill uploaded.");
                } catch (err) {
                  toast.error((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="field">
                <span>Add bill document</span>
                <input
                  type="file"
                  name="file"
                  required
                  accept="application/pdf,image/png,image/jpeg"
                />
              </label>
              <button className="btn secondary" disabled={busy}>
                <Upload size={16} /> Upload bill
              </button>
            </form>
          )}
        </Modal>
      )}
      {actionModal && (
        <Modal
          title={`${actionModal.action === "dispute" ? "Dispute" : "Cancel"} purchase ${actionModal.purchase.billNumber}`}
          close={() => setActionModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const values = new FormData(e.currentTarget);
              void action(actionModal.purchase, actionModal.action, String(values.get("reason")));
            }}
          >
            <label className="field">
              <span>Reason (required)</span>
              <textarea name="reason" required minLength={5} maxLength={1000} />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="btn danger" disabled={busy}>
              {busy ? "Updating…" : "Submit"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
