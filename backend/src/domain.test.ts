import { test } from "node:test";
import assert from "node:assert/strict";
import { moneyToPaise, cashbackPaise, assertTransition } from "./domain.js";
test("currency inputs are integer paise without floating point drift", () => {
  assert.equal(moneyToPaise("5000"), 500000);
  assert.equal(moneyToPaise("0.29"), 29);
  assert.equal(moneyToPaise("1000000.00"), 100000000);
  for (const bad of ["0", "-1", "1.001", "1e3", "NaN", "1000000.01", "", " 1", ".01"])
    assert.throws(() => moneyToPaise(bad));
});
test("cashback uses half-up integer rounding and validates bounds", () => {
  assert.equal(cashbackPaise(500000, 1000), 50000);
  assert.equal(cashbackPaise(1, 5000), 1);
  assert.equal(cashbackPaise(29, 1000), 3);
  assert.equal(cashbackPaise(100000000, 10000), 100000000);
  assert.equal(cashbackPaise(500000, 0), 0);
  assert.throws(() => cashbackPaise(10, 10001));
});
test("only customers confirm and only administrators verify/cancel", () => {
  assert.equal(assertTransition("PENDING", "confirm", "CUSTOMER"), "CONFIRMED");
  assert.equal(assertTransition("CONFIRMED", "verify", "ADMIN"), "VERIFIED");
  assert.equal(assertTransition("VERIFIED", "cancel", "ADMIN"), "CANCELLED");
  assert.equal(assertTransition("CONFIRMED", "dispute", "CUSTOMER"), "DISPUTED");
  for (const role of ["VENDOR", "CUSTOMER"])
    assert.throws(() => assertTransition("CONFIRMED", "verify", role));
  assert.throws(() => assertTransition("PENDING", "verify", "ADMIN"));
  assert.throws(() => assertTransition("DISPUTED", "verify", "ADMIN"));
  assert.throws(() => assertTransition("VERIFIED", "confirm", "CUSTOMER"));
  assert.throws(() => assertTransition("CANCELLED", "cancel", "ADMIN"));
});
