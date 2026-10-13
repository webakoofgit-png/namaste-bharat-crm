export type Role = "ADMIN" | "VENDOR" | "CUSTOMER";
export interface User {
  id: number;
  name: string;
  email: string;
  mobile: string;
  role: Role;
  active: boolean;
  address: string;
  city: string;
  pinCode: string;
  createdAt: string;
  customer?: Customer | null;
  vendor?: Vendor | null;
}
export interface Customer {
  id: number;
  reference: string;
  cardToken?: string;
  user?: { name: string; active: boolean };
}
export interface Vendor {
  id: number;
  businessName: string;
  category: string;
  approval?: string;
  whatsapp?: string;
  media?: { id: number; kind: string; originalName: string }[];
}
export interface Purchase {
  id: number;
  customer: Customer;
  vendor: Vendor;
  amountPaise: number;
  rateBps: number;
  billNumber: string;
  billDate: string;
  notes: string;
  disputeReason: string;
  status: string;
  createdAt: string;
  cashback?: Cashback | null;
  documents: { id: number; originalName: string }[];
}
export interface Cashback {
  id: number;
  amountPaise: number;
  status: string;
  createdAt: string;
  transaction?: Purchase;
  payment?: { reference: string; method: string; paymentDate: string; remarks: string } | null;
}
export interface Visit {
  id: number;
  customer: Customer;
  vendor: Vendor;
  method: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  transaction?: { id: number; status: string } | null;
}
export interface Notification {
  id: number;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}
export interface Dashboard {
  customers: number;
  vendors: number;
  activeVendors: number;
  inactiveVendors: number;
  visits: number;
  pendingVisits: number;
  purchases: number;
  salesPaise: number;
  pendingTransactions: number;
  verifiedTransactions: number;
  generatedPaise: number;
  pendingPaise: number;
  approvedPaise: number;
  paidPaise: number;
  monthly: { month: string; sales: number; customers: number; vendors: number }[];
  topVendors: { name: string; salesPaise: number; purchases: number }[];
  conversion: number;
  recentTransactions: Purchase[];
  pendingApprovals: { id: number; name: string }[];
}
