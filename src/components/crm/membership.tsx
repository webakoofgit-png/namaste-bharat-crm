import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { Download, Printer, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import type { User, Customer } from "@/lib/crm-types";
import { Loading, ErrorState } from "./primitives";

// prettier-ignore
const cardContact = {
  website: import.meta.env["VITE_CARD_WEBSITE_URL"] || "https://namastebharat24.com",
  support: import.meta.env["VITE_CARD_SUPPORT_PHONE"] || "8459608568",
  facebook: import.meta.env["VITE_CARD_FACEBOOK_URL"] || "https://www.facebook.com/share/1Dfr1GQSYf/",
  instagram: import.meta.env["VITE_CARD_INSTAGRAM_URL"] || "https://www.instagram.com/namasteybharat24?obrf=MXhyOXVwejYyZnJ3Zw==",
};
function safeLink(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function MembershipCard({
  customer,
  name,
  active,
  city,
}: {
  customer: Customer;
  name: string;
  active: boolean;
  city: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Opaque identity only: no name, email, phone or user ID is in the QR payload.
  const payload = `nb24:card:${customer.cardToken || ""}`;
  async function download() {
    const bytes = new Uint8Array(await (await fetch("/brand-logo.png")).arrayBuffer());
    const logo = `data:image/png;base64,${btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""))}`;
    const qr = ref.current?.querySelector("svg")?.outerHTML || "";
    const escape = (v: string) =>
      v.replace(
        /[<>&"']/g,
        (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!,
      );
    const line = (value: string, x: number, y: number, size: number, width = 700) =>
      `<text x="${x}" y="${y}" font-family="sans-serif" font-size="${size}" fill="#fff"${value.length * size * 0.62 > width ? ` textLength="${width}" lengthAdjust="spacingAndGlyphs"` : ""}>${escape(value)}</text>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="860" height="542" viewBox="0 0 860 542"><defs><linearGradient id="red" x2="1" y2="1"><stop stop-color="#cd263e"/><stop offset="1" stop-color="#710f26"/></linearGradient></defs><rect width="860" height="542" rx="32" fill="url(#red)"/><circle cx="830" cy="40" r="170" fill="none" stroke="#ffffff" stroke-opacity=".08" stroke-width="45"/><image href="${logo}" x="40" y="32" width="48" height="48"/>${line("NAMASTE BHARAT 24", 105, 65, 27)}${line("MEMBERSHIP CARD", 40, 108, 14)}<rect x="40" y="134" width="65" height="45" rx="9" fill="#ebcd8e"/><path d="M40 156h65M62 134v45M83 134v45" stroke="#9b793d"/>${line("REFERENCE NUMBER", 40, 217, 13)}${line(customer.reference, 40, 253, 30, 525)}${line("MEMBER NAME", 40, 292, 12)}${line(name, 40, 322, 25, 525)}${line(`CITY: ${city.trim() || "Update city in My profile"}`, 40, 355, 17, 525)}<g transform="translate(665 200)">${qr}</g>${line(active ? "Active member" : "Inactive membership", 40, 395, 14)}<path d="M40 414h780" stroke="#ffffff" stroke-opacity=".25"/>${line(cardContact.website, 40, 443, 15)}${line(`Support: ${cardContact.support || "Contact details pending"}`, 40, 470, 14)}${line(`Facebook: ${cardContact.facebook || "Link pending"}`, 40, 496, 13)}${line(`Instagram: ${cardContact.instagram || "Link pending"}`, 40, 520, 13)}</svg>`;
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
        <div className="card-chip" aria-hidden="true">
          <i />
          <i />
        </div>
        <div className="card-body">
          <div>
            <small>REFERENCE NUMBER</small>
            <strong className="card-reference">{customer.reference}</strong>
            <small>MEMBER NAME</small>
            <h3>{name}</h3>
            <span className="card-city">City: {city.trim() || "Update city in My profile"}</span>
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
          <small>MEMBERSHIP CARD</small>
        </footer>
        <div className="card-contact">
          <a href={safeLink(cardContact.website)} target="_blank" rel="noopener noreferrer">
            {cardContact.website.replace(/^https?:\/\//, "")}
          </a>
          <span>
            Support:{" "}
            {cardContact.support ? (
              <a href={`tel:${cardContact.support.replace(/[^+\d]/g, "")}`}>
                {cardContact.support}
              </a>
            ) : (
              "Contact details pending"
            )}
          </span>
          <div className="card-socials">
            {(
              [
                ["Facebook", cardContact.facebook],
                ["Instagram", cardContact.instagram],
              ] as const
            ).map(([label, url]) =>
              safeLink(url) ? (
                <a key={label} href={safeLink(url)} target="_blank" rel="noopener noreferrer">
                  {label} ↗
                </a>
              ) : (
                <span key={label}>{label}: link pending</span>
              ),
            )}
          </div>
        </div>
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
          city={query.data.city}
        />
      )}
      <p className="data-note">
        Show your QR or reference to an approved vendor. You will still need to confirm visits and
        purchases in your own account.
      </p>
    </section>
  );
}
