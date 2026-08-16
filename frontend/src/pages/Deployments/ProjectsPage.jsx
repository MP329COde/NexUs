import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Modal from '../../components/ui/Modal.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNotify } from '../../context/NotificationContext.jsx';
import './ProjectsPage.css';

const EMPTY_FORM = { name: '', description: '', memberIds: [], icon: '', color: '' };
const PROJECT_EMOJIS = ['📦', '🚀', '⚙️', '🛰️', '🔧', '🧩', '🗄️', '🌐', '🔥', '🧠', '🛡️', '📊'];
const PROJECT_COLORS = ['#2563EB', '#8B5CF6', '#10B981', '#F59E0B', '#F43F5E', '#0EA5E9', '#EC4899', '#475569'];

// "Projets" : fiches projet réelles (store projectsStore.js). Visibilité
// appliquée côté serveur (GET /projects) — un compte Utilisateur ne voit ici
// que les projets dont il est membre, jamais la liste complète.
export default function ProjectsPage() {
  const { user } = useAuth();
  const notify = useNotify();
  const { data, reload } = useApi(() => api.get('/projects'), []);
  const users = useApi(() => (user?.role === 'admin' ? api.get('/users') : Promise.resolve(null)), [user?.role]);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const projects = data?.items || [];
  const allUsers = users.data?.items || [];

  async function createProject(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/projects', form);
      notify(`${form.name} créé`, { type: 'ok' });
      setForm(EMPTY_FORM);
      setFormOpen(false);
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  function toggleMember(id) {
    setForm((f) => ({ ...f, memberIds: f.memberIds.includes(id) ? f.memberIds.filter((m) => m !== id) : [...f.memberIds, id] }));
  }

  return (
    <>
      <PageHeader
        title="Projets"
        sub={user?.role === 'admin' ? "Fiches projet, équipes et dépôts rattachés." : "Vos projets — seuls ceux dont vous êtes membre sont visibles."}
        actions={user?.role === 'admin' && (
          <button className="btn projects-header-action" onClick={() => setFormOpen(true)}>
            <Icon name="plus" size={14} />Nouveau projet
          </button>
        )}
      />

      <div className="projects-kpi-grid">
        <KpiCard label="Projets visibles" value={projects.length} tint="#3B82F6" />
        <KpiCard label="Actifs" value={projects.filter((p) => p.status === 'active').length} tint="#10B981" />
        <KpiCard label="Membre de" value={projects.filter((p) => p.memberIds.includes(user?.id)).length} tint="#8B5CF6" />
      </div>

      {formOpen && (
        <Modal title="Nouveau projet" sub="Visible seulement des membres sélectionnés, hors administrateurs" onClose={() => setFormOpen(false)} width={520}>
          <form onSubmit={createProject}>
            <div className="projects-form-row">
              <div className="projects-form-field-name">
                <label className="projects-form-label">Nom</label>
                <input className="input" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="api-gateway" />
              </div>
              <div className="projects-form-field-desc">
                <label className="projects-form-label">Description</label>
                <input className="input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Passerelle API publique" />
              </div>
            </div>
            <label className="projects-form-label">Icône (optionnel)</label>
            <div className="projects-emoji-picker">
              {PROJECT_EMOJIS.map((e) => (
                <span
                  key={e}
                  onClick={() => setForm((f) => ({ ...f, icon: e === f.icon ? '' : e }))}
                  className={`projects-emoji-option${e === form.icon ? ' projects-emoji-option-active' : ''}`}
                >
                  {e}
                </span>
              ))}
            </div>
            <div className="projects-color-picker">
              {PROJECT_COLORS.map((c) => (
                <span
                  key={c}
                  onClick={() => setForm((f) => ({ ...f, color: c }))}
                  className={`projects-color-option${c === form.color ? ' projects-color-option-active' : ''}`}
                  style={{ background: c }}
                />
              ))}
            </div>
            <label className="projects-members-label">
              <Icon name="users" size={13} />Membres — un compte n'ayant qu'un seul projet ne verra que celui-ci
            </label>
            <div className="projects-members-picker">
              {allUsers.map((u) => (
                <label key={u.id} className={`projects-member-chip${form.memberIds.includes(u.id) ? ' projects-member-chip-active' : ''}`}>
                  <input type="checkbox" checked={form.memberIds.includes(u.id)} onChange={() => toggleMember(u.id)} />
                  {u.name}
                </label>
              ))}
            </div>
            <div className="projects-form-actions">
              <span className="btn-outline" onClick={() => setFormOpen(false)}>Annuler</span>
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Création…' : 'Créer le projet'}</button>
            </div>
          </form>
        </Modal>
      )}

      <div className="projects-grid">
        {projects.length === 0 ? (
          <div className="card projects-empty">
            {user?.role === 'admin' ? 'Aucun projet créé.' : "Vous n'êtes membre d'aucun projet — contactez un administrateur."}
          </div>
        ) : projects.map((p) => (
          <Link key={p.id} to={`/deployments/projects/${p.id}`} className="card projects-card">
            <div className="projects-card-header">
              <span className="projects-card-title">
                {p.icon ? (
                  <span className="projects-card-icon" style={{ background: p.color || 'var(--border-soft)' }}>{p.icon}</span>
                ) : (
                  <Icon name="folder" size={15} style={{ color: p.color || 'var(--text-faint)' }} />
                )}
                {p.name}
              </span>
              <span className={`badge badge-${p.status === 'active' ? 'ok' : p.status === 'paused' ? 'warn' : 'mut'}`}><span className="dot" />{p.status}</span>
            </div>
            <p className="faint projects-card-desc">{p.description || 'Aucune description'}</p>
            <div className="projects-card-meta">
              <span className="projects-card-meta-item"><Icon name="users" size={12} />{p.memberIds.length}</span>
              <span>·</span>
              <span className="projects-card-meta-item"><Icon name="gitBranch" size={12} />{p.repoKeys.length}</span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
