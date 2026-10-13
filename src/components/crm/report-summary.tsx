import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Download } from "lucide-react";
import { api, apiUrl } from "@/lib/api";
import { Table, Loading, ErrorState, Empty, currency } from "./primitives";
import { LocalPagination } from "./activity";
interface Row {
  id: number;
  name: string;
  reference: string;
  visits: number;
  purchases: number;
  salesPaise: number;
  pendingPaise: number;
  approvedPaise: number;
  paidPaise: number;
}
interface Summary {
  customers: Row[];
  vendors: Row[];
  daily: { day: string; transactions: number; verified: number; salesPaise: number }[];
  accounts: { customers: number; activeCustomers: number; vendors: number } | null;
}
export function ReportSummary({ filter }: { filter: string }) {
  const [kind, setKind] = useState<"customers" | "vendors" | "daily">("customers");
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["summary", filter],
    queryFn: () => api<Summary>(`/reports/summary${filter}`),
  });
  const items = query.data?.[kind] || [];
  return (
    <section className="panel">
      <div className="toolbar">
        <div className="report-tabs">
          {(["customers", "vendors", "daily"] as const).map((k) => (
            <button
              key={k}
              className={`btn small ${kind === k ? "primary" : "secondary"}`}
              onClick={() => {
                setKind(k);
                setPage(1);
              }}
            >
              {k === "customers"
                ? "Customer report"
                : k === "vendors"
                  ? "Vendor performance"
                  : "Daily transactions"}
            </button>
          ))}
        </div>
        <a
          className="btn secondary small"
          href={apiUrl(`/reports/export${filter}${filter.includes("?") ? "&" : "?"}kind=${kind}`)}
        >
          <Download size={14} /> Export this report
        </a>
      </div>
      {query.data?.accounts && (
        <p className="summary-caption">
          Total customers: {query.data.accounts.customers} · Active customers:{" "}
          {query.data.accounts.activeCustomers} · Total vendors: {query.data.accounts.vendors}.
          Activity follows the selected filters.
        </p>
      )}
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState message={query.error.message} />
      ) : !items.length ? (
        <Empty title="No report records" />
      ) : kind === "daily" ? (
        <Table headings={["Day (IST)", "Transactions", "Verified purchases", "Verified sales"]}>
          {query.data.daily.slice((page - 1) * 20, page * 20).map((r) => (
            <tr key={r.day}>
              <td>{r.day}</td>
              <td>{r.transactions}</td>
              <td>{r.verified}</td>
              <td>{currency(r.salesPaise)}</td>
            </tr>
          ))}
        </Table>
      ) : (
        <Table
          headings={[
            "Name / ID",
            "Reference",
            "Visits",
            "Purchases",
            "Verified sales",
            "Pending cashback",
            "Approved cashback",
            "Paid cashback",
          ]}
        >
          {query.data[kind].slice((page - 1) * 20, page * 20).map((r) => (
            <tr key={r.id}>
              <td>
                <strong>{r.name}</strong>
                <small>#{r.id}</small>
              </td>
              <td>{r.reference || "—"}</td>
              <td>{r.visits}</td>
              <td>{r.purchases}</td>
              <td>{currency(r.salesPaise)}</td>
              <td>{currency(r.pendingPaise)}</td>
              <td>{currency(r.approvedPaise)}</td>
              <td>{currency(r.paidPaise)}</td>
            </tr>
          ))}
        </Table>
      )}
      <LocalPagination page={page} total={items.length} setPage={setPage} />
    </section>
  );
}
