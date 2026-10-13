import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Auth } from "@/components/crm/auth";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({ api: vi.fn(), setCsrf: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

beforeEach(() => {
  vi.stubEnv("VITE_FRONTEND_ONLY", "false");
  vi.mocked(api).mockReset();
  window.history.replaceState({}, "", "/");
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("Account access", () => {
  it("offers registration for vendors and customers, but not administrators", () => {
    render(<Auth onLogin={vi.fn()} />);
    expect(screen.queryByText("Create an account")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Vendor" }));
    fireEvent.click(screen.getByText("Create an account"));
    expect(screen.getByLabelText("Business name")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Super Admin" })).toBeNull();
  });

  it("shows and hides the password without submitting the form", () => {
    render(<Auth onLogin={vi.fn()} />);
    const password = screen.getByLabelText("Password", { exact: true });
    fireEvent.change(password, { target: { value: "Secret-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
    expect(password).toHaveValue("Secret-password");
    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password).toHaveAttribute("type", "password");
    expect(api).not.toHaveBeenCalled();
  });

  it("submits recovery and keeps the response visible", async () => {
    vi.mocked(api).mockResolvedValue({ message: "Contact support to receive a reset link." });
    render(<Auth onLogin={vi.fn()} />);
    fireEvent.click(screen.getByText("Forgot password?"));
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "MEMBER@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Request recovery/ }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: "member@example.com" }),
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Contact support");
  });

  it("explains unavailable recovery on frontend-only deployments", async () => {
    vi.stubEnv("VITE_FRONTEND_ONLY", "true");
    render(<Auth onLogin={vi.fn()} />);
    fireEvent.click(screen.getByText("Forgot password?"));
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "member@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Request recovery/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Account services are not connected yet",
    );
    expect(api).not.toHaveBeenCalled();
  });
});
