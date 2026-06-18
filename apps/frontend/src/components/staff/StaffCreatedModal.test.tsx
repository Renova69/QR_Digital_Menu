import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import StaffCreatedModal from "./StaffCreatedModal";

const mockT = vi.fn((key: string, opts?: any) => {
  if (key === "staff.created.rebondInstruction" && opts?.name) {
    return `Scan this QR on ${opts.name}'s device to re-bond it.`;
  }
  if (key === "staff.created.pinFor" && opts?.name) {
    return `PIN for ${opts.name}`;
  }
  const fallbacks: Record<string, string> = {
    "staff.created.title": "Staff Account Created",
    "staff.created.rebondTitle": "Device Bonding QR",
    "staff.created.scanInstruction": "Scan QR on the staff device, then enter the PIN below.",
    "staff.created.passwordInstruction": "Share this temporary dashboard login with the staff member.",
    "staff.created.expiresIn": "Expires in",
    "staff.created.expired": "Expired",
    "staff.created.copyPinWarning": "Copy this PIN now — it won't be shown again.",
    "staff.created.copyPin": "Copy PIN",
    "staff.created.revealPin": "Reveal PIN",
    "staff.created.copied": "Copied!",
    "staff.created.copyLink": "Copy Enrollment Link",
    "staff.created.linkCopied": "Link Copied!",
    "staff.created.close": "Close",
  };
  return fallbacks[key] ?? key;
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mockT }),
}));

vi.mock("@fortawesome/react-fontawesome", () => ({
  FontAwesomeIcon: ({ icon, ...props }: any) => (
    <svg data-testid="fa-icon" data-icon={icon?.iconName} {...props} />
  ),
}));

vi.mock("qrcode.react", () => ({
  QRCodeSVG: ({ value }: { value: string }) => (
    <svg role="img" data-value={value} />
  ),
}));

const defaultProps = {
  open: true,
  onClose: () => {},
  staffName: "Alice",
  staffEmail: "alice@example.com",
  enrollmentUrl: "https://example.com/enroll/alice",
  expiresAt: new Date(Date.now() + 120_000).toISOString(),
};

describe("StaffCreatedModal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing when open is false", () => {
    const { container } = render(
      <StaffCreatedModal {...defaultProps} open={false} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders the modal when open is true", () => {
    render(<StaffCreatedModal {...defaultProps} />);
    expect(screen.getByText("Device Bonding QR")).toBeTruthy();
  });

  it("displays the PIN when rawPin is provided", () => {
    render(<StaffCreatedModal {...defaultProps} rawPin="654321" />);
    expect(screen.getByText("654321")).toBeTruthy();
  });

  it("masks the PIN after 30 seconds and allows explicit reveal", async () => {
    render(<StaffCreatedModal {...defaultProps} rawPin="654321" />);
    await vi.advanceTimersByTimeAsync(30000);
    expect(screen.queryByText("654321")).toBeNull();
    expect(screen.getByText("****")).toBeTruthy();
    fireEvent.click(screen.getByText("Reveal PIN"));
    expect(screen.getByText("654321")).toBeTruthy();
  });

  it("does not display PIN section when rawPin is absent", () => {
    render(<StaffCreatedModal {...defaultProps} />);
    expect(screen.queryByText(/Copy this PIN now/)).toBeNull();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(<StaffCreatedModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders QR code SVG with role img", () => {
    const { container } = render(
      <StaffCreatedModal {...defaultProps} />
    );
    const qrSvg = container.querySelector('svg[role="img"]');
    expect(qrSvg).toBeTruthy();
  });

  it('shows "Staff Account Created" title when rawPin is provided', () => {
    render(<StaffCreatedModal {...defaultProps} rawPin="123456" />);
    expect(screen.getByText("Staff Account Created")).toBeTruthy();
  });

  it("shows countdown timer text", () => {
    render(<StaffCreatedModal {...defaultProps} />);
    expect(screen.getByText(/Expires in/)).toBeTruthy();
  });

  it("copies PIN to clipboard when Copy PIN is clicked", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<StaffCreatedModal {...defaultProps} rawPin="987654" />);
    fireEvent.click(screen.getByText("Copy PIN"));
    expect(writeText).toHaveBeenCalledWith("987654");
  });

  it("copies enrollment link to clipboard when Copy Enrollment Link is clicked", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<StaffCreatedModal {...defaultProps} />);
    fireEvent.click(screen.getByText("Copy Enrollment Link"));
    expect(writeText).toHaveBeenCalledWith("https://example.com/enroll/alice");
  });

  it("does not show Copied when clipboard write fails for PIN", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });
    render(<StaffCreatedModal {...defaultProps} rawPin="123456" />);
    fireEvent.click(screen.getByText("Copy PIN"));
    await vi.advanceTimersByTimeAsync(100);
    expect(screen.getByText("Copy PIN")).toBeTruthy();
    expect(screen.queryByText("Copied!")).toBeNull();
  });

  it("does not show Link Copied when clipboard write fails for link", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });
    render(<StaffCreatedModal {...defaultProps} />);
    fireEvent.click(screen.getByText("Copy Enrollment Link"));
    await vi.advanceTimersByTimeAsync(100);
    expect(screen.getByText("Copy Enrollment Link")).toBeTruthy();
    expect(screen.queryByText("Link Copied!")).toBeNull();
  });

  it("uses translation keys for all displayed text", () => {
    mockT.mockClear();
    render(<StaffCreatedModal {...defaultProps} rawPin="123456" />);
    expect(mockT).toHaveBeenCalledWith("staff.created.title");
    expect(mockT).toHaveBeenCalledWith("staff.created.scanInstruction");
    expect(mockT).toHaveBeenCalledWith("staff.created.pinFor", { name: "Alice" });
    expect(mockT).toHaveBeenCalledWith("staff.created.copyPinWarning");
  });
});
