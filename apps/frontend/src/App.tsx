import { Suspense } from "react";
import { lazyWithReload as lazy } from "./lib/lazyWithReload";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Outlet,
} from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import { AuthProvider } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import { OrderProvider } from "./context/OrderContext";
import { AssistanceProvider } from "./context/AssistanceContext";
import { SocketProvider } from "./context/SocketContext";
import PublicMenuPage from "./pages/PublicMenuPage";
import VanityMenuRoute from "./pages/VanityMenuRoute";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ProtectedRoute from "./components/ProtectedRoute";
import { RestaurantProvider } from "./context/RestaurantContext";
import { MenuProvider } from "./context/MenuContext";
import Header from "./components/Header";
import HomePage from "./pages/HomePage";
import ErrorBoundary from "./components/ErrorBoundary";
import PosLayout from "./pages/pos/PosLayout";
import StaffRoute from "./components/StaffRoute";
import SuperAdminRoute from "./components/SuperAdminRoute";
import { PosProvider } from "./context/PosContext";
import { NotificationProvider } from "./context/NotificationContext";
import CookieConsentBanner from "./components/legal/CookieConsentBanner";
import { ConsentProvider } from "./context/ConsentContext";
import AnnouncementBanner from "./components/AnnouncementBanner";
import { TooltipProvider } from "./components/ui/tooltip";
import RouteGroupErrorBoundary from "./components/RouteGroupErrorBoundary";

