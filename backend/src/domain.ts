export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function moneyToPaise(value: string): number {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(value))
    throw new AppError(400, "Enter an amount with at most two decimal places.");
  const [whole, decimals = ""] = value.split(".");
  const amount = Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
  if (amount <= 0 || amount > 100_000_000)
    throw new AppError(400, "Purchase amount must be between ₹0.01 and ₹10,00,000.");
  return amount;
}
export function cashbackPaise(amount: number, rateBps: number): number {
  if (
    !Number.isSafeInteger(amount) ||
    !Number.isInteger(rateBps) ||
    amount <= 0 ||
    rateBps < 0 ||
    rateBps > 10000
  )
    throw new AppError(400, "Invalid cashback calculation.");
  return Number((BigInt(amount) * BigInt(rateBps) + 5000n) / 10000n);
}
export function assertTransition(current: string, action: string, role: string): string {
  const transitions: Record<string, [string[], string, string]> = {
    confirm: [["PENDING"], "CUSTOMER", "CONFIRMED"],
    dispute: [["PENDING", "CONFIRMED"], "CUSTOMER", "DISPUTED"],
    verify: [["CONFIRMED"], "ADMIN", "VERIFIED"],
    cancel: [["PENDING", "CONFIRMED", "DISPUTED", "VERIFIED"], "ADMIN", "CANCELLED"],
  };
  const rule = transitions[action];
  if (!rule || rule[1] !== role)
    throw new AppError(403, "This action is not permitted for your role.");
  if (!rule[0].includes(current))
    throw new AppError(409, "The transaction status has changed or this action is not allowed.");
  return rule[2];
}
