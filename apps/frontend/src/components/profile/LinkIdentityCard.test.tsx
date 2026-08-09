import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

// The submit handlers await network promises, so the resulting state update
// lands outside fireEvent's own act() scope — wrap the click instead.
const clickAndSettle = async (label: string): Promise<void> => {
  await act(async () => {
    fireEvent.click(screen.getByText(label));
  });
};
import { beforeEach, describe, expect, it, vi } from "vitest";
import LinkIdentityCard from "./LinkIdentityCard";

const addIdentity = vi.fn();
const verifyIdentity = vi.fn();
const refreshUser = vi.fn();
let currentUser: Record<string, unknown> | null = null;

vi.mock("../../lib/api", () => ({
  addIdentity: (...args: unknown[]) => addIdentity(...args),
  verifyIdentity: (...args: unknown[]) => verifyIdentity(...args),
}));

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ user: currentUser, refreshUser }),
}));

vi.mock("react-i18next", () => ({
  // Render the key itself so assertions target the contract, not the copy.
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("LinkIdentityCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    addIdentity.mockResolvedValue({ success: true, channel: "email" });
    verifyIdentity.mockResolvedValue({ user: { id: "cust1" } });
  });

  it("offers email when the account still holds a phone placeholder", () => {
    currentUser = {
      id: "cust1",
      email: "phone-15550001111@phone.local",
      phone: "+15550001111",
    };
    render(<LinkIdentityCard />);

    expect(screen.getByText("profile.linkIdentity.title.email")).toBeTruthy();
  });

  it("offers phone when the account has a real email but no number", () => {
    currentUser = { id: "cust1", email: "real@example.com", phone: null };
    render(<LinkIdentityCard />);

    expect(screen.getByText("profile.linkIdentity.title.phone")).toBeTruthy();
  });

  it("renders nothing once both identifiers are present", () => {
    currentUser = {
      id: "cust1",
      email: "real@example.com",
      phone: "+15550001111",
    };
    const { container } = render(<LinkIdentityCard />);

    expect(container).toBeEmptyDOMElement();
  });

  it("sends a code, then writes the identifier and refreshes the session", async () => {
    currentUser = {
      id: "cust1",
      email: "phone-15550001111@phone.local",
      phone: "+15550001111",
    };
    render(<LinkIdentityCard />);

    fireEvent.change(
      screen.getByLabelText("profile.linkIdentity.title.email"),
      {
        target: { value: "real@example.com" },
      },
    );
    await clickAndSettle("profile.linkIdentity.sendCode");

    await waitFor(() =>
      expect(addIdentity).toHaveBeenCalledWith({ email: "real@example.com" }),
    );
    expect(verifyIdentity).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("profile.linkIdentity.codeLabel"), {
      target: { value: "123456" },
    });
    await clickAndSettle("profile.linkIdentity.confirm");

    await waitFor(() =>
      expect(verifyIdentity).toHaveBeenCalledWith({
        email: "real@example.com",
        code: "123456",
      }),
    );
    await waitFor(() => expect(refreshUser).toHaveBeenCalled());
  });

  it("surfaces IDENTITY_IN_USE as its own message, not a generic failure", async () => {
    currentUser = {
      id: "cust1",
      email: "phone-15550001111@phone.local",
      phone: "+15550001111",
    };
    addIdentity.mockRejectedValue({
      response: { data: { message: "IDENTITY_IN_USE" } },
    });
    render(<LinkIdentityCard />);

    fireEvent.change(
      screen.getByLabelText("profile.linkIdentity.title.email"),
      {
        target: { value: "taken@example.com" },
      },
    );
    await clickAndSettle("profile.linkIdentity.sendCode");

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "profile.linkIdentity.errorInUse",
      ),
    );
  });
});
