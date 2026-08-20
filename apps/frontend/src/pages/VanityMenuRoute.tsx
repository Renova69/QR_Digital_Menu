import { useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { resolveMenuSlug } from "../lib/api";
import { setResolvedRestaurantId } from "../lib/tenantResolution";
import { useCanonicalUrl } from "../hooks/useCanonicalUrl";
import { getMenuPath, getMenuUrl } from "../lib/menuUrl";
import PublicMenuPage from "./PublicMenuPage";

/**
 * Resolves /m/:slug to a restaurantId, then hands off to the unchanged
 * restaurant-ID menu flow. The resolve call is deliberately cheap — the menu
 * itself still loads meta first and then batches category items, and this
 * route must not disturb that.
 */
export default function VanityMenuRoute() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  const { data, error, isLoading } = useQuery({
    queryKey: ["menu-slug", slug.toLowerCase()],
    queryFn: () => resolveMenuSlug(slug),
    retry: false,
  });

  // Publish for consumers outside the route tree (ConsentContext).
  useEffect(() => {
    setResolvedRestaurantId(data?.restaurantId ?? null);
    return () => setResolvedRestaurantId(null);
  }, [data?.restaurantId]);

  // Alias and letter-case correction share one mechanism: if the slug in the
  // URL is not the canonical one, replace it. The menu is already loading, so
  // this costs no extra fetch and no server redirect.
  useEffect(() => {
    if (!data) return;
    if (slug !== data.canonicalSlug) {
      // Route through the same seam every other menu URL uses — do not
      // hand-roll `/m/${slug}` here (see the comment on `canonical` below).
      navigate(
        `${getMenuPath({ id: data.restaurantId, slug: data.canonicalSlug })}${location.search}`,
        { replace: true },
      );
    }
  }, [data, slug, location.search, navigate]);

  // Route the canonical URL through the same seam every other menu URL uses
  // — do not hand-roll `/m/${slug}` here. Kept guarded so a missing `data`
  // still yields null and useCanonicalUrl no-ops, matching prior behavior.
  const canonical = data
    ? getMenuUrl({ id: data.restaurantId, slug: data.canonicalSlug })
    : null;
  useCanonicalUrl(canonical);

  const status = (
    error as { response?: { status?: number } } | null | undefined
  )?.response?.status;
  if (status === 410) {
    return <div role="alert">{t("menu.moved", "This menu has moved.")}</div>;
  }
  if (error) {
    return <div role="alert">{t("menu.notFound", "Menu not found.")}</div>;
  }
  if (isLoading || !data) return null;

  return <PublicMenuPage restaurantIdOverride={data.restaurantId} />;
}
