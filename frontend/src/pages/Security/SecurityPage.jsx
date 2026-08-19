import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNotify } from '../../context/NotificationContext.jsx';
import Tabs from '../../components/ui/Tabs.jsx';
import './SecurityPage.css';

const SEC_TABS = [
  { id: 'overview', label: "Vue d'ensemble" },
  { id: 'agents', label: 'Agents Wazuh' },
  { id: 'compliance', label: 'Conformité' },
  { id: 'scans', label: 'IPs bannies & scans' }
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Interroge GET /api/jobs/:id (job sans portée projet) jusqu'à ce qu'il
// quitte pending/running. nmap peut aller jusqu'à 120s (--host-timeout côté
// backend) : 90 tentatives à 2s (~3 min) laisse une marge raisonnable avant
// d'abandonner le suivi côté UI.
async function pollJob(jobId, maxAttempts = 90) {
  for (let i = 0; i < maxAttempts; i++) {
    const { job } = await api.get(`/jobs/${jobId}`);
    if (job.status === 'succeeded' || job.status === 'failed') return job;
    await sleep(2000);
  }
  throw new Error('Le scan met anormalement longtemps à se terminer — vérifiez son état dans quelques instants.');
}

export default function SecurityPage() {
  const { user } = useAuth();
  const status = useApi(() => api.get('/wazuh/status'), [], { pollMs: 30000 });
  const agents = useApi(() => api.get('/wazuh/agents'), [], { pollMs: 20000 });
  const summary = useApi(() => api.get('/wazuh/summary'), [], { pollMs: 20000 });
  const sca = useApi(() => api.get('/wazuh/sca-summary'), [], { pollMs: 60000 });
  const [tab, setTab] = useState('overview');

  const s = summary.data?.summary?.connection || {};
  const wazuhConfigured = status.data?.status?.configured;

  return (
    <>
      <PageHeader title="Cybersécurité" sub={status.data?.status?.message || 'Agents, IPs bannies, scans réseau et conformité'} />

      <Tabs tabs={SEC_TABS} active={tab} onChange={setTab} className="sec-tabs" />

      {tab === 'overview' && user?.role === 'admin' && (
        <div className="security-panel-row">
          <SecurityOverviewPanel />
        </div>
      )}

      {tab === 'agents' && (<>
      {wazuhConfigured && (
        <div className="security-kpi-grid">
          <KpiCard label="Agents actifs" value={s.active ?? '—'} tint="#10B981" />
          <KpiCard label="Déconnectés" value={s.disconnected ?? '—'} tint="#F43F5E" />
          <KpiCard label="Jamais connectés" value={s.never_connected ?? '—'} tint="#94A3B8" />
          <KpiCard label="Total" value={s.total ?? '—'} tint="#3B82F6" />
        </div>
      )}

      {wazuhConfigured ? (
        <Panel title="Agents Wazuh" sub="Supervision des hôtes" span={12} style={{ marginBottom: 16 }}>
          <DataTable
            columns={['Agent', 'Adresse IP', 'OS', 'Version', 'Statut', 'Dernier contact']}
            rows={agents.data?.items}
            emptyTitle="Aucun agent"
            renderRow={(a) => (
              <tr key={a.id}>
                <td className="security-cell-name">{a.name}</td>
                <td className="mono muted">{a.ip}</td>
                <td>{a.os || '—'}</td>
                <td className="mono faint">{a.version}</td>
                <td><span className={`badge badge-${a.status === 'active' ? 'ok' : a.status === 'disconnected' ? 'crit' : 'mut'}`}><span className="dot" />{a.status}</span></td>
                <td className="mono faint">{a.lastKeepAlive ? new Date(a.lastKeepAlive).toLocaleString('fr-FR') : '—'}</td>
              </tr>
            )}
          />
        </Panel>
      ) : (
        <div className="card security-empty-wrap">
          <EmptyState title="Wazuh n'est pas configuré" hint="Renseignez l'URL du gestionnaire et des identifiants API depuis Paramètres → Wazuh pour superviser vos agents." />
        </div>
      )}
      </>)}

      {tab === 'compliance' && (wazuhConfigured ? <SCAPanel data={sca.data} /> : (
        <div className="card security-empty-wrap">
          <EmptyState title="Wazuh n'est pas configuré" hint="La conformité (SCA) dépend des mêmes agents Wazuh que l'onglet précédent." />
        </div>
      ))}

      {tab === 'scans' && (user?.role === 'admin' ? (
        <div className="security-panel-row" style={{ marginBottom: 0 }}>
          <BanlistPanel />
          <NetworkScanPanel />
        </div>
      ) : (
        <div className="card security-empty-wrap">
          <EmptyState title="Réservé aux administrateurs" hint="Le bannissement d'IP et les scans réseau sont des actions sensibles réservées aux comptes administrateur." />
        </div>
      ))}
    </>
  );
}

// Conformité (Security Configuration Assessment) : audits CIS Benchmarks
// remontés par chaque agent Wazuh actif, agrégés depuis /wazuh/sca-summary
// (services/integrations/wazuhService.js). Contrairement au tableau
// "Agents Wazuh" ci-dessus (statut de connexion), ceci reflète l'état réel
// de durcissement de chaque hôte — c'était le manque signalé ("vraie
// intégration Wazuh").
function SCAPanel({ data }) {
  const agents = data?.agents || [];
  const allPolicies = agents.flatMap((a) => a.policies.map((p) => ({ ...p, agentName: a.agentName })));

  return (
    <Panel
      title="Conformité (SCA)"
      sub={data ? `${data.agentsScanned} / ${data.agentsTotal} agent(s) actif(s) analysé(s)${data.agentsScanned < data.agentsTotal ? ' — limité à 25 par cycle' : ''}` : 'Chargement…'}
      span={12}
      style={{ marginBottom: 16 }}
    >
      {allPolicies.length === 0 ? (
        <div className="faint security-list-empty">Aucun audit de conformité (SCA) remonté par les agents actifs pour le moment.</div>
      ) : (
        <DataTable
          columns={['Agent', 'Politique', 'Score', 'Réussis', 'Échoués', 'Dernier scan']}
          rows={allPolicies}
          renderRow={(p, i) => {
            const total = (p.pass || 0) + (p.fail || 0);
            const pct = total ? Math.round((p.pass / total) * 100) : null;
            return (
              <tr key={`${p.agentName}-${p.policyId}-${i}`}>
                <td className="security-cell-name">{p.agentName}</td>
                <td>{p.name}</td>
                <td>
                  {pct !== null
                    ? <span className={`badge badge-${pct >= 80 ? 'ok' : pct >= 50 ? 'warn' : 'crit'}`}><span className="dot" />{pct}%</span>
                    : '—'}
                </td>
                <td className="mono muted">{p.pass ?? '—'}</td>
                <td className="mono muted">{p.fail ?? '—'}</td>
                <td className="mono faint">{p.endScan ? new Date(p.endScan).toLocaleString('fr-FR') : '—'}</td>
              </tr>
            );
          }}
        />
      )}
    </Panel>
  );
}

function BanlistPanel() {
  const { data, reload } = useApi(() => api.get('/security/banlist'), []);
  const notify = useNotify();
  const [ip, setIp] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function ban(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/security/banlist', { ip, reason });
      notify(`${ip} bannie`, { type: 'ok' });
      setIp('');
      setReason('');
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  async function unban(ipToRemove) {
    await api.del(`/security/banlist/${ipToRemove}`);
    notify(`${ipToRemove} débannie`, { type: 'info' });
    reload();
  }

  return (
    <Panel title="IPs bannies" sub="Bloque l'accès à la console (appliqué immédiatement, toutes les routes)" span={6}>
      <div className="security-panel-body">
        <form onSubmit={ban} className="security-form-row">
          <input className="input security-form-input-wide" placeholder="Adresse IPv4 (ex. 203.0.113.5)" required value={ip} onChange={(e) => setIp(e.target.value)} />
          <input className="input security-form-input-narrow" placeholder="Raison (optionnel)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Bannissement…' : 'Bannir'}</button>
        </form>
        {data?.items?.length === 0 && <div className="faint security-list-empty">Aucune adresse bannie</div>}
        {data?.items?.map((b) => (
          <div key={b.ip} className="security-list-row">
            <span className="mono security-list-ip">{b.ip}</span>
            <span className="faint security-list-reason">{b.reason || '—'}</span>
            <span className="btn-outline security-unban-btn" onClick={() => unban(b.ip)}>Débannir</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function NetworkScanPanel() {
  const { data, reload } = useApi(() => api.get('/security/scans'), []);
  const notify = useNotify();
  const [target, setTarget] = useState('');
  const [scanning, setScanning] = useState(false);

  // Un scan nmap peut prendre jusqu'à 2 minutes (voir networkScanService.js
  // côté backend) : quand le socle relationnel est disponible, la requête
  // renvoie un job (202) suivi par polling jusqu'à sa fin réelle, plutôt que
  // de garder la requête HTTP ouverte tout ce temps. Repli sur l'ancien
  // comportement (réponse directe) si Postgres n'est pas configuré.
  async function scan(e) {
    e.preventDefault();
    setScanning(true);
    try {
      const res = await api.post('/security/scans', { target });
      if (res.job) {
        const job = await pollJob(res.job.id);
        if (job.status !== 'succeeded') throw new Error(job.error || 'Échec du scan');
      }
      notify('Scan terminé', { type: 'ok' });
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit', title: 'Scan échoué' });
    } finally {
      setScanning(false);
    }
  }

  const last = data?.last;

  return (
    <Panel title="Scans réseau" sub="nmap -sV — découverte d'hôtes et de services sur une plage IPv4" span={6}>
      <div className="security-panel-body">
        <form onSubmit={scan} className="security-scan-form">
          <input className="input security-scan-input" placeholder="Cible (ex. 10.0.0.0/24)" required value={target} onChange={(e) => setTarget(e.target.value)} />
          <button className="btn security-scan-btn" type="submit" disabled={scanning}>
            <Icon name="refresh" size={13} className={scanning ? 'spin' : ''} />{scanning ? 'Scan…' : 'Lancer'}
          </button>
        </form>
        {!last && <div className="faint security-list-empty">Aucun scan effectué</div>}
        {last && (
          <>
            <div className="faint security-scan-meta">
              Dernier scan : {last.target} · {new Date(last.startedAt).toLocaleString('fr-FR')} · {last.hostCount} hôte(s) trouvé(s)
            </div>
            {last.hosts.map((h) => (
              <div key={h.ip} className="security-scan-host-row">
                <span className="mono security-scan-host-ip">{h.ip}</span>
                <div className="faint security-scan-host-ports">
                  {h.ports.map((p) => `${p.port}/${p.service}`).join(', ')}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </Panel>
  );
}

const SEVERITY_ROWS = [
  { key: 'critical', label: 'Critique', tint: '#F43F5E' },
  { key: 'high', label: 'Élevée', tint: '#F97316' },
  { key: 'medium', label: 'Moyenne', tint: '#F59E0B' },
  { key: 'low', label: 'Faible', tint: '#94A3B8' }
];

// Tableau de sécurité global (GET /api/security/overview) : certificats
// proches expiration, incidents ouverts par gravité, agents Wazuh
// déconnectés — signaux réels agrégés, jamais de donnée inventée quand une
// intégration sous-jacente n'est pas configurée (sections vides).
function SecurityOverviewPanel() {
  const { data, loading } = useApi(() => api.get('/security/overview'), []);

  if (loading && !data) {
    return (
      <Panel title="Tableau de sécurité" span={12}>
        <div className="security-overview-loading">Chargement…</div>
      </Panel>
    );
  }
  if (!data) return null;

  const totalOpenIncidents = SEVERITY_ROWS.reduce((sum, r) => sum + (data.incidentsBySeverity[r.key]?.length || 0), 0);

  return (
    <Panel title="Tableau de sécurité" sub="Certificats, incidents ouverts par gravité, agents déconnectés" span={12}>
      <div className="security-overview-grid">
        <div>
          <div className="faint security-overview-heading">Incidents ouverts par gravité</div>
          {totalOpenIncidents === 0 ? (
            <div className="faint security-overview-empty">Aucun incident ouvert</div>
          ) : (
            <div className="security-overview-list">
              {SEVERITY_ROWS.map((r) => {
                const count = data.incidentsBySeverity[r.key]?.length || 0;
                if (count === 0) return null;
                return (
                  <div key={r.key} className="security-overview-row">
                    <span className="dot" style={{ background: r.tint }} />
                    <span className="security-overview-row-label">{r.label}</span>
                    <span className="mono security-overview-row-count">{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <div className="faint security-overview-heading">Certificats expirant sous 30 jours</div>
          {data.expiringCertificates.length === 0 ? (
            <div className="faint security-overview-empty">Aucun certificat proche de l'expiration</div>
          ) : (
            <div className="security-overview-list">
              {data.expiringCertificates.slice(0, 5).map((c) => (
                <div key={`${c.namespace}/${c.name}`} className="security-overview-cert-row">
                  <span className={`badge badge-${c.expiresInDays <= 7 ? 'crit' : 'warn'}`}>{c.expiresInDays} j</span>
                  <span className="security-overview-cert-name">{c.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="faint security-overview-heading">Wazuh</div>
          <div className="security-overview-wazuh">
            {data.wazuhDisconnected > 0 ? (
              <span className="security-overview-wazuh-alert">{data.wazuhDisconnected} agent(s) déconnecté(s)</span>
            ) : (
              <span className="faint">Aucun agent déconnecté</span>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}
