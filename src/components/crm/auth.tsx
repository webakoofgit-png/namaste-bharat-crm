import { useState, useEffect, type FormEvent } from "react";
import { useForm, useFormContext, FormProvider } from "react-hook-form";
import { customerRegistration, vendorRegistration, loginValidation } from "@/lib/validation";
import { ArrowRight, ShieldCheck, Store, UserRound, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { api, setCsrf } from "@/lib/api";
import type { User, Role } from "@/lib/crm-types";
import { Field } from "./primitives";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <img
        src="/brand-logo.png"
        alt="Namaste Bharat logo"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
      <div>
        <strong>
          NAMASTE BHARAT <span>24</span>
        </strong>
        {!compact && <small>Customer & business connect</small>}
      </div>
    </div>
  );
}
export function Auth({ onLogin }: { onLogin: (user: User) => void }) {
  const form = useForm({ shouldUnregister: true });
  return (
    <FormProvider {...form}>
      <AuthForm onLogin={onLogin} />
    </FormProvider>
  );
}
function AuthForm({ onLogin }: { onLogin: (user: User) => void }) {
  const form = useFormContext();
  const [role, setRole] = useState<Role>("ADMIN");
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "reset">(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("reset")
      ? "reset"
      : "login",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState("");
  useEffect(() => {
    form.reset();
    setError("");
    setRecoveryMessage("");
  }, [mode, role, form.reset]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (!(await form.trigger())) throw new Error("Complete all required fields.");
      if (mode === "reset" && values["password"] !== values["confirmPassword"])
        throw new Error("Passwords do not match.");
      if (import.meta.env["VITE_FRONTEND_ONLY"] === "true")
        throw new Error(
          "Account services are not connected yet. Please contact support for account access or password recovery.",
        );
      if (mode === "login" || mode === "register") {
        const parsed = (
          mode === "login"
            ? loginValidation
            : role === "VENDOR"
              ? vendorRegistration
              : customerRegistration
        ).safeParse(values);
        if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(". "));
      }
      if (mode === "login") {
        const result = await api<{ user: User; csrf: string }>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ ...values, role }),
        });
        setCsrf(result.csrf);
        onLogin(result.user);
      } else if (mode === "register") {
        await api("/auth/register", { method: "POST", body: JSON.stringify({ ...values, role }) });
        toast.success(
          role === "VENDOR"
            ? "Registration received. An administrator will review your business."
            : "Your membership is ready. Sign in to continue.",
        );
        setMode("login");
      } else if (mode === "forgot") {
        const result = await api<{ message: string }>("/auth/forgot-password", {
          method: "POST",
          body: JSON.stringify({ email: String(values["email"]).trim().toLowerCase() }),
        });
        setRecoveryMessage(result.message);
        toast.success(result.message);
      } else {
        await api("/auth/reset-password", {
          method: "POST",
          body: JSON.stringify({
            password: values["password"],
            token: new URLSearchParams(window.location.search).get("reset"),
          }),
        });
        window.history.replaceState({}, "", "/");
        setMode("login");
        toast.success("Password updated. Sign in to continue.");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <aside className="auth-story">
        <Brand />
        <div className="auth-story-content">
          <div className="eyebrow">GROW TOGETHER. EARN TOGETHER.</div>
          <h1>
            Better connections.
            <br />
            <em>Bigger possibilities.</em>
          </h1>
          <p>One workspace for your customers, business partners and every reward along the way.</p>
          <div className="auth-benefits">
            <span>
              <ShieldCheck size={20} /> Secure, role-based access
            </span>
            <span>
              <Store size={20} /> Built for local businesses
            </span>
            <span>
              <UserRound size={20} /> Every customer, connected
            </span>
          </div>
        </div>
        <small>Namaste Bharat 24 · Customer, vendor & cashback management</small>
      </aside>
      <main className="auth-main">
        <div className="auth-box">
          <div className="eyebrow">WELCOME TO YOUR WORKSPACE</div>
          <h2>
            {mode === "register"
              ? "Join the community"
              : mode === "forgot"
                ? "Recover your account"
                : mode === "reset"
                  ? "Set a new password"
                  : "Sign in to Namaste Bharat"}
          </h2>
          <p>
            {mode === "login"
              ? "Choose your portal and enter your account details."
              : mode === "register"
                ? "Create your account. Vendor access starts after approval."
                : "Password recovery is handled securely with your administrator."}
          </p>
          {["login", "register"].includes(mode) && (
            <div className="portal-tabs">
              {(["ADMIN", "VENDOR", "CUSTOMER"] as Role[])
                .filter((r) => mode !== "register" || r !== "ADMIN")
                .map((r) => (
                  <button
                    type="button"
                    key={r}
                    className={role === r ? "selected" : ""}
                    onClick={() => {
                      setRole(r);
                      setError("");
                    }}
                  >
                    {r === "ADMIN" ? "Super Admin" : r === "VENDOR" ? "Vendor" : "Customer"}
                  </button>
                ))}
            </div>
          )}
          <form onSubmit={submit} key={`${mode}-${role}`}>
            {mode === "register" && (
              <>
                <Field label="Full name" name="name" />
                <Field label="Mobile number" name="mobile" type="tel" />
                {role === "VENDOR" && (
                  <>
                    <Field label="Business name" name="businessName" />
                    <Field label="Business category" name="category" />
                    <Field label="WhatsApp number" name="whatsapp" type="tel" required={false} />
                  </>
                )}
                <div className="form-grid">
                  <Field label="City" name="city" />
                  <Field label="PIN code" name="pinCode" />
                </div>
                <Field label="Address" name="address" />
              </>
            )}
            {mode !== "reset" && (
              <Field
                label="Email address"
                name="email"
                type="email"
                placeholder="you@example.com"
              />
            )}
            {mode !== "forgot" && (
              <Field
                label={mode === "reset" ? "New password" : "Password"}
                name="password"
                type="password"
                minLength={mode === "login" ? undefined : 10}
                placeholder={mode === "login" ? "Enter your password" : "At least 10 characters"}
              />
            )}
            {mode === "reset" && (
              <Field
                label="Confirm new password"
                name="confirmPassword"
                type="password"
                minLength={10}
              />
            )}
            {recoveryMessage && <p role="status">{recoveryMessage}</p>}
            {error && (
              <div role="alert" className="form-error">
                {error}
              </div>
            )}
            {mode === "login" && (
              <button
                type="button"
                className="text-link forgot"
                onClick={() => {
                  setMode("forgot");
                  setError("");
                }}
              >
                Forgot password?
              </button>
            )}
            <button className="btn primary full" disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "register"
                  ? "Create account"
                  : mode === "forgot"
                    ? "Request recovery"
                    : mode === "reset"
                      ? "Update password"
                      : "Sign in"}
              <ArrowRight size={17} />
            </button>
          </form>
          {mode === "login" && role !== "ADMIN" ? (
            <p className="auth-switch">
              New here?{" "}
              <button
                className="text-link"
                onClick={() => {
                  setMode("register");
                  setError("");
                }}
              >
                Create an account
              </button>
            </p>
          ) : mode !== "login" ? (
            <button
              className="text-link auth-switch"
              onClick={() => {
                setMode("login");
                setError("");
              }}
            >
              <ChevronLeft size={15} /> Back to sign in
            </button>
          ) : null}
          <div className="secure-note">
            <ShieldCheck size={15} /> Your information is protected with secure sessions.
          </div>
        </div>
      </main>
    </div>
  );
}
