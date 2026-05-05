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
import CustomerProfilePage from "./pages/CustomerProfilePage";

// App routes: header + container padding
const AppLayout = () => (
  <>
    <Header />
    <main className="container mx-auto p-4">
      <Outlet />
    </main>
  </>
);

// Public/customer routes: no header, no container — full viewport control
const PublicLayout = () => <Outlet />;

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <AuthProvider>
          <SocketProvider>
            <RestaurantProvider>
              <CartProvider>
                <OrderProvider>
                  <AssistanceProvider>
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
                  </AssistanceProvider>
                </OrderProvider>
              </CartProvider>
            </RestaurantProvider>
          </SocketProvider>
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
