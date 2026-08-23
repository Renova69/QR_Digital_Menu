import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ErrorBoundary from "./ErrorBoundary";

vi.mock("@sentry/react", () => ({ captureException: vi.fn() }));
vi.mock("../lib/clientLogger", () => ({ logClientError: vi.fn() }));
vi.mock("react-i18next", () => ({
  // The component is wrapped in withTranslation(); the real provider is not
  // what these tests are about.
  withTranslation: () => (C: any) => (props: any) => (
    <C {...props} t={(_k: string, fallback: string) => fallback} />
  ),
}));

const SECRET = "PrismaClientKnownRequestError: column app_user.pinHash";

function Boom(): JSX.Element {
  throw new Error(SECRET);
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    // React logs caught errors to console.error; that is expected here and
    // would otherwise bury the actual assertions in noise.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("renders the fallback instead of crashing the panel", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  // A React error message routinely carries API response bodies, database
  // errors, ids and internal paths. This panel renders on a customer's screen,
  // where the message helps nobody who can act on it.
  it("does not show the raw error message in production", () => {
    vi.stubEnv("DEV", false);

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("shows the raw error message in development", () => {
    vi.stubEnv("DEV", true);

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByText(SECRET)).toBeInTheDocument();
  });

  // Hiding it from the UI must not mean losing it: the boundary is the only
  // place a render-time crash is observable at all.
  it("still reports the error even when the message is hidden", async () => {
    vi.stubEnv("DEV", false);
    const { logClientError } = await import("../lib/clientLogger");
    const Sentry = await import("@sentry/react");

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(logClientError).toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});
