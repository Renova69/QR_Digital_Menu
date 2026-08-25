import { describe, it, expect, afterEach, vi } from "vitest";
import i18next from "i18next";
import {
  getApiError,
  getApiErrorCode,
  getApiErrorDetails,
  getApiErrorKey,
} from "./apiError";
import enTranslation from "../locales/en/translation.json";
import arTranslation from "../locales/ar/translation.json";
import roTranslation from "../locales/ro/translation.json";
import ruTranslation from "../locales/ru/translation.json";

/** Builds an axios-shaped rejection. */
function apiError(
  status: number,
  data: Record<string, unknown> = {},
): { response: { status: number; data: Record<string, unknown> } } {
  return { response: { status, data } };
}

/** Walks a dotted i18n key against a translation bundle. */
function lookup(bundle: unknown, key: string): unknown {
  return key
    .split(".")
    .reduce<any>(
      (node, part) => (node == null ? undefined : node[part]),
      bundle,
    );
}

/** i18next resolves count-bearing keys through _one / _other suffixes. */
function hasCopy(key: string): boolean {
  return (
    typeof lookup(enTranslation, key) === "string" ||
    typeof lookup(enTranslation, `${key}_one`) === "string" ||
    typeof lookup(enTranslation, `${key}_other`) === "string"
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("getApiErrorCode", () => {
  it("prefers the structured code field", () => {
    expect(
      getApiErrorCode(
        apiError(401, { code: "INVALID_CREDENTIALS", message: "anything" }),
      ),
    ).toBe("INVALID_CREDENTIALS");
  });

  it("treats a bare SCREAMING_SNAKE message as the code", () => {
    // session-revocation and a few older guards put the code in `message`.
    expect(
      getApiErrorCode(apiError(401, { message: "ACCOUNT_DISABLED" })),
    ).toBe("ACCOUNT_DISABLED");
  });

  it("does not mistake ordinary prose for a code", () => {
    expect(
      getApiErrorCode(apiError(401, { message: "Invalid PIN. 2 remaining." })),
    ).toBeUndefined();
  });

  it("falls back to a legacy message when no code is present", () => {
    expect(
      getApiErrorCode(
        apiError(409, { message: "User with this email already exists" }),
      ),
    ).toBe("EMAIL_ALREADY_EXISTS");
  });

  it("only applies a legacy rule on its own status", () => {
    expect(
      getApiErrorCode(apiError(500, { message: "Invalid email or password." })),
    ).toBeUndefined();
  });
});

describe("getApiError", () => {
  it("maps a wrong password to the credentials copy, not the session copy", () => {
    // The regression this guards: a 401 with no matching rule fell through to
    // apiErrors.unauthorized ("You are not signed in"), which is wrong for
    // someone actively typing a password.
    const key = getApiError(
      apiError(401, {
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password.",
      }),
    );
    expect(key).toBe("apiErrors.invalidCredentials");
    expect(key).not.toBe("apiErrors.unauthorized");
  });

  it("maps a wrong password from a backend that predates the code", () => {
    expect(
      getApiError(apiError(401, { message: "Invalid email or password." })),
    ).toBe("apiErrors.invalidCredentials");
  });

  it("still honours the older 'Invalid credentials' wording", () => {
    expect(getApiError(apiError(401, { message: "Invalid credentials" }))).toBe(
      "apiErrors.invalidCredentials",
    );
  });

  it("gives a wrong OTP its own copy rather than the generic 401", () => {
    expect(
      getApiError(
        apiError(401, {
          code: "INVALID_OR_EXPIRED_CODE",
          message: "Invalid or expired code.",
        }),
      ),
    ).toBe("apiErrors.invalidOrExpiredCode");
  });

  it("gives a duplicate email its own copy rather than the generic 409", () => {
    expect(
      getApiError(
        apiError(409, {
          code: "EMAIL_ALREADY_EXISTS",
          message: "User with this email already exists",
        }),
      ),
    ).toBe("apiErrors.emailAlreadyExists");
  });

  it("routes a wrong current password to the profile screen copy", () => {
    expect(
      getApiError(
        apiError(401, {
          code: "CURRENT_PASSWORD_INCORRECT",
          message: "Current password is incorrect.",
        }),
      ),
    ).toBe("profileDashboard.currentPasswordIncorrect");
  });

  it("falls back to the status for a code it has no copy for", () => {
    expect(getApiError(apiError(403, { code: "SOME_FUTURE_CODE" }))).toBe(
      "apiErrors.forbidden",
    );
  });

  it("falls back to the status when there is no code at all", () => {
    expect(getApiError(apiError(503, { message: "Service Unavailable" }))).toBe(
      "apiErrors.serviceUnavailable",
    );
  });

  it("falls back to the generic key for a network failure", () => {
    expect(getApiError(new Error("Network Error"))).toBe(
      "apiErrors.unexpected",
    );
  });

  it("keeps count-bearing errors renderable for key-only callers", () => {
    expect(
      getApiError(
        apiError(401, {
          code: "ACCOUNT_TEMPORARILY_LOCKED",
          retryInSeconds: 90,
        }),
      ),
    ).toBe("apiErrors.accountTemporarilyLocked");
  });
});

// The frontend ships on push (Vercel) while the backend ships separately, so
// a new frontend always runs against the old backend for a while. These are
// the rejections DeviceLoginPage decides to clear a stale enrolment from —
// if one stops resolving, a decommissioned tablet polls a dead bond forever.
describe("staff-device codes survive a backend that predates them", () => {
  const cases: Array<[number, string, string]> = [
    [
      401,
      "This device is not enrolled for staff PIN login.",
      "DEVICE_NOT_ENROLLED",
    ],
    [
      401,
      "This device is no longer trusted for PIN login. Ask an owner or manager to re-enroll it.",
      "DEVICE_TRUST_EXPIRED",
    ],
    [410, "Device enrollment link has been revoked", "ENROLLMENT_LINK_REVOKED"],
    [
      410,
      "Device enrollment link has already been used",
      "ENROLLMENT_LINK_USED",
    ],
    [410, "Device enrollment link has expired", "ENROLLMENT_LINK_EXPIRED"],
    [401, "Invalid device enrollment link", "ENROLLMENT_LINK_INVALID"],
  ];

  it.each(cases)("%i %s resolves to %s", (status, message, code) => {
    expect(getApiErrorCode(apiError(status, { message }))).toBe(code);
  });

  it("recognises a revoked session sent as a bare code", () => {
    // session-revocation.service throws UnauthorizedException("DEVICE_REVOKED"),
    // so the code arrives in the message slot on both old and new backends.
    expect(getApiErrorCode(apiError(401, { message: "DEVICE_REVOKED" }))).toBe(
      "DEVICE_REVOKED",
    );
  });
});
describe("getApiErrorDetails counts", () => {
  it("carries the remaining PIN attempts into the key params", () => {
    expect(
      getApiErrorDetails(
        apiError(401, { code: "INVALID_PIN", attemptsRemaining: 3 }),
      ),
    ).toEqual({
      key: "apiErrors.invalidPinWithAttempts",
      params: { count: 3 },
      code: "INVALID_PIN",
    });
  });

  it("uses the count-free PIN key when no attempts field is sent", () => {
    expect(getApiErrorDetails(apiError(401, { code: "INVALID_PIN" }))).toEqual({
      key: "apiErrors.invalidPin",
      params: {},
      code: "INVALID_PIN",
    });
  });

  it("uses the count-free PIN key once no attempts remain", () => {
    // A key with {{count}} and a count of 0 would read "0 attempts remaining"
    // on a screen that is about to switch to the lockout view anyway.
    expect(
      getApiErrorDetails(
        apiError(401, { code: "INVALID_PIN", attemptsRemaining: 0 }),
      ).key,
    ).toBe("apiErrors.invalidPin");
  });

  it("converts a lockout timestamp into whole minutes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T10:00:00.000Z"));

    expect(
      getApiErrorDetails(
        apiError(429, {
          code: "PIN_DEVICE_LOCKED",
          lockedUntil: "2026-08-25T10:07:30.000Z",
        }),
      ),
    ).toEqual({
      key: "apiErrors.pinDeviceLockedWithMinutes",
      params: { count: 8 },
      code: "PIN_DEVICE_LOCKED",
    });
  });

  it("never reports a lockout of zero minutes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T10:00:00.000Z"));

    expect(
      getApiErrorDetails(
        apiError(429, {
          code: "PIN_DEVICE_LOCKED",
          lockedUntil: "2026-08-25T10:00:01.000Z",
        }),
      ).params,
    ).toEqual({ count: 1 });
  });

  it("drops to the count-free lockout key when the timestamp is unusable", () => {
    expect(
      getApiErrorDetails(
        apiError(429, { code: "PIN_DEVICE_LOCKED", lockedUntil: "not a date" }),
      ).key,
    ).toBe("apiErrors.pinDeviceLocked");
  });

  it("converts an account lockout's retryInSeconds into minutes", () => {
    expect(
      getApiErrorDetails(
        apiError(401, {
          code: "ACCOUNT_TEMPORARILY_LOCKED",
          retryInSeconds: 90,
        }),
      ),
    ).toEqual({
      key: "apiErrors.accountTemporarilyLockedWithMinutes",
      params: { count: 2 },
      code: "ACCOUNT_TEMPORARILY_LOCKED",
    });
  });
});

