import { createBrowserRouter } from 'react-router-dom';
import RequireAuth from './components/layout/RequireAuth.jsx';
import RequirePermission from './components/layout/RequirePermission.jsx';
import RequireHomeAccess from './components/layout/RequireHomeAccess.jsx';
import SetupGate from './components/layout/SetupGate.jsx';
import Shell from './components/layout/Shell.jsx';
import LoginPage from './pages/Login/LoginPage.jsx';
import SetupPage from './pages/Setup/SetupPage.jsx';
import HomePage from './pages/Home/HomePage.jsx';
import KubernetesLayout from './pages/Kubernetes/KubernetesLayout.jsx';
import KubernetesPage from './pages/Kubernetes/KubernetesPage.jsx';
import ServicesPage from './pages/Kubernetes/ServicesPage.jsx';
import TerminalPage from './pages/Kubernetes/TerminalPage.jsx';
import NetworkLayout from './pages/Network/NetworkLayout.jsx';
import NetworkPage from './pages/Network/NetworkPage.jsx';
import NetworkServicesPage from './pages/Network/NetworkServicesPage.jsx';
import HAProxyPage from './pages/Network/HAProxyPage.jsx';
import TopologyPage from './pages/Network/TopologyPage.jsx';
import CertificatesPage from './pages/Network/CertificatesPage.jsx';
import FirewallPage from './pages/Network/FirewallPage.jsx';
import InfrastructureLayout from './pages/Infrastructure/InfrastructureLayout.jsx';
import ProxmoxPage from './pages/Infrastructure/ProxmoxPage.jsx';
import HostsPage from './pages/Infrastructure/HostsPage.jsx';
import MonitoringPage from './pages/Monitoring/MonitoringPage.jsx';
import DeploymentsLayout from './pages/Deployments/DeploymentsLayout.jsx';
import ToolsAccessPage from './pages/Deployments/ToolsAccessPage.jsx';
import ProjectsPage from './pages/Deployments/ProjectsPage.jsx';
import OrganizationsPage from './pages/Deployments/OrganizationsPage.jsx';
import OrganizationDetailPage from './pages/Deployments/OrganizationDetailPage.jsx';
import WikiPage from './pages/Deployments/WikiPage.jsx';
import ProjectDetailPage from './pages/Deployments/ProjectDetailPage.jsx';
import GitReposPage from './pages/Deployments/GitReposPage.jsx';
import CodeReviewsPage from './pages/Deployments/CodeReviewsPage.jsx';
import PipelinesPage from './pages/Deployments/PipelinesPage.jsx';
import EnvironmentsPage from './pages/Deployments/EnvironmentsPage.jsx';
import ReleasesPage from './pages/Deployments/ReleasesPage.jsx';
import IacPage from './pages/Deployments/IacPage.jsx';
import TestsQualityPage from './pages/Deployments/TestsQualityPage.jsx';
import ContainersPage from './pages/Deployments/ContainersPage.jsx';
import ImagesRegistryPage from './pages/Deployments/ImagesRegistryPage.jsx';
import SecretsPage from './pages/Deployments/SecretsPage.jsx';
import SupplyChainPage from './pages/Deployments/SupplyChainPage.jsx';
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
          { index: true, element: <RequireHomeAccess><HomePage /></RequireHomeAccess>, handle: { title: 'Vue générale' } },
          {
            path: 'deployments',
            element: <DeploymentsLayout />,
            handle: { title: 'Développement' },
            children: [
              { index: true, element: <ToolsAccessPage />, handle: { title: 'Accès aux outils' } },
              { path: 'projects', element: <ProjectsPage />, handle: { title: 'Projets' } },
              { path: 'organizations', element: <OrganizationsPage />, handle: { title: 'Organisations' } },
              { path: 'organizations/:id', element: <OrganizationDetailPage />, handle: { title: 'Organisation' } },
              { path: 'organizations/:id/wiki', element: <WikiPage />, handle: { title: "Wiki d'équipe" } },
              { path: 'projects/:id', element: <ProjectDetailPage />, handle: { title: 'Projet' } },
              { path: 'repos', element: <GitReposPage />, handle: { title: 'Dépôts Git' } },
              { path: 'reviews', element: <CodeReviewsPage />, handle: { title: 'Revue de code' } },
              { path: 'pipelines', element: <PipelinesPage />, handle: { title: 'Pipelines CI/CD' } },
              { path: 'environments', element: <EnvironmentsPage />, handle: { title: 'Environnements' } },
              { path: 'releases', element: <ReleasesPage />, handle: { title: 'Déploiements' } },
              { path: 'iac', element: <IacPage />, handle: { title: 'Infrastructure as Code' } },
              { path: 'tests', element: <TestsQualityPage />, handle: { title: 'Tests & qualité' } },
              { path: 'containers', element: <ContainersPage />, handle: { title: 'Conteneurs' } },
              { path: 'images', element: <ImagesRegistryPage />, handle: { title: 'Images & registry' } },
              { path: 'secrets', element: <SecretsPage />, handle: { title: 'Secrets & variables' } },
              { path: 'supply-chain', element: <SupplyChainPage />, handle: { title: 'Supply Chain Security' } }
            ]
          },
          {
            path: 'infrastructure',
            element: <InfrastructureLayout />,
            handle: { title: 'Infrastructure' },
            children: [
              { index: true, element: <ProxmoxPage />, handle: { title: 'Proxmox' } },
              { path: 'hosts', element: <RequirePermission domain="hosts" level="admin"><HostsPage /></RequirePermission>, handle: { title: 'Hôtes & agents' } }
            ]
          },
          {
            path: 'kubernetes',
            element: <KubernetesLayout />,
            handle: { title: 'Kubernetes' },
            children: [
              { index: true, element: <KubernetesPage />, handle: { title: 'Charges de travail' } },
              { path: 'services', element: <ServicesPage />, handle: { title: 'Services' } },
              { path: 'terminal', element: <TerminalPage />, handle: { title: 'Terminal sécurisé' } }
            ]
          },
          {
            path: 'network',
            element: <NetworkLayout />,
            handle: { title: 'Réseaux' },
            children: [
              { index: true, element: <TopologyPage />, handle: { title: 'Topologie' } },
              { path: 'proxies', element: <NetworkPage />, handle: { title: 'Proxies & domaines' } },
              { path: 'services', element: <NetworkServicesPage />, handle: { title: 'Réseaux internes' } },
              { path: 'haproxy', element: <HAProxyPage />, handle: { title: 'HAProxy' } },
              { path: 'certificates', element: <CertificatesPage />, handle: { title: 'Certificats' } },
              { path: 'firewall', element: <FirewallPage />, handle: { title: 'Pare-feu' } }
            ]
          },
          { path: 'monitoring', element: <MonitoringPage />, handle: { title: 'Monitoring' } },
          { path: 'security', element: <SecurityPage />, handle: { title: 'Cybersécurité' } },
          { path: 'storage', element: <StoragePage />, handle: { title: 'Stockage' } },
          { path: 'account', element: <AccountPage />, handle: { title: 'Mon compte' } },
          { path: 'manual', element: <ManualPage />, handle: { title: "Manuel d'utilisation" } },
          { path: 'report', element: <ReportPage />, handle: { title: 'Rapport de santé' } },
          // Garde globale retirée : chaque onglet a désormais sa propre
          // permission RBAC (voir RequirePermission dans SettingsPage.jsx),
          // un compte "user" peut donc accéder à la page si au moins un
          // onglet lui est ouvert, sans avoir le rôle admin de plateforme.
          { path: 'settings', element: <SettingsPage />, handle: { title: 'Paramètres' } }
        ]
      }
    ]
  }
]);
