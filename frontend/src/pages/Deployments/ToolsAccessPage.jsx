import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import Modal from '../../components/ui/Modal.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

const CATEGORY_BY_KEY = {
  gitlab: 'Code & revue', github: 'Code & revue',
  argocd: 'Livraison', traefik: 'Livraison', certManager: 'Livraison', haproxy: 'Livraison',
  kubernetes: 'Exécution', proxmox: 'Exécution',
  grafana: 'Observation', wazuh: 'Observation'
};
const TOOL_ICON = {
  gitlab: 'gitlab', github: 'github',
  argocd: 'argocd', traefik: 'traefik', certManager: 'certificate', haproxy: 'haproxy',
  kubernetes: 'k8s', proxmox: 'proxmox',
  grafana: 'grafana', wazuh: 'shield'
};
const CATEGORY_ICON = { 'Code & revue': 'gitBranch', Livraison: 'box', Exécution: 'cube', Observation: 'mon' };
const CATEGORY_SUB = {
  'Code & revue': 'Forge, revues et qualité',
  'Livraison': 'Pipelines, GitOps et routage',
  'Exécution': 'Environnements et conteneurs',
  'Observation': 'Journaux et métriques applicatives'
};
const CATEGORY_ORDER = ['Code & revue', 'Livraison', 'Exécution', 'Observation'];
const EMPTY_FORM = { label: '', url: '', category: 'Exécution' };

