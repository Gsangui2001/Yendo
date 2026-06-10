import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { UIProvider } from './components/ui/feedback';
import Layout    from './components/Layout';
import AuthPage  from './pages/AuthPage';
import ComercioApp from './pages/comercio/Dashboard';
import CadeteApp   from './pages/cadete/Dashboard';
import PrivadoApp  from './pages/privado/Dashboard';
import AdminApp    from './pages/admin/Dashboard';

// Redirige al dashboard correcto según el rol
function RoleRedirect({ perfil }) {
  const routes = { admin: '/admin', comercio: '/comercio', cadete: '/cadete', privado: '/privado' };
  return <Navigate to={routes[perfil?.rol] ?? '/login'} replace />;
}

// Ruta protegida: verifica autenticación y rol
function PrivateRoute({ children, rol, perfil }) {
  if (!perfil) return <Navigate to="/login" replace />;
  if (perfil.rol !== rol) return <RoleRedirect perfil={perfil} />;
  return children;
}

// Wrapper con Layout y page state
function DashboardWrapper({ perfil, defaultPage, Component }) {
  const [page, setPage] = useState(defaultPage);
  return (
    <Layout perfil={perfil} page={page} setPage={setPage}>
      <Component perfil={perfil} page={page} setPage={setPage} />
    </Layout>
  );
}

export default function App() {
  const { user, perfil, loading } = useAuth();

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-400">Cargando...</p>
      </div>
    </div>
  );

  return (
    <UIProvider>
    <BrowserRouter>
      <Routes>
        {/* Login / Registro */}
        <Route path="/login" element={
          user && perfil ? <RoleRedirect perfil={perfil} /> : <AuthPage />
        } />

        {/* Dashboards protegidos */}
        <Route path="/admin" element={
          <PrivateRoute rol="admin" perfil={perfil}>
            <DashboardWrapper perfil={perfil} defaultPage="inicio" Component={AdminApp} />
          </PrivateRoute>
        } />
        <Route path="/comercio" element={
          <PrivateRoute rol="comercio" perfil={perfil}>
            <DashboardWrapper perfil={perfil} defaultPage="inicio" Component={ComercioApp} />
          </PrivateRoute>
        } />
        <Route path="/cadete" element={
          <PrivateRoute rol="cadete" perfil={perfil}>
            <DashboardWrapper perfil={perfil} defaultPage="inicio" Component={CadeteApp} />
          </PrivateRoute>
        } />
        <Route path="/privado" element={
          <PrivateRoute rol="privado" perfil={perfil}>
            <DashboardWrapper perfil={perfil} defaultPage="inicio" Component={PrivadoApp} />
          </PrivateRoute>
        } />

        {/* Raíz: redirige según estado */}
        <Route path="/" element={
          user && perfil ? <RoleRedirect perfil={perfil} /> : <Navigate to="/login" replace />
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </UIProvider>
  );
}
