import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "../components/ui/button";

export default function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground">
        {t("auto.404PageNotFound", "404 — Page not found")}
      </p>
      <h1 className="text-2xl font-black">
        {t("notFound.heading", "This page doesn't exist")}
      </h1>
      <p className="text-muted-foreground max-w-md">
        {t(
          "notFound.body",
          "The link may be broken, or the page may have moved.",
        )}
      </p>
      <Button asChild className="mt-2">
        <Link to="/">{t("notFound.goHome", "Go to homepage")}</Link>
      </Button>
    </div>
  );
}
