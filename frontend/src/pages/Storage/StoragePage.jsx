import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNotify } from '../../context/NotificationContext.jsx';
import './StoragePage.css';

const TYPE_LABELS = { volume: 'Volume', nas: 'NAS', zfs_pool: 'Pool ZFS', partage: 'Partage' };
const EMPTY_FORM = { name: '', type: 'volume', host: '', totalGB: '', usedGB: '', notes: '' };

export default function StoragePage() {
  const { user } = useAuth();
  const { data, reload } = useApi(() => api.get('/volumes'), []);
  const notify = useNotify();
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const volumes = data?.items || [];
  const totalCapacity = volumes.reduce((s, v) => s + v.totalGB, 0);
  const totalUsed = volumes.reduce((s, v) => s + v.usedGB, 0);
  const alertCount = volumes.filter((v) => v.totalGB > 0 && v.usedGB / v.totalGB > 0.85).length;

  async function createVolume(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/volumes', form);
      notify(`${form.name} ajouté`, { type: 'ok' });
      setForm(EMPTY_FORM);
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  async function removeVolume(v) {
    if (!confirm(`Retirer ${v.name} du suivi ?`)) return;
    await api.del(`/volumes/${v.id}`);
    notify('Volume retiré', { type: 'info' });
    reload();
  }

  return (
    <>
      <PageHeader title="Stockage" sub="Volumes, NAS, pools ZFS déclaratifs, sauvegardes, et état réel du stockage Proxmox si configuré" />

      <div className="storage-kpi-grid">
        <KpiCard label="Volumes suivis" value={volumes.length} tint="#3B82F6" />
        <KpiCard label="En alerte (> 85 %)" value={alertCount} tint={alertCount > 0 ? '#F43F5E' : '#10B981'} />
        <KpiCard label="Capacité totale" value={totalCapacity.toLocaleString('fr-FR')} unit="Go" tint="#8B5CF6" />
        <KpiCard label="Utilisé" value={totalCapacity ? Math.round((totalUsed / totalCapacity) * 100) : 0} unit="%" tint="#F59E0B" />
      </div>

      <div className="storage-panel-grid">
        <Panel title="Ajouter un volume" span={4}>
          <form onSubmit={createVolume} style={{ padding: 16 }}>
            <Field label="Nom"><input className="input" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
            <Field label="Type">
              <select className="input" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Hôte" hint="Serveur ou NAS hébergeant ce volume"><input className="input" value={form.host} onChange={(e) => set(setForm, 'host', e.target.value)} /></Field>
            <div className="storage-form-row">
              <Field label="Capacité (Go)"><input className="input" type="number" min="0" value={form.totalGB} onChange={(e) => set(setForm, 'totalGB', e.target.value)} /></Field>
              <Field label="Utilisé (Go)"><input className="input" type="number" min="0" value={form.usedGB} onChange={(e) => set(setForm, 'usedGB', e.target.value)} /></Field>
            </div>
            <button className="btn storage-submit-btn" type="submit" disabled={busy}>{busy ? 'Ajout…' : 'Ajouter'}</button>
          </form>
        </Panel>

        <Panel title="Volumes & pools" sub="Capacité mise à jour manuellement" span={8}>
          {volumes.length === 0 ? (
            <div className="storage-empty">Aucun volume suivi</div>
          ) : (
            <div className="storage-volume-list">
              {volumes.map((v) => {
                const pct = v.totalGB > 0 ? Math.round((v.usedGB / v.totalGB) * 100) : 0;
                const color = pct > 85 ? 'var(--tone-crit-dot)' : pct > 65 ? 'var(--tone-warn-dot)' : 'var(--tone-ok-dot)';
                return (
                  <div key={v.id} className="storage-volume-row">
                    <div className="storage-volume-meta">
                      <div className="storage-volume-name">{v.name}</div>
                      <div className="faint storage-volume-type">{TYPE_LABELS[v.type]}{v.host ? ` · ${v.host}` : ''}</div>
                    </div>
                    <div className="storage-volume-bar-track">
                      <div className="storage-volume-bar-fill" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
                    </div>
                    <span className="mono storage-volume-usage">{v.usedGB} / {v.totalGB} Go</span>
                    {pct > 85 && <Icon name="alertTriangle" size={14} className="storage-volume-alert-icon" />}
                    <span className="btn-outline storage-volume-remove" onClick={() => removeVolume(v)}>
                      <Icon name="trash" size={12} />
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <ProxmoxStoragePanel />

        {user?.role === 'admin' && <BackupSummaryPanel />}
      </div>
    </>
  );
}

// Distinct du suivi déclaratif ci-dessus (saisi/mis à jour à la main) : ici,
// l'état réel des stockages Proxmox (dir, lvmthin, zfspool, nfs...) tel que
// rapporté par l'API, used/avail en octets déjà fournis par Proxmox — jamais
// de valeur inventée si l'intégration n'est pas configurée (panneau masqué).
function ProxmoxStoragePanel() {
  const status = useApi(() => api.get('/proxmox/status'), []);
  const storage = useApi(() => api.get('/proxmox/storage'), [], { pollMs: 30000 });

  if (status.data && !status.data.status.configured) return null;

  const items = storage.data?.items || [];

  return (
    <Panel title="Stockage Proxmox" sub="État réel des stockages par nœud (rafraîchi toutes les 30s)" span={12}>
      {items.length === 0 ? (
        <div className="storage-empty">Aucun stockage remonté par Proxmox</div>
      ) : (
        <div className="storage-volume-list">
          {items.map((s) => {
            const pct = Math.round((s.usedFraction || 0) * 100);
            const color = pct > 85 ? 'var(--tone-crit-dot)' : pct > 65 ? 'var(--tone-warn-dot)' : 'var(--tone-ok-dot)';
            const usedGB = Math.round(s.used / 1024 / 1024 / 1024);
            const totalGB = Math.round(s.total / 1024 / 1024 / 1024);
            return (
              <div key={`${s.node}-${s.storage}`} className="storage-volume-row">
                <div className="storage-volume-meta">
                  <div className="storage-volume-name">{s.storage}</div>
                  <div className="faint storage-volume-type">{s.node} · {s.type}{!s.active ? ' · inactif' : ''}</div>
                </div>
                <div className="storage-volume-bar-track">
                  <div className="storage-volume-bar-fill" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
                </div>
                <span className="mono storage-volume-usage">{usedGB} / {totalGB} Go</span>
                {pct > 85 && <Icon name="alertTriangle" size={14} className="storage-volume-alert-icon" />}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function set(setForm, field, value) {
  setForm((f) => ({ ...f, [field]: value }));
}

function BackupSummaryPanel() {
  const { data } = useApi(() => api.get('/backups'), []);
  const items = data?.items || [];
  const totalBytes = items.reduce((s, b) => s + b.sizeBytes, 0);
  const totalMB = (totalBytes / 1024 / 1024).toFixed(1);

  return (
    <Panel
      title="Sauvegardes de la console"
      sub="Base Nexus (nexus.db), gérées depuis Paramètres → Système"
      span={12}
      actions={<Link to="/settings?tab=system" className="btn-outline storage-backup-summary-link">Gérer</Link>}
    >
      <div className="storage-backup-stats">
        <div>
          <div className="faint storage-backup-stat-label">Sauvegardes conservées</div>
          <div className="storage-backup-stat-value">{items.length}</div>
        </div>
        <div>
          <div className="faint storage-backup-stat-label">Taille totale</div>
          <div className="storage-backup-stat-value">{totalMB} Mo</div>
        </div>
        <div>
          <div className="faint storage-backup-stat-label">Plus récente</div>
          <div className="storage-backup-stat-value">{items[0] ? new Date(items[0].createdAt).toLocaleString('fr-FR') : '—'}</div>
        </div>
      </div>
    </Panel>
  );
}

function Field({ label, hint, children }) {
  return (
    <div className="storage-field">
      <label className="storage-field-label">{label}</label>
      {children}
      {hint && <div className="faint storage-field-hint">{hint}</div>}
    </div>
  );
}
