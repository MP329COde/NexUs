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

  const s = summary.data?.summary?.connection || {};
  const wazuhConfigured = status.data?.status?.configured;

  return (
    <>
      <PageHeader title="Cybersécurité" sub={status.data?.status?.message || 'Agents, IPs bannies, scans réseau et conformité'} />

      {user?.role === 'admin' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16, marginBottom: 16 }}>
          <SecurityOverviewPanel />
        </div>
      )}

      {wazuhConfigured && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 16 }}>
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
                <td style={{ fontWeight: 500 }}>{a.name}</td>
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
        <div className="card" style={{ marginBottom: 16 }}>
          <EmptyState title="Wazuh n'est pas configuré" hint="Renseignez l'URL du gestionnaire et des identifiants API depuis Paramètres → Wazuh pour superviser vos agents." />
        </div>
      )}

      {user?.role === 'admin' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16 }}>
          <BanlistPanel />
          <NetworkScanPanel />
        </div>
      )}
    </>
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
      <div style={{ padding: 16 }}>
        <form onSubmit={ban} style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <input className="input" placeholder="Adresse IPv4 (ex. 203.0.113.5)" required value={ip} onChange={(e) => setIp(e.target.value)} style={{ flex: '1 1 180px' }} />
          <input className="input" placeholder="Raison (optionnel)" value={reason} onChange={(e) => setReason(e.target.value)} style={{ flex: '1 1 160px' }} />
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Bannissement…' : 'Bannir'}</button>
        </form>
        {data?.items?.length === 0 && <div className="faint" style={{ fontSize: 12.5, textAlign: 'center', padding: 10 }}>Aucune adresse bannie</div>}
        {data?.items?.map((b) => (
          <div key={b.ip} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border-soft)' }}>
            <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, flex: 'none' }}>{b.ip}</span>
            <span className="faint" style={{ fontSize: 11.5, flex: 1 }}>{b.reason || '—'}</span>
            <span className="btn-outline" style={{ height: 24, padding: '0 8px', fontSize: 11 }} onClick={() => unban(b.ip)}>Débannir</span>
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
      <div style={{ padding: 16 }}>
        <form onSubmit={scan} style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input className="input" placeholder="Cible (ex. 10.0.0.0/24)" required value={target} onChange={(e) => setTarget(e.target.value)} style={{ flex: 1 }} />
          <button className="btn" type="submit" disabled={scanning} style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="refresh" size={13} className={scanning ? 'spin' : ''} />{scanning ? 'Scan…' : 'Lancer'}
          </button>
        </form>
        {!last && <div className="faint" style={{ fontSize: 12.5, textAlign: 'center', padding: 10 }}>Aucun scan effectué</div>}
        {last && (
          <>
            <div className="faint" style={{ fontSize: 11, marginBottom: 8 }}>
              Dernier scan : {last.target} · {new Date(last.startedAt).toLocaleString('fr-FR')} · {last.hostCount} hôte(s) trouvé(s)
            </div>
            {last.hosts.map((h) => (
              <div key={h.ip} style={{ padding: '7px 0', borderTop: '1px solid var(--border-soft)' }}>
                <span className="mono" style={{ fontSize: 12.5, fontWeight: 600 }}>{h.ip}</span>
                <div className="faint" style={{ fontSize: 11 }}>
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
        <div style={{ padding: 20, fontSize: 12.5, color: 'var(--text-faint)' }}>Chargement…</div>
      </Panel>
    );
  }
  if (!data) return null;

  const totalOpenIncidents = SEVERITY_ROWS.reduce((sum, r) => sum + (data.incidentsBySeverity[r.key]?.length || 0), 0);

  return (
    <Panel title="Tableau de sécurité" sub="Certificats, incidents ouverts par gravité, agents déconnectés" span={12}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14, padding: 16 }}>
        <div>
          <div className="faint" style={{ fontSize: 11, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>Incidents ouverts par gravité</div>
          {totalOpenIncidents === 0 ? (
            <div className="faint" style={{ fontSize: 12.5 }}>Aucun incident ouvert</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {SEVERITY_ROWS.map((r) => {
                const count = data.incidentsBySeverity[r.key]?.length || 0;
                if (count === 0) return null;
                return (
                  <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="dot" style={{ background: r.tint }} />
                    <span style={{ fontSize: 12.5, flex: 1 }}>{r.label}</span>
                    <span className="mono" style={{ fontSize: 12.5, fontWeight: 700 }}>{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <div className="faint" style={{ fontSize: 11, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>Certificats expirant sous 30 jours</div>
          {data.expiringCertificates.length === 0 ? (
            <div className="faint" style={{ fontSize: 12.5 }}>Aucun certificat proche de l'expiration</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.expiringCertificates.slice(0, 5).map((c) => (
                <div key={`${c.namespace}/${c.name}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span className={`badge badge-${c.expiresInDays <= 7 ? 'crit' : 'warn'}`}>{c.expiresInDays} j</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="faint" style={{ fontSize: 11, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>Wazuh</div>
          <div style={{ fontSize: 12.5 }}>
            {data.wazuhDisconnected > 0 ? (
              <span style={{ color: 'var(--tone-crit-fg)' }}>{data.wazuhDisconnected} agent(s) déconnecté(s)</span>
            ) : (
              <span className="faint">Aucun agent déconnecté</span>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}
