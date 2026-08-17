import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { InfraLoadPanel, WorkloadDonutPanel } from './InfraLoadPanels.jsx';
import CriticalHostsPanel from './CriticalHostsPanel.jsx';
import LiveActivityPanel from './LiveActivityPanel.jsx';
import ServiceAvailabilityPanel from './ServiceAvailabilityPanel.jsx';
import OpenAlertsPanel from './OpenAlertsPanel.jsx';
import AdminOverviewPanel from './AdminOverviewPanel.jsx';
import MyProjectsOverviewPanel from './MyProjectsOverviewPanel.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import './HomePage.css';

export default function HomePage() {
  const { data, loading, error, reload } = useApi(() => api.get('/status/overview'), [], { pollMs: 15000 });
  const [spinning, setSpinning] = useState(false);
  const [alertsCount, setAlertsCount] = useState(null);
  const [nodes, setNodes] = useState(null); // { online, total } | null (non configuré)

  useEffect(() => {
    let cancelled = false;
    async function loadAlerts() {
      const results = await Promise.allSettled([api.get('/grafana/alerts'), api.get('/wazuh/summary')]);
      if (cancelled) return;
      const grafanaCount = results[0].status === 'fulfilled' ? (results[0].value.items || []).length : 0;
      const wazuhDisconnected = results[1].status === 'fulfilled' ? (results[1].value.summary?.disconnected || 0) : 0;
      setAlertsCount(grafanaCount + wazuhDisconnected);
    }
    async function loadNodes() {
      try {
        const res = await api.get('/proxmox/nodes');
        if (cancelled) return;
        const items = res.items || [];
        setNodes({ online: items.filter((n) => n.status === 'online').length, total: items.length });
      } catch {
        if (!cancelled) setNodes(null);
      }
    }
    loadAlerts();
    loadNodes();
    const id = setInterval(() => { loadAlerts(); loadNodes(); }, 20000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  async function onRefresh() {
    setSpinning(true);
    await reload();
    setTimeout(() => setSpinning(false), 400);
  }

  return (
    <>
      <PageHeader
        title="Vue générale"
        sub="État global de l'infrastructure : Kubernetes, Argo CD, HAProxy, GitLab, Proxmox, Traefik, Cert-Manager et Grafana."
        actions={(
          <div className="home-header-actions">
            <Link to="/report" className="btn-outline">
              <Icon name="externalLink" size={14} />Rapport
            </Link>
            <button className="btn-outline" onClick={onRefresh}>
              <Icon name="refresh" size={14} className={spinning ? 'spin' : ''} />Actualiser
            </button>
          </div>
        )}
      />

      <div className="home-kpi-grid">
        <KpiCard label="Santé globale" value={data ? `${data.score}` : '—'} unit="%" tint="#3B82F6" note="pondérée sur les intégrations configurées" />
        <KpiCard label="Nœuds en ligne" value={nodes ? nodes.online : '—'} unit={nodes ? `/ ${nodes.total}` : ''} tint="#8B5CF6" note={nodes ? undefined : 'Non configuré (Proxmox)'} />
        <KpiCard label="Alertes ouvertes" value={alertsCount ?? '—'} tint={alertsCount > 0 ? '#F43F5E' : '#10B981'} note="Grafana + agents Wazuh déconnectés" />
        <KpiCard label="Dernière actualisation" value={data ? new Date(data.generatedAt).toLocaleTimeString('fr-FR') : '—'} tint="#F59E0B" />
      </div>

      {error && <div className="card home-error-banner">{error}</div>}
      {loading && !data && <div className="card home-loading-banner">Chargement…</div>}

      <div className="home-panel-row">
        <AdminOverviewPanel />
        <MyProjectsOverviewPanel />
      </div>

      <div className="home-panel-row">
        <InfraLoadPanel />
        <WorkloadDonutPanel />
      </div>

      <div className="home-panel-row">
        <CriticalHostsPanel />
        <LiveActivityPanel />
      </div>

      <div className="home-panel-row">
        <ServiceAvailabilityPanel />
        <OpenAlertsPanel />
      </div>
    </>
  );
}
