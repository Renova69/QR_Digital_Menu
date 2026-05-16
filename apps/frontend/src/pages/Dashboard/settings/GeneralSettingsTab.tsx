import React, { useState } from "react";
import { useTranslation } from "react-i18next";

const AVAILABLE_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "bg", name: "Bulgarian" },
  { code: "de", name: "German" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "it", name: "Italian" },
  { code: "ro", name: "Romanian" },
  { code: "zh", name: "Chinese" },
  { code: "el", name: "Greek" },
  { code: "ja", name: "Japanese" },
  { code: "ru", name: "Russian" },
  { code: "ar", name: "Arabic" },
];

const TIMEZONES = [
  { value: "UTC", label: "UTC" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Lisbon", label: "Lisbon (WET/WEST)" },
  { value: "Europe/Paris", label: "Paris / Berlin / Rome (CET/CEST)" },
  { value: "Europe/Helsinki", label: "Helsinki / Athens (EET/EEST)" },
  { value: "Europe/Sofia", label: "Sofia (EET/EEST)" },
  { value: "Europe/Moscow", label: "Moscow (MSK)" },
  { value: "America/New_York", label: "New York (ET)" },
  { value: "America/Chicago", label: "Chicago (CT)" },
  { value: "America/Denver", label: "Denver (MT)" },
  { value: "America/Los_Angeles", label: "Los Angeles (PT)" },
  { value: "America/Sao_Paulo", label: "São Paulo (BRT)" },
  { value: "Asia/Dubai", label: "Dubai (GST)" },
  { value: "Asia/Kolkata", label: "India (IST)" },
  { value: "Asia/Bangkok", label: "Bangkok (ICT)" },
  { value: "Asia/Singapore", label: "Singapore (SGT)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Australia/Sydney", label: "Sydney (AET)" },
];

const inputCls =
  "w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all";

interface GeneralSettingsTabProps {
  address: string;
  setAddress: (v: string) => void;
  contactInfo: string;
  setContactInfo: (v: string) => void;
  timezone: string;
  setTimezone: (v: string) => void;
  targetLanguages: string[];
  setTargetLanguages: React.Dispatch<React.SetStateAction<string[]>>;
  onForceTranslate: () => Promise<void>;
  translating: boolean;
}

const GeneralSettingsTab: React.FC<GeneralSettingsTabProps> = ({
  address,
  setAddress,
  contactInfo,
  setContactInfo,
  timezone,
  setTimezone,
  targetLanguages,
  setTargetLanguages,
  onForceTranslate,
  translating,
}) => {
  const { t } = useTranslation();

  const handleLanguageToggle = (code: string) => {
    setTargetLanguages((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  };

  return (
    <>
      {/* ── Location & Contact ── */}
      <div className="border-b border-border pb-6">
        <h3 className="text-lg font-medium text-foreground mb-4">
          {t("settings.locationContact")}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              {t("settings.address")}
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main St, NY"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              {t("settings.contactInfo")}
            </label>
            <input
              type="text"
              value={contactInfo}
              onChange={(e) => setContactInfo(e.target.value)}
              placeholder="(555) 555-5555"
              className={inputCls}
            />
          </div>
        </div>
      </div>

      {/* ── Timezone ── */}
      <div className="border-b border-border pb-6">
        <h3 className="text-lg font-medium text-foreground mb-1">{t("settings.timezone")}</h3>
        <p className="text-sm text-muted-foreground mb-4">
          {t("settings.timezoneDesc")}
        </p>
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className={inputCls}
        >
          {TIMEZONES.map((tz) => (
            <option key={tz.value} value={tz.value}>
              {tz.label}
            </option>
          ))}
        </select>
      </div>

      {/* ── Localization ── */}
      <div className="border-b border-border pb-6">
        <h3 className="text-lg font-medium text-foreground mb-4">
          {t("settings.localization")}
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          {t("settings.localizationDesc")}
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-2">
              {t("settings.targetLanguages")}
            </label>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => handleLanguageToggle(lang.code)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                    targetLanguages.includes(lang.code)
                      ? "bg-accent/15 text-accent border-accent/30"
                      : "bg-secondary text-foreground border-border hover:bg-secondary/80"
                  }`}
                >
                  {lang.name}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("settings.translationPoweredBy")}</p>
        </div>
        <div className="mt-6 flex flex-col sm:flex-row gap-4 items-center p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
          <div className="flex-1">
            <h4 className="text-sm font-bold text-yellow-700 dark:text-yellow-400">
              {t("settings.processExisting")}
            </h4>
            <p className="text-xs text-yellow-600 dark:text-yellow-500 mt-1">
              {t("settings.processExistingDesc")}
            </p>
          </div>
          <button
            type="button"
            onClick={onForceTranslate}
            disabled={translating || targetLanguages.length === 0}
            className="whitespace-nowrap px-4 py-2 bg-yellow-600 text-white text-sm font-medium rounded-lg hover:bg-yellow-700 disabled:opacity-50 transition-colors"
          >
            {translating ? t("settings.translating") : t("settings.translateAllNow")}
          </button>
        </div>
      </div>
    </>
  );
};

export default GeneralSettingsTab;