describe("count-bearing translations", () => {
  it.each([
    ["ro", roTranslation, [[2, "PIN invalid. Au mai rămas 2 încercări."]]],
    [
      "ru",
      ruTranslation,
      [
        [2, "Неверный PIN-код. Осталось 2 попытки."],
        [5, "Неверный PIN-код. Осталось 5 попыток."],
      ],
    ],
    [
      "ar",
      arTranslation,
      [
        [2, "رمز PIN غير صحيح. بقيت محاولتان."],
        [3, "رمز PIN غير صحيح. بقيت 3 محاولات."],
        [11, "رمز PIN غير صحيح. بقيت 11 محاولة."],
      ],
    ],
  ] as const)(
    "renders the active %s locale for each relevant plural category",
    async (locale, resource, examples) => {
      const instance = i18next.createInstance();
      await instance.init({
        lng: locale,
        fallbackLng: false,
        resources: { [locale]: { translation: resource } },
      });

      for (const [count, expected] of examples) {
        expect(instance.t("apiErrors.invalidPinWithAttempts", { count })).toBe(
          expected,
        );
      }
    },
  );

  it.each([
    [
      "ro",
      roTranslation,
      2,
      "Prea multe încercări. Încearcă din nou peste 2 minute.",
      "Prea multe încercări eșuate de autentificare. Încearcă din nou peste 2 minute.",
    ],
    [
      "ru",
      ruTranslation,
      5,
      "Слишком много попыток. Повторите через 5 минут.",
      "Слишком много неудачных попыток входа. Повторите через 5 минут.",
    ],
    [
      "ar",
      arTranslation,
      2,
      "محاولات كثيرة جدًا. حاول مرة أخرى بعد دقيقتين.",
      "محاولات تسجيل دخول فاشلة كثيرة. حاول مرة أخرى بعد دقيقتين.",
    ],
  ] as const)(
    "renders both lockout messages in the active %s locale",
    async (locale, resource, count, pinExpected, accountExpected) => {
      const instance = i18next.createInstance();
      await instance.init({
        lng: locale,
        fallbackLng: false,
        resources: { [locale]: { translation: resource } },
      });

      expect(
        instance.t("apiErrors.pinDeviceLockedWithMinutes", { count }),
      ).toBe(pinExpected);
      expect(
        instance.t("apiErrors.accountTemporarilyLockedWithMinutes", { count }),
      ).toBe(accountExpected);
    },
  );
});

