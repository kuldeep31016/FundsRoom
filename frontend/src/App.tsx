import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { AppLayout } from './components/layout/AppLayout';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { EmptyState } from './components/ui';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { CustomerListPage } from './pages/customers/CustomerListPage';
import { CustomerFormPage } from './pages/customers/CustomerFormPage';
import { CustomerDetailPage } from './pages/customers/CustomerDetailPage';
import { ProductListPage } from './pages/products/ProductListPage';
import { ProductFormPage } from './pages/products/ProductFormPage';
import { ProductDetailPage } from './pages/products/ProductDetailPage';
import { StockMovementsPage } from './pages/stock/StockMovementsPage';
import { ChallanListPage } from './pages/challans/ChallanListPage';
import { ChallanCreatePage } from './pages/challans/ChallanCreatePage';
import { ChallanDetailPage } from './pages/challans/ChallanDetailPage';
import { UsersPage } from './pages/UsersPage';

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            {/* Everything below requires a valid session. Each route additionally
                declares the permission it needs; the API enforces the same rules. */}
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route
                index
                element={
                  <ProtectedRoute permission="dashboard:read">
                    <DashboardPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="customers"
                element={
                  <ProtectedRoute permission="customers:read">
                    <CustomerListPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="customers/new"
                element={
                  <ProtectedRoute permission="customers:write">
                    <CustomerFormPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="customers/:id"
                element={
                  <ProtectedRoute permission="customers:read">
                    <CustomerDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="customers/:id/edit"
                element={
                  <ProtectedRoute permission="customers:write">
                    <CustomerFormPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="products"
                element={
                  <ProtectedRoute permission="products:read">
                    <ProductListPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="products/new"
                element={
                  <ProtectedRoute permission="products:write">
                    <ProductFormPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="products/:id"
                element={
                  <ProtectedRoute permission="products:read">
                    <ProductDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="products/:id/edit"
                element={
                  <ProtectedRoute permission="products:write">
                    <ProductFormPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="stock"
                element={
                  <ProtectedRoute permission="stock:read">
                    <StockMovementsPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="challans"
                element={
                  <ProtectedRoute permission="challans:read">
                    <ChallanListPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="challans/new"
                element={
                  <ProtectedRoute permission="challans:write">
                    <ChallanCreatePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="challans/:id"
                element={
                  <ProtectedRoute permission="challans:read">
                    <ChallanDetailPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="users"
                element={
                  <ProtectedRoute permission="users:read">
                    <UsersPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="*"
                element={
                  <EmptyState
                    icon="?"
                    title="Page not found"
                    message="The page you are looking for does not exist or has been moved."
                    action={
                      <a className="btn btn--primary" href="/">
                        Back to dashboard
                      </a>
                    }
                  />
                }
              />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
