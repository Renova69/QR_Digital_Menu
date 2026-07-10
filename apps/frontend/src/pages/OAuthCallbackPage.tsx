import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";

const OAuthCallbackPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { loginWithToken } = useAuth();

  useEffect(() => {
    const returnTo = searchParams.get("returnTo");

    // Token is set via httpOnly cookie by the server — no localStorage needed.
    // Verify the cookie took effect, hydrate AuthContext, then redirect.
    api
      .get("/auth/me")
      .then((res) => {
        const user = res.data;
        loginWithToken(user);
        if (returnTo) {
          navigate(decodeURIComponent(returnTo), { replace: true });
        } else if (user?.role === "OWNER" && !user?.onboardingComplete) {
          navigate("/onboarding", { replace: true });
        } else {
          navigate("/dashboard", { replace: true });
        }
      })
      .catch(() => {
        navigate("/login", { replace: true });
      });
  }, [searchParams, navigate, loginWithToken]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-muted-foreground">
        {t("auto.completingSignIn", "Completing sign-in...")}
      </p>
    </div>
  );
};

export default OAuthCallbackPage;