describe("translation coverage", () => {
  it("has English copy for every status fallback key", () => {
    const statuses = [
      400,
      401,
      403,
      404,
      409,
      422,
      429,
      500,
      502,
      503,
      504,
      undefined,
    ];
    const missing = statuses
      .map((status) => getApiErrorKey(status))
      .filter((key) => !hasCopy(key));

    expect(missing).toEqual([]);
  });

  it("has English copy for every key a backend code can resolve to", () => {
    // Every code the backend publishes, plus the two count-bearing variants
    // that only getApiErrorDetails can produce.
    const codes = [
      "INVALID_CREDENTIALS",
      "ACCOUNT_DISABLED",
      "ACCOUNT_TEMPORARILY_LOCKED",
      "INVALID_OR_EXPIRED_CODE",
      "CODE_ATTEMPTS_EXCEEDED",
      "EMAIL_ALREADY_EXISTS",
      "GOOGLE_EMAIL_NOT_VERIFIED",
      "SMS_NOT_CONFIGURED",
      "IDENTITY_IN_USE",
      "CURRENT_PASSWORD_INCORRECT",
      "PASSWORD_SAME_AS_CURRENT",
      "INVALID_PIN",
      "PIN_DEVICE_LOCKED",
      "DEVICE_LOCK_STATE_CHANGED",
      "DEVICE_NOT_ENROLLED",
      "DEVICE_TRUST_EXPIRED",
      "DEVICE_REVOKED",
      "SHARED_DEVICE_MODE_DISABLED",
      "RESTAURANT_SUSPENDED",
      "STAFF_DEVICE_LIMIT_REACHED",
      "POS_NOT_IN_PLAN",
      "ENROLLMENT_LINK_INVALID",
      "ENROLLMENT_LINK_REVOKED",
      "ENROLLMENT_LINK_USED",
      "ENROLLMENT_LINK_EXPIRED",
    ];

    const resolved = codes.map(
      (code) => getApiErrorDetails(apiError(400, { code })).key,
    );
    const extras = [
      "apiErrors.invalidPinWithAttempts",
      "apiErrors.pinDeviceLockedWithMinutes",
      "apiErrors.accountTemporarilyLockedWithMinutes",
    ];

    const missing = [...resolved, ...extras].filter((key) => !hasCopy(key));

    // A code with no copy silently degrades to the generic status message,
    // which is the exact failure mode this module exists to prevent.
    expect(missing).toEqual([]);
  });
});
