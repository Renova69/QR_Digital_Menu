import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DeviceEnrollPage from "./DeviceEnrollPage";
import { verifyDeviceEnrollment } from "../lib/api";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback || _key,
  }),
}));

vi.mock("../lib/api", () => ({
  verifyDeviceEnrollment: vi.fn(),
}));

const mockedVerifyDeviceEnrollment = vi.mocked(verifyDeviceEnrollment);

function renderEnrollPage(path: string, strict = false) {
  const tree = (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/device-enroll" element={<DeviceEnrollPage />} />
        <Route path="/device-login" element={<div>PIN login</div>} />
      </Routes>
    </MemoryRouter>
  );

  return render(strict ? <React.StrictMode>{tree}</React.StrictMode> : tree);
}

describe("DeviceEnrollPage", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      value: localStorageMock,
      configurable: true,
    });
    mockedVerifyDeviceEnrollment.mockReset();
    localStorage.clear();
  });

  it("deduplicates single-use token verification under React StrictMode", async () => {
    mockedVerifyDeviceEnrollment.mockResolvedValue({
      restaurantId: "rest-1",
      restaurantName: "Test Restaurant",
      allowedModes: ["POS", "KDS"],
    });

    renderEnrollPage("/device-enroll?token=strict-token", true);

    expect(await screen.findByText("Device Linked")).toBeTruthy();
    await waitFor(() => {
      expect(mockedVerifyDeviceEnrollment).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(localStorage.getItem("sharedDevice")).toContain("strict-token");
    });
  });

  it("explains when a reused QR is opened on a device that is not bonded", async () => {
    mockedVerifyDeviceEnrollment.mockRejectedValue({
      response: {
        status: 410,
        data: { message: "Device enrollment link has already been used" },
      },
    });

    renderEnrollPage("/device-enroll?token=used-token");

    expect(await screen.findByText("Device Link Failed")).toBeTruthy();
    expect(screen.getByText(/This QR link has already been used/)).toBeTruthy();
  });

  it("shows Shared Device Mode Off when the backend blocks enrollment", async () => {
    mockedVerifyDeviceEnrollment.mockRejectedValue({
      response: {
        status: 403,
        data: {
          code: "SHARED_DEVICE_MODE_DISABLED",
          message:
            "Shared Device Mode is off. Ask a manager to enable it before enrolling this device.",
        },
      },
    });

    renderEnrollPage("/device-enroll?token=mode-off-token");

    expect(await screen.findByText("Shared Device Mode Off")).toBeTruthy();
    expect(screen.getByText(/Ask a manager to enable it/)).toBeTruthy();
  });
});
