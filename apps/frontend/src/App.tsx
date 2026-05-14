import { BrowserRouter as Router, Routes, Route, Outlet } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import { OrderProvider } from "./context/OrderContext";
import { AssistanceProvider } from "./context/AssistanceContext";
import { SocketProvider } from "./context/SocketContext";
import PublicMenuPage from "./pages/PublicMenuPage";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import CheckoutPage from "./pages/CheckoutPage";
import OrderConfirmationPage from "./pages/OrderConfirmationPage";
import ProtectedRoute from "./components/ProtectedRoute";
import { RestaurantProvider } from "./context/RestaurantContext";
import { MenuProvider } from "./context/MenuContext";
import Header from "./components/Header";
import HomePage from "./pages/HomePage";
import MenuEditorPage from "./pages/MenuEditorPage";
import OAuthCallbackPage from "./pages/OAuthCallbackPage";
import FeedbackPage from "./pages/FeedbackPage";
import ErrorBoundary from "./components/ErrorBoundary";
import PosLayout from "./pages/pos/PosLayout";
import PosPage from "./pages/pos/PosPage";
import KitchenPage from "./pages/staff/KitchenPage";
import StaffRoute from "./components/StaffRoute";
import { PosProvider } from "./context/PosContext";
import CustomerProfilePage from "./pages/CustomerProfilePage";
import DeviceLoginPage from "./pages/DeviceLoginPage";
import DeviceEnrollPage from "./pages/DeviceEnrollPage";
import { NotificationProvider } from "./context/NotificationContext";

// App routes: header + container padding
export const AppLayout = () => (
  <SocketProvider>
    <OrderProvider>
      <AssistanceProvider>
        <RestaurantProvider>
          <NotificationProvider>
            <Header />
            <main className="container mx-auto p-4">
              <Outlet />
            </main>
          </NotificationProvider>
        </RestaurantProvider>
      </AssistanceProvider>
    </OrderProvider>
  </SocketProvider>
);

// Public/customer routes: no header, no container — full viewport control
export const PublicLayout = () => (
  <SocketProvider>
    <RestaurantProvider>
      <NotificationProvider>
        <CartProvider>
          <Outlet />
        </CartProvider>
      </NotificationProvider>
    </RestaurantProvider>
  </SocketProvider>
);

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <AuthProvider>
          <Routes>
            {/* App shell — header + container */}
            <Route element={<AppLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/auth/callback" element={<OAuthCallbackPage />} />
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
                  <NotificationProvider>
                    <OrderProvider>
                      <RestaurantProvider>
                        <PosLayout />
                      </RestaurantProvider>
                    </OrderProvider>
                  </NotificationProvider>
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

            <Route path="/device-enroll" element={<DeviceEnrollPage />} />
            <Route path="/device-login" element={<DeviceLoginPage />} />

            {/* Customer-facing routes — no header, full viewport */}
            <Route element={<PublicLayout />}>
              <Route
                path="/menu/public/:restaurantId"
                element={<PublicMenuPage />}
              />
              <Route path="/checkout" element={<CheckoutPage />} />
              <Route
                path="/order-confirmation"
                element={<OrderConfirmationPage />}
              />
              <Route
                path="/feedback/:restaurantId"
                element={<FeedbackPage />}
              />
            </Route>
          </Routes>
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
