import { createBrowserRouter } from 'react-router-dom';
import RequireAuth from './components/layout/RequireAuth.jsx';
import RequireRole from './components/layout/RequireRole.jsx';
import SetupGate from './components/layout/SetupGate.jsx';
import Shell from './components/layout/Shell.jsx';
import LoginPage from './pages/Login/LoginPage.jsx';
import SetupPage from './pages/Setup/SetupPage.jsx';
import HomePage from './pages/Home/HomePage.jsx';
import KubernetesLayout from './pages/Kubernetes/KubernetesLayout.jsx';
import KubernetesPage from './pages/Kubernetes/KubernetesPage.jsx';
import ServicesPage from './pages/Kubernetes/ServicesPage.jsx';
import NetworkLayout from './pages/Network/NetworkLayout.jsx';
import NetworkPage from './pages/Network/NetworkPage.jsx';
import HAProxyPage from './pages/Network/HAProxyPage.jsx';
import TopologyPage from './pages/Network/TopologyPage.jsx';
import CertificatesPage from './pages/Network/CertificatesPage.jsx';
import InfrastructureLayout from './pages/Infrastructure/InfrastructureLayout.jsx';
import ProxmoxPage from './pages/Infrastructure/ProxmoxPage.jsx';
import HostsPage from './pages/Infrastructure/HostsPage.jsx';
import MonitoringPage from './pages/Monitoring/MonitoringPage.jsx';
import DeploymentsPage from './pages/Deployments/DeploymentsPage.jsx';
import SecurityPage from './pages/Security/SecurityPage.jsx';
import SettingsPage from './pages/Settings/SettingsPage.jsx';
import AccountPage from './pages/Account/AccountPage.jsx';
import ManualPage from './pages/Manual/ManualPage.jsx';
import ReportPage from './pages/Report/ReportPage.jsx';
import StoragePage from './pages/Storage/StoragePage.jsx';

// createBrowserRouter (plutôt que <Routes>) est nécessaire ici car Shell utilise
// useMatches() pour dériver le titre affiché dans le header depuis `handle`.
// SetupGate encapsule tout : tant qu'aucun administrateur n'existe, toute route
// redirige vers /setup ; une fois configurée, /setup redirige vers /login.
export const router = createBrowserRouter([
  {
    element: <SetupGate />,
    children: [
      { path: '/setup', element: <SetupPage /> },
      { path: '/login', element: <LoginPage /> },
      {
        element: <RequireAuth><Shell /></RequireAuth>,
        children: [
          { index: true, element: <HomePage />, handle: { title: 'Vue générale' } },
          { path: 'deployments', element: <DeploymentsPage />, handle: { title: 'Développement' } },
          {
            path: 'infrastructure',
            element: <InfrastructureLayout />,
            handle: { title: 'Infrastructure' },
            children: [
              { index: true, element: <ProxmoxPage /> },
              { path: 'hosts', element: <RequireRole role="admin"><HostsPage /></RequireRole> }
            ]
          },
          {
            path: 'kubernetes',
            element: <KubernetesLayout />,
            handle: { title: 'Kubernetes' },
            children: [
              { index: true, element: <KubernetesPage /> },
              { path: 'services', element: <ServicesPage /> }
            ]
          },
          {
            path: 'network',
            element: <NetworkLayout />,
            handle: { title: 'Réseaux' },
            children: [
              { index: true, element: <TopologyPage /> },
              { path: 'proxies', element: <NetworkPage /> },
              { path: 'haproxy', element: <HAProxyPage /> },
              { path: 'certificates', element: <CertificatesPage /> }
            ]
          },
          { path: 'monitoring', element: <MonitoringPage />, handle: { title: 'Monitoring' } },
          { path: 'security', element: <SecurityPage />, handle: { title: 'Cybersécurité' } },
          { path: 'storage', element: <StoragePage />, handle: { title: 'Stockage' } },
          { path: 'account', element: <AccountPage />, handle: { title: 'Mon compte' } },
          { path: 'manual', element: <ManualPage />, handle: { title: "Manuel d'utilisation" } },
          { path: 'report', element: <ReportPage />, handle: { title: 'Rapport de santé' } },
          { path: 'settings', element: <RequireRole role="admin"><SettingsPage /></RequireRole>, handle: { title: 'Paramètres' } }
        ]
      }
    ]
  }
]);
