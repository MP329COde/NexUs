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
      <PageHeader title="Stockage" sub="Volumes, NAS, pools ZFS et sauvegardes — suivi déclaratif, mis à jour manuellement" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 16 }}>
        <KpiCard label="Volumes suivis" value={volumes.length} tint="#3B82F6" />
        <KpiCard label="En alerte (> 85 %)" value={alertCount} tint={alertCount > 0 ? '#F43F5E' : '#10B981'} />
        <KpiCard label="Capacité totale" value={totalCapacity.toLocaleString('fr-FR')} unit="Go" tint="#8B5CF6" />
        <KpiCard label="Utilisé" value={totalCapacity ? Math.round((totalUsed / totalCapacity) * 100) : 0} unit="%" tint="#F59E0B" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16 }}>
        <Panel title="Ajouter un volume" span={4}>
          <form onSubmit={createVolume} style={{ padding: 16 }}>
            <Field label="Nom"><input className="input" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
            <Field label="Type">
              <select className="input" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Hôte" hint="Serveur ou NAS hébergeant ce volume"><input className="input" value={form.host} onChange={(e) => set(setForm, 'host', e.target.value)} /></Field>
            <div style={{ display: 'flex', gap: 8 }}>
              <Field label="Capacité (Go)"><input className="input" type="number" min="0" value={form.totalGB} onChange={(e) => set(setForm, 'totalGB', e.target.value)} /></Field>
              <Field label="Utilisé (Go)"><input className="input" type="number" min="0" value={form.usedGB} onChange={(e) => set(setForm, 'usedGB', e.target.value)} /></Field>
            </div>
            <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? 'Ajout…' : 'Ajouter'}</button>
          </form>
        </Panel>

        <Panel title="Volumes & pools" sub="Capacité mise à jour manuellement" span={8}>
          {volumes.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>Aucun volume suivi</div>
          ) : (
            <div style={{ padding: 6 }}>
              {volumes.map((v) => {
                const pct = v.totalGB > 0 ? Math.round((v.usedGB / v.totalGB) * 100) : 0;
                const color = pct > 85 ? 'var(--tone-crit-dot)' : pct > 65 ? 'var(--tone-warn-dot)' : 'var(--tone-ok-dot)';
                return (
                  <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 12px', borderBottom: '1px solid var(--border-soft)' }}>
                    <div style={{ width: 150, flex: 'none' }}>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{v.name}</div>
                      <div className="faint" style={{ fontSize: 11 }}>{TYPE_LABELS[v.type]}{v.host ? ` · ${v.host}` : ''}</div>
                    </div>
                    <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--border-soft)', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color }} />
                    </div>
                    <span className="mono" style={{ fontSize: 11.5, width: 130, textAlign: 'right', flex: 'none' }}>{v.usedGB} / {v.totalGB} Go</span>
                    {pct > 85 && <Icon name="alertTriangle" size={14} style={{ color: 'var(--tone-crit-fg)', flex: 'none' }} />}
                    <span className="btn-outline" style={{ height: 24, padding: '0 8px', fontSize: 11, flex: 'none' }} onClick={() => removeVolume(v)}>
                      <Icon name="trash" size={12} />
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        {user?.role === 'admin' && <BackupSummaryPanel />}
      </div>
    </>
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
      actions={<Link to="/settings?tab=system" className="btn-outline" style={{ textDecoration: 'none' }}>Gérer</Link>}
    >
      <div style={{ padding: 16, display: 'flex', gap: 32 }}>
        <div>
          <div className="faint" style={{ fontSize: 11 }}>Sauvegardes conservées</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{items.length}</div>
        </div>
        <div>
          <div className="faint" style={{ fontSize: 11 }}>Taille totale</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{totalMB} Mo</div>
        </div>
        <div>
          <div className="faint" style={{ fontSize: 11 }}>Plus récente</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{items[0] ? new Date(items[0].createdAt).toLocaleString('fr-FR') : '—'}</div>
        </div>
      </div>
    </Panel>
  );
}

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 5, color: 'var(--text-muted)' }}>{label}</label>
      {children}
      {hint && <div className="faint" style={{ fontSize: 11, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}
