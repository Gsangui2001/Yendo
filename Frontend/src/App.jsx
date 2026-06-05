import { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import Layout from './components/Layout';
import ComercioApp from './pages/comercio/Dashboard';
import CadeteApp   from './pages/cadete/Dashboard';
import PrivadoApp  from './pages/privado/Dashboard';
import AdminApp    from './pages/admin/Dashboard';
import AuthPage    from './pages/AuthPage';

export default function App() {
  const { user, perfil, loading } = useAuth();
  const [page, setPage] = useState('inicio');

  // Cargando
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Cargando...</p>
        </div>
      </div>
    );
  }

  // No autenticado → pantalla de login/registro
  if (!user || !perfil) {
    return <AuthPage />;
  }

  // Dashboard por rol
  const dashboardProps = { perfil, page, setPage };

  const renderDashboard = () => {
    switch (perfil.rol) {
      case 'comercio': return <ComercioApp {...dashboardProps} />;
      case 'cadete':   return <CadeteApp   {...dashboardProps} />;
      case 'privado':  return <PrivadoApp  {...dashboardProps} />;
      case 'admin':    return <AdminApp    {...dashboardProps} />;
      default:         return <div className="p-8 text-center text-gray-500">Rol no reconocido: {perfil.rol}</div>;
    }
  };

  return (
    <Layout perfil={perfil} page={page} setPage={setPage}>
      {renderDashboard()}
    </Layout>
  );
}
