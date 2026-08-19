import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import Modal from '../../components/ui/Modal.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import './ToolsAccessPage.css';

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

  // Trois catégories distinctes plutôt qu'une liste mélangée (todo.md item
  // 22 : "Elle mélange actuellement intégrations connectées et raccourcis
  // externes") — Intégré : statut/santé réels via /status/overview. Externe :
  // raccourci manuel ajouté par un utilisateur, jamais de statut de santé
  // (aucune vérification effectuée sur une URL arbitraire).
  const integratedCards = integrations.map((e) => ({
    key: `int-${e.key}`, label: e.label, category: CATEGORY_BY_KEY[e.key] || 'Exécution',
    configured: e.configured, ok: e.ok, url: e.baseUrl || null, kind: 'integration', icon: TOOL_ICON[e.key] || 'terminal'
  }));
  const externalCards = shortcutItems.map((s) => ({ key: `sc-${s.id}`, id: s.id, label: s.label, category: s.category, configured: true, ok: true, url: s.url, kind: 'shortcut', opens: s.opens, icon: 'terminal' }));
  const cards = [...integratedCards, ...externalCards];

  const connectedCount = integratedCards.filter((c) => c.configured && c.ok).length;
  const openedToday = shortcutItems.filter((s) => s.lastOpenedAt && isToday(s.lastOpenedAt)).length;
  const notConfigured = integratedCards.filter((c) => !c.configured).length;

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
          <button className="btn tools-header-action" onClick={() => setFormOpen(true)}>
            <Icon name="plus" size={14} />Ajouter un raccourci
          </button>
        )}
      />

      <div className="tools-kpi-grid">
        <KpiCard label="Outils intégrés connectés" value={connectedCount} unit={`/ ${integratedCards.length}`} tint="#3B82F6" />
        <KpiCard label="Ouverts aujourd'hui" value={openedToday} tint="#8B5CF6" note="raccourcis suivis" />
        <KpiCard label="Raccourcis personnalisés" value={shortcutItems.length} tint="#F59E0B" />
        <KpiCard label="Non configurés" value={notConfigured} tint={notConfigured > 0 ? '#F43F5E' : '#10B981'} />
      </div>

      {formOpen && (
        <Modal title="Ajouter un raccourci" sub="Lien manuel vers un outil externe non intégré" onClose={() => setFormOpen(false)} width={440}>
          <form onSubmit={addShortcut} className="tools-form-fields">
            <div>
              <label className="tools-form-label">Nom</label>
              <input className="input" required value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="SonarQube" />
            </div>
            <div>
              <label className="tools-form-label">URL</label>
              <input className="input" required type="url" value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://sonar.lab.local" />
            </div>
            <div>
              <label className="tools-form-label">Catégorie</label>
              <select className="input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="tools-form-actions">
              <span className="btn-outline" onClick={() => setFormOpen(false)}>Annuler</span>
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Ajout…' : 'Ajouter'}</button>
            </div>
          </form>
        </Modal>
      )}

      <h2 className="tools-section-title">Outils intégrés</h2>
      <div className="tools-category-grid">
        {CATEGORY_ORDER.map((cat) => {
          const items = integratedCards.filter((c) => c.category === cat);
          return (
            <Panel
              key={cat}
              title={(<span className="tools-panel-title"><Icon name={CATEGORY_ICON[cat]} size={13} className="tools-panel-title-icon" />{cat}</span>)}
              sub={CATEGORY_SUB[cat]}
              span={6}
            >
              {items.length === 0 ? (
                <div className="tools-category-empty">Aucun outil dans cette catégorie</div>
              ) : (
                <div className="tools-card-grid">
                  {items.map((c) => (
                    <div key={c.key} onClick={() => openCard(c)} className={`tools-card${c.url ? ' tools-card-clickable' : ''}`}>
                      <span
                        className="tools-card-icon"
                        style={{
                          background: c.configured ? (c.ok ? 'var(--tone-ok-soft, var(--primary-soft))' : 'var(--tone-crit-soft, var(--primary-soft))') : 'var(--border-soft)',
                          color: c.configured ? (c.ok ? 'var(--tone-ok-fg)' : 'var(--tone-crit-fg)') : 'var(--text-faint)'
                        }}
                      >
                        <Icon name={c.icon} size={15} />
                      </span>
                      <div className="tools-card-body">
                        <div className="tools-card-label">{c.label}</div>
                        <div className="mono tools-card-url">
                          {c.configured ? (c.url ? c.url.replace(/^https?:\/\//, '') : 'connecté') : 'Non configuré'}
                        </div>
                      </div>
                      {c.url && <Icon name="externalLink" size={13} className="tools-card-external-icon" />}
                      {c.kind === 'shortcut' && (
                        <span onClick={(e) => { e.stopPropagation(); removeShortcut(c.id); }} title="Retirer" className="tools-card-remove">
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

      <h2 className="tools-section-title">Outils externes (raccourcis manuels)</h2>
      <Panel sub="Liens ajoutés manuellement vers des outils non intégrés — aucun statut de santé vérifié" span={12}>
        {externalCards.length === 0 ? (
          <div className="tools-category-empty">Aucun raccourci externe ajouté.</div>
        ) : (
          <div className="tools-card-grid">
            {externalCards.map((c) => (
              <div key={c.key} onClick={() => openCard(c)} className="tools-card tools-card-clickable">
                <span className="tools-card-icon" style={{ background: 'var(--tone-ok-soft, var(--primary-soft))', color: 'var(--tone-ok-fg)' }}>
                  <Icon name={c.icon} size={15} />
                </span>
                <div className="tools-card-body">
                  <div className="tools-card-label">{c.label}</div>
                  <div className="mono tools-card-url">{c.url.replace(/^https?:\/\//, '')}</div>
                  <span className="badge badge-mut" style={{ marginTop: 4 }}>{c.category}</span>
                </div>
                <Icon name="externalLink" size={13} className="tools-card-external-icon" />
                <span onClick={(e) => { e.stopPropagation(); removeShortcut(c.id); }} title="Retirer" className="tools-card-remove">
                  <Icon name="x" size={12} />
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="État des intégrations de la chaîne" sub="Statut en direct" span={12}>
        <div className="tools-table-wrap">
          <table className="tools-table">
            <thead>
              <tr>
                {['Outil', 'Domaine', 'État', 'Message', 'Latence'].map((c) => (
                  <th key={c} className="tools-table-head">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {integrations.map((e) => (
                <tr key={e.key} className="tools-table-row">
                  <td className="tools-table-cell tools-table-cell-name">{e.label}</td>
                  <td className="tools-table-cell tools-table-cell-domain">{CATEGORY_BY_KEY[e.key] || '—'}</td>
                  <td className="tools-table-cell">
                    <span className={`badge badge-${e.configured ? (e.ok ? 'ok' : 'crit') : 'mut'}`}><span className="dot" />{e.configured ? (e.ok ? 'Connecté' : 'Erreur') : 'Non configuré'}</span>
                  </td>
                  <td className="tools-table-cell tools-table-cell-message">{e.message}</td>
                  <td className="tools-table-cell mono muted">{e.latencyMs} ms</td>
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
