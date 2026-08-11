import { createBrowserRouter } from 'react-router-dom';
import RequireAuth from './components/layout/RequireAuth.jsx';
import Shell from './components/layout/Shell.jsx';
import LoginPage from './pages/Login/LoginPage.jsx';
import HomePage from './pages/Home/HomePage.jsx';
import KubernetesPage from './pages/Kubernetes/KubernetesPage.jsx';
import NetworkPage from './pages/Network/NetworkPage.jsx';
import ProxmoxPage from './pages/Infrastructure/ProxmoxPage.jsx';
import MonitoringPage from './pages/Monitoring/MonitoringPage.jsx';
import DeploymentsPage from './pages/Deployments/DeploymentsPage.jsx';
import SettingsPage from './pages/Settings/SettingsPage.jsx';
import StubPage from './components/ui/StubPage.jsx';

// createBrowserRouter (plutôt que <Routes>) est nécessaire ici car Shell utilise
// useMatches() pour dériver le titre affiché dans le header depuis `handle`.
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth><Shell /></RequireAuth>,
    children: [
      { index: true, element: <HomePage />, handle: { title: 'Vue générale' } },
      { path: 'deployments', element: <DeploymentsPage />, handle: { title: 'Développement' } },
      { path: 'infrastructure', element: <ProxmoxPage />, handle: { title: 'Infrastructure' } },
      { path: 'kubernetes', element: <KubernetesPage />, handle: { title: 'Kubernetes' } },
      { path: 'network', element: <NetworkPage />, handle: { title: 'Réseaux' } },
      { path: 'monitoring', element: <MonitoringPage />, handle: { title: 'Monitoring' } },
      { path: 'security', element: <StubPage title="Cybersécurité" sub="Vulnérabilités, accès et audit" />, handle: { title: 'Cybersécurité' } },
      { path: 'storage', element: <StubPage title="Stockage" sub="Volumes, NAS et sauvegardes" />, handle: { title: 'Stockage' } },
      { path: 'settings', element: <SettingsPage />, handle: { title: 'Paramètres' } }
    ]
  }
]);
