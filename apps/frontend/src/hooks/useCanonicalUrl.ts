import { useEffect } from "react";

/**
 * Maintains the single <link rel="canonical"> in <head>.
 *
 * This is a client-side tag on a static-hosted SPA, so it is weaker than a
 * server-rendered one — see the spec's Known Limitations. It is what makes
 * alias and legacy-id URLs point search engines at the canonical slug URL
 * without paying a redirect on every scan.
 */
export function useCanonicalUrl(url: string | null): void {
  useEffect(() => {
    if (!url) return;

    const existing = document.head.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    const link = existing ?? document.createElement("link");
    const createdHere = !existing;

    if (createdHere) {
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = url;

    return () => {
      if (createdHere) link.remove();
    };
  }, [url]);
}
