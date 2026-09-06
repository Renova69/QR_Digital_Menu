import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DataPrivacyTab from "./DataPrivacyTab";
const api = vi.hoisted(() => ({
  getAuthSessions: vi.fn(),
  deleteUserAccount: vi.fn(),
  logout: vi.fn(),
}));
vi.mock("../../lib/api", () => ({
  getPublicLegalSettings: async () => ({
    gdprEnabled: true,
    erasureEndpointEnabled: true,
  }),
  getAuthSessions: api.getAuthSessions,
  deleteUserAccount: api.deleteUserAccount,
  exportUserData: vi.fn(),
}));
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ logout: api.logout }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
const session = () => ({
  id: "s1",
  current: true,
  authMethod: "PASSWORD",
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
});
const renderTab = () =>
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: {
              queries: { retry: false },
              mutations: { retry: false },
            },
          })
        }
      >
        <DataPrivacyTab />
      </QueryClientProvider>
    </MemoryRouter>,
  );
async function confirmDeletion() {
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "gdpr.deleteAccount" }),
  );
  await user.click(
    screen.getByRole("button", { name: "gdpr.deleteAccountConfirm" }),
  );
}
describe("account deletion reauthentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.deleteUserAccount.mockResolvedValue(undefined);
    api.getAuthSessions.mockResolvedValue({ sessions: [session()] });
  });
  it.each(["old", "PIN", "legacy"])(
    "shows sign-in guidance for a %s session without consuming a deletion attempt",
    async (kind) => {
      api.getAuthSessions.mockResolvedValue({
        sessions:
          kind === "legacy"
            ? []
            : [
                {
                  ...session(),
                  ...(kind === "PIN"
                    ? { authMethod: "PIN" }
                    : {
                        createdAt: new Date(Date.now() - 3600000).toISOString(),
                      }),
                },
              ],
      });
      renderTab();
      await confirmDeletion();
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "apiErrors.stepUpRequired",
      );
      expect(
        screen.getByRole("button", { name: "profile.loginButton" }),
      ).toBeInTheDocument();
      expect(api.deleteUserAccount).not.toHaveBeenCalled();
      expect(api.logout).not.toHaveBeenCalled();
    },
  );
  it("submits a confirmed deletion with a fresh strong-auth session", async () => {
    renderTab();
    await confirmDeletion();
    await waitFor(() => expect(api.deleteUserAccount).toHaveBeenCalledOnce());
    expect(api.logout).toHaveBeenCalledOnce();
  });
  it("keeps a server rejection visible after the confirmation dialog closes", async () => {
    api.deleteUserAccount.mockRejectedValue({
      response: { data: { code: "STEP_UP_REQUIRED" } },
    });
    renderTab();
    await confirmDeletion();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "apiErrors.stepUpRequired",
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(api.logout).not.toHaveBeenCalled();
  });
});
