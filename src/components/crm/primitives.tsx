import type { ReactNode } from "react";
import { X, Inbox, LoaderCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useFormContext } from "react-hook-form";
export const currency = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
export const date = (value: string) =>
  new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(
    new Date(value),
  );
const labels: Record<string, string> = {
  PENDING: "Pending",
  CONFIRMED: "Customer confirmed",
  VERIFIED: "Verified",
  APPROVED: "Approved",
  PAID: "Paid",
  DISPUTED: "Disputed",
  CANCELLED: "Cancelled",
  REJECTED: "Rejected",
};
export function Status({ value }: { value: string }) {
  return <span className={`status status-${value.toLowerCase()}`}>{labels[value] || value}</span>;
}
export function Empty({
  title = "No records yet",
  description = "Your records will appear here as you use the CRM.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="empty-state">
      <Inbox size={30} />
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="spin" size={24} /> Loading your workspace…
    </div>
  );
}
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="error-state" role="alert">
      <strong>Couldn't load this page</strong>
      <p>{message}</p>
      {retry && (
        <button className="btn secondary" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="crm-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            Review the details and complete the form below.
          </DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function Field({
  label,
  name,
  type = "text",
  required = true,
  value,
  placeholder,
  minLength,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  value?: string | undefined;
  placeholder?: string;
  minLength?: number | undefined;
}) {
  const form = useFormContext();
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        required={required}
        defaultValue={value}
        placeholder={placeholder}
        minLength={minLength}
        {...(form ? form.register(name, { required }) : { name })}
      />
    </label>
  );
}
export function Table({ headings, children }: { headings: string[]; children: ReactNode }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {headings.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
