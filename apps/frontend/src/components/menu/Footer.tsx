import { Globe, MapPin, Phone, Youtube } from "lucide-react";
import React from "react";
import { useTranslation } from "react-i18next";
import { useConsent } from "../../context/ConsentContext";

interface FooterProps {
  restaurantName: string;
  address?: string;
  city?: string;
  contactInfo?: string;
  websiteUrl?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  tiktokUrl?: string;
  youtubeUrl?: string;
}

const socialIconCls =
  "w-5 h-5 transition-transform hover:scale-110 active:scale-95";

function FacebookIcon() {
  return (
    <svg className={socialIconCls} viewBox="0 0 24 24" fill="#1877F2">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg
      className={socialIconCls}
      viewBox="0 0 24 24"
      fill="url(#footerInstagramGradient)"
    >
      <defs>
        <linearGradient
          id="footerInstagramGradient"
          x1="0"
          y1="0"
          x2="1"
          y2="1"
        >
          <stop offset="0%" stopColor="#F58529" />
          <stop offset="40%" stopColor="#DD2A7B" />
          <stop offset="100%" stopColor="#8134AF" />
        </linearGradient>
      </defs>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg
      className={`${socialIconCls} text-foreground`}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  );
}

const PHONE_RE =
  /(\+?[\d]{1,4}[\s]?)?(\(?\d{2,4}\)?[\s]?)?[\d]{2,4}[\s-]?[\d]{2,4}[\s-]?[\d]{2,6}/g;

function formatLocation(address?: string, city?: string): string {
  const street = address?.trim();
  const locality = city?.trim();

  if (!street) return locality ?? "";
  if (!locality) return street;

  const normalizedStreet = street.toLocaleLowerCase();
  const normalizedLocality = locality.toLocaleLowerCase();
  if (
    normalizedStreet === normalizedLocality ||
    normalizedStreet.endsWith(`, ${normalizedLocality}`)
  ) {
    return street;
  }

  return `${street}, ${locality}`;
}

function linkifyPhones(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const regex = new RegExp(PHONE_RE.source, "g");
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const raw = match[0];
    const digits = raw.replace(/\D/g, "");
    parts.push(
      <a
        key={match.index}
        href={`tel:${digits}`}
        className="hover:text-primary transition-colors no-underline"
      >
        {raw}
      </a>,
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length > 0 ? parts : text;
}

export default function Footer({
  restaurantName,
  address,
  city,
  contactInfo,
  websiteUrl,
  facebookUrl,
  instagramUrl,
  tiktokUrl,
  youtubeUrl,
}: FooterProps) {
  const { t } = useTranslation();
  const { categories, openPreferences } = useConsent();
  const hasSocials = !!(
    websiteUrl ||
    facebookUrl ||
    instagramUrl ||
    tiktokUrl ||
    youtubeUrl
  );
  const location = formatLocation(address, city);
  const hasContact = !!(location || contactInfo);

  return (
    <footer className="mt-10 pb-8 px-3">
      <div className="glass-panel border-white/10 rounded-[1.75rem] p-6 space-y-4">
        {/* Restaurant name */}
        <h2 className="text-base font-bold text-foreground/90 text-center">
          {restaurantName}
        </h2>

        {/* Location & Contact */}
        {hasContact && (
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
            {location && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                {location}
              </span>
            )}
            {contactInfo && (
              <span className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                {linkifyPhones(contactInfo)}
              </span>
            )}
          </div>
        )}

        {/* Social Icons */}
        {hasSocials && (
          <div className="flex items-center justify-center gap-4 pt-1">
            {websiteUrl && (
              <a
                href={websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Website"
                className="p-1.5 rounded-xl hover:bg-secondary/60 transition-colors"
              >
                <Globe className={socialIconCls} />
              </a>
            )}
            {facebookUrl && (
              <a
                href={facebookUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook"
                className="p-1.5 rounded-xl hover:bg-secondary/60 transition-colors"
              >
                <FacebookIcon />
              </a>
            )}
            {instagramUrl && (
              <a
                href={instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="p-1.5 rounded-xl hover:bg-secondary/60 transition-colors"
              >
                <InstagramIcon />
              </a>
            )}
            {tiktokUrl && (
              <a
                href={tiktokUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="TikTok"
                className="p-1.5 rounded-xl hover:bg-secondary/60 transition-colors"
              >
                <TikTokIcon />
              </a>
            )}
            {youtubeUrl && (
              <a
                href={youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="YouTube"
                className="p-1.5 rounded-xl hover:bg-secondary/60 transition-colors"
              >
                <Youtube className={`${socialIconCls} text-red-600`} />
              </a>
            )}
          </div>
        )}
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground/70">
        {t("auto.weatherDataBy", "Weather data by")}{" "}
        <a
          href="https://www.weatherapi.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-2 hover:underline"
        >
          WeatherAPI.com
        </a>
        {categories.length > 0 && (
          <>
            {" · "}
            <button
              type="button"
              onClick={openPreferences}
              className="underline-offset-2 hover:underline"
            >
              {t("gdpr.cookieSettingsLink")}
            </button>
          </>
        )}
      </p>
    </footer>
  );
}