// Lazy-loaded pages — not on the critical render path
const OnboardingPage = lazy(() => import("./pages/onboarding/OnboardingPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const MenuEditorPage = lazy(() => import("./pages/MenuEditorPage"));
const PricingPage = lazy(() => import("./pages/PricingPage"));
const AboutPage = lazy(() => import("./pages/AboutPage"));
const PosPage = lazy(() => import("./pages/pos/PosPage"));
const KitchenPage = lazy(() => import("./pages/staff/KitchenPage"));
const CustomerProfilePage = lazy(() => import("./pages/CustomerProfilePage"));
const OAuthCallbackPage = lazy(() => import("./pages/OAuthCallbackPage"));
const CheckoutPage = lazy(() => import("./pages/CheckoutPage"));
const OrderConfirmationPage = lazy(
  () => import("./pages/OrderConfirmationPage"),
);
const FeedbackPage = lazy(() => import("./pages/FeedbackPage"));
const PaymentConfirmationPage = lazy(
  () => import("./pages/PaymentConfirmationPage"),
);
const DeviceLoginPage = lazy(() => import("./pages/DeviceLoginPage"));
const DeviceEnrollPage = lazy(() => import("./pages/DeviceEnrollPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));
const BookingPage = lazy(() => import("./pages/BookingPage"));
const BookingConfirmationPage = lazy(
  () => import("./pages/BookingConfirmationPage"),
);
const BookingManagePage = lazy(() => import("./pages/BookingManagePage"));

const SuperAdminLayout = lazy(
  () => import("./pages/super-admin/SuperAdminLayout"),
);
const OverviewPage = lazy(() => import("./pages/super-admin/OverviewPage"));
const TenantsPage = lazy(() => import("./pages/super-admin/TenantsPage"));
const TenantDetailPage = lazy(
  () => import("./pages/super-admin/TenantDetailPage"),
);
const LegalSettingsPage = lazy(
  () => import("./pages/super-admin/LegalSettingsPage"),
);
const HelpCenterPage = lazy(() => import("./pages/super-admin/HelpCenterPage"));
const RevenuePage = lazy(() => import("./pages/super-admin/RevenuePage"));
const DataRequestsPage = lazy(
  () => import("./pages/super-admin/DataRequestsPage"),
);
const ImpersonationExchangePage = lazy(
  () => import("./pages/ImpersonationExchangePage"),
);

const PrivacyPolicyPage = lazy(() => import("./pages/legal/PrivacyPolicyPage"));
const TermsPage = lazy(() => import("./pages/legal/TermsPage"));
const CookiePolicyPage = lazy(() => import("./pages/legal/CookiePolicyPage"));
const DpaPage = lazy(() => import("./pages/legal/DpaPage"));
const RefundPolicyPage = lazy(() => import("./pages/legal/RefundPolicyPage"));
const MsaPage = lazy(() => import("./pages/legal/MsaPage"));

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
);

// App routes: header + container padding
export const AppLayout = () => (
  <SocketProvider>
    <RestaurantProvider>
      <OrderProvider>
        <AssistanceProvider>
          <NotificationProvider>
            <AnnouncementBanner />
            <Header />
            <main className="container mx-auto p-4">
              <Outlet />
            </main>
          </NotificationProvider>
        </AssistanceProvider>
      </OrderProvider>
    </RestaurantProvider>
  </SocketProvider>
);

// Public/customer routes: no header, no container — full viewport control
export const PublicLayout = () => (
  <SocketProvider>
    <RestaurantProvider>
      <NotificationProvider>
        <CartProvider>
          <AnnouncementBanner />
          <Outlet />
        </CartProvider>
      </NotificationProvider>
    </RestaurantProvider>
  </SocketProvider>
);

function App() {
  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={150}>
        <ErrorBoundary>
          <Router>
            <AuthProvider>
              <ConsentProvider>
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    {/* App shell — header + container */}
                    <Route element={<AppLayout />}>
                      <Route path="/" element={<HomePage />} />
                      <Route path="/pricing" element={<PricingPage />} />
                      <Route path="/about" element={<AboutPage />} />

                      {/* Legal pages — public, no auth required */}
                      <Route path="/privacy" element={<PrivacyPolicyPage />} />
                      <Route path="/terms" element={<TermsPage />} />
                      <Route path="/cookies" element={<CookiePolicyPage />} />
                      <Route path="/dpa" element={<DpaPage />} />
                      <Route
                        path="/refund-policy"
                        element={<RefundPolicyPage />}
                      />
                      <Route path="/msa" element={<MsaPage />} />

                      <Route path="/login" element={<LoginPage />} />
                      <Route path="/register" element={<RegisterPage />} />
                      <Route
                        path="/auth/callback"
                        element={<OAuthCallbackPage />}
                      />
                      <Route
                        path="/profile"
                        element={
                          <ProtectedRoute>
                            <CustomerProfilePage />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/dashboard"
                        element={
                          <ProtectedRoute>
                            <DashboardPage />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/dashboard/menu"
                        element={
                          <ProtectedRoute>
                            <MenuProvider>
                              <MenuEditorPage />
                            </MenuProvider>
                          </ProtectedRoute>
                        }
                      />
                    </Route>

                    {/* Staff POS — no chrome, full viewport */}
                    <Route
                      element={
                        <SocketProvider>
                          <RestaurantProvider>
                            <OrderProvider>
                              <NotificationProvider>
                                <RouteGroupErrorBoundary>
                                  <PosLayout />
                                </RouteGroupErrorBoundary>
                              </NotificationProvider>
                            </OrderProvider>
                          </RestaurantProvider>
                        </SocketProvider>
                      }
                    >
                      <Route
                        path="/staff/pos"
                        element={
                          <StaffRoute>
                            <PosProvider>
                              <PosPage />
                            </PosProvider>
                          </StaffRoute>
                        }
                      />
                      <Route
                        path="/staff/kitchen"
                        element={
                          <StaffRoute>
                            <KitchenPage />
                          </StaffRoute>
                        }
                      />
                    </Route>

                    {/* Onboarding — full-screen, no app chrome */}
                    <Route path="/onboarding" element={<OnboardingPage />} />

                    <Route
                      path="/device-enroll"
                      element={<DeviceEnrollPage />}
                    />
                    <Route path="/device-login" element={<DeviceLoginPage />} />

                    {/* Super Admin — dark sidebar, platform-wide access */}
                    <Route
                      element={
                        <SuperAdminRoute>
                          <SuperAdminLayout />
                        </SuperAdminRoute>
                      }
                    >
                      <Route path="/super-admin" element={<OverviewPage />} />
                      <Route
                        path="/super-admin/tenants"
                        element={<TenantsPage />}
                      />
                      <Route
                        path="/super-admin/tenants/:id"
                        element={<TenantDetailPage />}
                      />
                      <Route
                        path="/super-admin/legal"
                        element={<LegalSettingsPage />}
                      />
                      <Route
                        path="/super-admin/help"
                        element={<HelpCenterPage />}
                      />
                      <Route
                        path="/super-admin/revenue"
                        element={<RevenuePage />}
                      />
                      <Route
                        path="/super-admin/data-requests"
                        element={<DataRequestsPage />}
                      />
                    </Route>

                    {/* Impersonation exchange — public, short-lived code */}
                    <Route
                      path="/impersonate/:code"
                      element={<ImpersonationExchangePage />}
                    />

                    <Route element={<PublicLayout />}>
                      <Route element={<RouteGroupErrorBoundary />}>
                        <Route
                          path="/menu/public/:restaurantId"
                          element={<PublicMenuPage />}
                        />
                        <Route path="/m/:slug" element={<VanityMenuRoute />} />
                        <Route path="/checkout" element={<CheckoutPage />} />
                        <Route
                          path="/order-confirmation"
                          element={<OrderConfirmationPage />}
                        />
                        <Route
                          path="/payment-confirmation"
                          element={<PaymentConfirmationPage />}
                        />
                      </Route>
                      <Route
                        path="/feedback/:restaurantId"
                        element={<FeedbackPage />}
                      />
                      <Route
                        path="/book/:restaurantId"
                        element={<BookingPage />}
                      />
                      <Route
                        path="/booking/confirmation"
                        element={<BookingConfirmationPage />}
                      />
                      <Route
                        path="/booking/manage"
                        element={<BookingManagePage />}
                      />
                    </Route>

                    {/* L-FE-1: catch-all for unknown paths */}
                    <Route path="*" element={<NotFoundPage />} />
                  </Routes>
                </Suspense>
                <CookieConsentBanner />
              </ConsentProvider>
            </AuthProvider>
          </Router>
        </ErrorBoundary>
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;