// "Accès aux outils" : point d'entrée de la Développement. Regroupe les
// intégrations réellement configurées (statut/lien réels, via /status/overview)
// et les raccourcis ajoutés manuellement vers des outils externes non
// intégrés (wiki, SonarQube...) — aucune des deux listes n'est inventée.
export default function ToolsAccessPage() {
  const { data: overview } = useApi(() => api.get('/status/overview'), [], { pollMs: 20000 });
  const shortcuts = useApi(() => api.get('/shortcuts'), []);
  const notify = useNotify();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const integrations = overview?.integrations || [];
  const shortcutItems = shortcuts.data?.items || [];

  const cards = [
    ...integrations.map((e) => ({
      key: `int-${e.key}`, label: e.label, category: CATEGORY_BY_KEY[e.key] || 'Exécution',
      configured: e.configured, ok: e.ok, url: e.baseUrl || null, kind: 'integration', icon: TOOL_ICON[e.key] || 'terminal'
    })),
    ...shortcutItems.map((s) => ({ key: `sc-${s.id}`, id: s.id, label: s.label, category: s.category, configured: true, ok: true, url: s.url, kind: 'shortcut', opens: s.opens, icon: 'terminal' }))
  ];

  const connectedCount = cards.filter((c) => c.configured && c.ok).length;
  const openedToday = shortcutItems.filter((s) => s.lastOpenedAt && isToday(s.lastOpenedAt)).length
    + integrations.filter(() => false).length; // les intégrations n'ont pas de suivi de clic (lien direct vers baseUrl)
  const notConfigured = cards.filter((c) => !c.configured).length;

  async function openCard(card) {
    if (card.kind === 'shortcut') api.post(`/shortcuts/${card.id}/open`, {}).catch(() => {});
    if (card.url) window.open(card.url, '_blank', 'noreferrer');
  }

  async function addShortcut(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/shortcuts', form);
      notify(`${form.label} ajouté`, { type: 'ok' });
      setForm(EMPTY_FORM);
      setFormOpen(false);
      shortcuts.reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  async function removeShortcut(id) {
    await api.del(`/shortcuts/${id}`);
    shortcuts.reload();
  }

  return (
    <>
      <PageHeader
        title="Accès aux outils"
        sub="Point d'entrée vers la chaîne de développement. Chaque lien ouvre l'outil concerné."
        actions={(
          <button className="btn" onClick={() => setFormOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Icon name="plus" size={14} />Ajouter un raccourci
          </button>
        )}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 14, marginBottom: 16 }}>
        <KpiCard label="Outils connectés" value={connectedCount} unit={`/ ${cards.length}`} tint="#3B82F6" />
        <KpiCard label="Ouverts aujourd'hui" value={openedToday} tint="#8B5CF6" note="raccourcis suivis" />
        <KpiCard label="Raccourcis personnalisés" value={shortcutItems.length} tint="#F59E0B" />
        <KpiCard label="Non configurés" value={notConfigured} tint={notConfigured > 0 ? '#F43F5E' : '#10B981'} />
      </div>

      {formOpen && (
        <Modal title="Ajouter un raccourci" sub="Lien manuel vers un outil externe non intégré" onClose={() => setFormOpen(false)} width={440}>
          <form onSubmit={addShortcut} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 5, color: 'var(--text-muted)' }}>Nom</label>
              <input className="input" required value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="SonarQube" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 5, color: 'var(--text-muted)' }}>URL</label>
              <input className="input" required type="url" value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://sonar.lab.local" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 5, color: 'var(--text-muted)' }}>Catégorie</label>
              <select className="input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <span className="btn-outline" onClick={() => setFormOpen(false)}>Annuler</span>
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Ajout…' : 'Ajouter'}</button>
            </div>
          </form>
        </Modal>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 16, marginBottom: 16 }}>
        {CATEGORY_ORDER.map((cat) => {
          const items = cards.filter((c) => c.category === cat);
          return (
            <Panel key={cat} title={(<span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Icon name={CATEGORY_ICON[cat]} size={13} style={{ color: 'var(--text-faint)' }} />{cat}</span>)} sub={CATEGORY_SUB[cat]} span={6}>
              {items.length === 0 ? (
                <div style={{ padding: 20, fontSize: 12.5, color: 'var(--text-faint)', textAlign: 'center' }}>Aucun outil dans cette catégorie</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, padding: 14 }}>
                  {items.map((c) => (
                    <div
                      key={c.key}
                      onClick={() => openCard(c)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-soft)', cursor: c.url ? 'pointer' : 'default', position: 'relative' }}
                    >
                      <span style={{
                        width: 32, height: 32, borderRadius: 8, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: c.configured ? (c.ok ? 'var(--tone-ok-soft, var(--primary-soft))' : 'var(--tone-crit-soft, var(--primary-soft))') : 'var(--border-soft)',
                        color: c.configured ? (c.ok ? 'var(--tone-ok-fg)' : 'var(--tone-crit-fg)') : 'var(--text-faint)'
                      }}>
                        <Icon name={c.icon} size={15} />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</div>
                        <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.configured ? (c.url ? c.url.replace(/^https?:\/\//, '') : 'connecté') : 'Non configuré'}
                        </div>
                      </div>
                      {c.url && <Icon name="externalLink" size={13} style={{ color: 'var(--text-faint)', flex: 'none' }} />}
                      {c.kind === 'shortcut' && (
                        <span
                          onClick={(e) => { e.stopPropagation(); removeShortcut(c.id); }}
                          title="Retirer"
                          style={{ position: 'absolute', top: 4, right: 4, color: 'var(--text-faintest)', cursor: 'pointer' }}
                        >
                          <Icon name="x" size={12} />
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          );
        })}
      </div>

      <Panel title="État des intégrations de la chaîne" sub="Statut en direct" span={12}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr>
                {['Outil', 'Domaine', 'État', 'Message', 'Latence'].map((c) => (
                  <th key={c} style={{ textAlign: 'left', padding: '8px 16px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-faint)', borderBottom: '1px solid var(--border-soft)' }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {integrations.map((e) => (
                <tr key={e.key} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                  <td style={{ padding: '9px 16px', fontWeight: 600 }}>{e.label}</td>
                  <td style={{ padding: '9px 16px', color: 'var(--text-muted)' }}>{CATEGORY_BY_KEY[e.key] || '—'}</td>
                  <td style={{ padding: '9px 16px' }}>
                    <span className={`badge badge-${e.configured ? (e.ok ? 'ok' : 'crit') : 'mut'}`}><span className="dot" />{e.configured ? (e.ok ? 'Connecté' : 'Erreur') : 'Non configuré'}</span>
                  </td>
                  <td style={{ padding: '9px 16px', color: 'var(--text-faint)' }}>{e.message}</td>
                  <td style={{ padding: '9px 16px' }} className="mono muted">{e.latencyMs} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function isToday(iso) {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}
