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
    t: (key: string, options?: unknown) =>
      ({
        "deviceEnrollment.verifying": "Localized verifying message",
        "deviceEnrollment.missingToken": "Localized missing-token message",
        "deviceEnrollment.linkedOpening": "Localized linked-opening message",
        "deviceEnrollment.alreadyLinkedOpening":
          "Localized already-linked message",
        "deviceEnrollment.linkFailedTitle": "Localized link-failed title",
        "deviceEnrollment.sharedDeviceModeOffTitle":
          "Localized shared-device-off title",
        "deviceEnrollment.linkedTitle": "Device Linked",
        "deviceEnrollment.linkingTitle": "Localized linking title",
        "deviceEnrollment.usedOnAnotherDevice":
          "Localized already-used guidance",
        "deviceEnrollment.enableSharedDeviceMode":
          "Localized enable-shared-device guidance",
        "deviceEnrollment.requestFreshQr": "Localized fresh-QR guidance",
        "deviceEnrollment.managerLogin": "Localized manager login",
        "apiErrors.enrollmentLinkExpired": "Localized expired-link message",
        "apiErrors.sharedDeviceModeDisabled":
          "Localized shared-device-disabled message",
      })[key] || (typeof options === "string" ? options : key),
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
        data: {
          code: "ENROLLMENT_LINK_USED",
          message: "Тази връзка вече е използвана",
        },
      },
    });

    renderEnrollPage("/device-enroll?token=used-token");

    expect(await screen.findByText("Localized link-failed title")).toBeTruthy();
    expect(screen.getByText("Localized already-used guidance")).toBeTruthy();
  });

  it("localizes Shared Device Mode errors instead of rendering backend prose", async () => {
    mockedVerifyDeviceEnrollment.mockRejectedValue({
      response: {
        status: 403,
        data: {
          code: "SHARED_DEVICE_MODE_DISABLED",
          message: "El modo de dispositivo compartido está desactivado.",
        },
      },
    });

    renderEnrollPage("/device-enroll?token=mode-off-token");

    expect(
      await screen.findByText("Localized shared-device-disabled message"),
    ).toBeTruthy();
    expect(
      screen.queryByText("El modo de dispositivo compartido está desactivado."),
    ).toBeNull();
  });

  it("localizes a legacy backend enrollment error", async () => {
    mockedVerifyDeviceEnrollment.mockRejectedValue({
      response: {
        status: 410,
        data: { message: "Device enrollment link has expired" },
      },
    });

    renderEnrollPage("/device-enroll?token=expired-token");

    expect(
      await screen.findByText("Localized expired-link message"),
    ).toBeTruthy();
    expect(screen.queryByText("Device enrollment link has expired")).toBeNull();
  });

  it("localizes page-owned copy when the token is missing", async () => {
    renderEnrollPage("/device-enroll");

    expect(await screen.findByText("Localized link-failed title")).toBeTruthy();
    expect(screen.getByText("Localized missing-token message")).toBeTruthy();
    expect(screen.getByText("Localized fresh-QR guidance")).toBeTruthy();
    expect(screen.getByText("Localized manager login")).toBeTruthy();
  });
});
