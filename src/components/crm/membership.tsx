import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { Download, Printer, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import type { User, Customer } from "@/lib/crm-types";
import { Loading, ErrorState } from "./primitives";
export function MembershipCard({
  customer,
  name,
  active,
}: {
  customer: Customer;
  name: string;
  active: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Opaque identity only: no name, email, phone or user ID is in the QR payload.
  const payload = `nb24:card:${customer.cardToken || ""}`;
  async function download() {
    const bytes = new Uint8Array(await (await fetch("/brand-logo.png")).arrayBuffer());
    const logo = `data:image/jpeg;base64,${btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""))}`;
    const qr = ref.current?.querySelector("svg")?.outerHTML || "";
    const escape = (v: string) =>
      v.replace(
        /[<>&"']/g,
        (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!,
      );
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="860" height="500"><rect width="860" height="500" rx="32" fill="#183d35"/><image href="${logo}" x="60" y="40" width="56" height="56"/><text x="135" y="80" font-family="sans-serif" font-size="30" fill="#fff">NAMASTE BHARAT 24</text><text x="60" y="145" font-family="sans-serif" font-size="18" fill="#abc5bc">MEMBERSHIP CARD</text><text x="60" y="295" font-family="sans-serif" font-size="32" fill="#fff">${escape(name)}</text><text x="60" y="345" font-family="monospace" font-size="26" fill="#edb277">${escape(customer.reference)}</text><text x="60" y="430" font-family="sans-serif" font-size="18" fill="#abc5bc">${active ? "Active member" : "Inactive member"}</text><g transform="translate(620 205)">${qr}</g></svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${customer.reference}-membership.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="membership-wrap">
      <div className="membership-card" ref={ref}>
        <div className="card-brand">
          <img src="/brand-logo.png" alt="Namaste Bharat logo" />
          <strong>
            NAMASTE BHARAT <span>24</span>
          </strong>
        </div>
        <span className="card-label">YOUR MEMBERSHIP. YOUR POSSIBILITIES.</span>
        <div className="card-body">
          <div>
            <small>MEMBER NAME</small>
            <h3>{name}</h3>
            <small>MEMBERSHIP NUMBER</small>
            <strong className="card-reference">{customer.reference}</strong>
          </div>
          <div className="qr-box">
            <QRCodeSVG value={payload} size={132} marginSize={2} level="M" />
          </div>
        </div>
        <footer>
          <span>
            <ShieldCheck size={15} />
            {active ? "Active member" : "Inactive membership"}
          </span>
          <small>Namaste Bharat 24</small>
        </footer>
      </div>
      <div className="card-actions">
        <button
          className="btn secondary"
          onClick={() => void download().catch((e) => toast.error((e as Error).message))}
        >
          <Download size={16} /> Download card
        </button>
        <button
          className="btn secondary"
          onClick={() => {
            document.body.classList.add("printing-card");
            window.addEventListener(
              "afterprint",
              () => document.body.classList.remove("printing-card"),
              { once: true },
            );
            window.print();
          }}
        >
          <Printer size={16} /> Print card
        </button>
      </div>
    </div>
  );
}
export function MembershipPage() {
  const query = useQuery({ queryKey: ["profile"], queryFn: () => api<User>("/profile") });
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorState message={query.error.message} />;
  return (
    <section className="panel card-panel">
      <div className="panel-heading">
        <div>
          <h3>Your digital membership</h3>
          <p>One identity for your physical and virtual membership</p>
        </div>
      </div>
      {query.data.customer && (
        <MembershipCard
          customer={query.data.customer}
          name={query.data.name}
          active={query.data.active}
        />
      )}
      <p className="data-note">
        Show your QR or reference to an approved vendor. You will still need to confirm visits and
        purchases in your own account.
      </p>
    </section>
  );
}
