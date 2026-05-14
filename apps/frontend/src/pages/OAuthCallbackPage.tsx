import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../lib/api";

const OAuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const returnTo = searchParams.get("returnTo");

    // Token is set via httpOnly cookie by the server — no localStorage needed.
    // Verify the cookie took effect, then redirect.
    api.get('/auth/me')
      .then(() => {
        if (returnTo) {
          navigate(decodeURIComponent(returnTo), { replace: true });
        } else {
          navigate("/dashboard", { replace: true });
        }
      })
      .catch(() => {
        navigate("/login", { replace: true });
      });
  }, [searchParams, navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-muted-foreground">Completing sign-in...</p>
    </div>
  );
};

export default OAuthCallbackPage;
