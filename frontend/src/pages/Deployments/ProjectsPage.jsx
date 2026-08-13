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

const EMPTY_FORM = { name: '', description: '', memberIds: [] };

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
          <button className="btn" onClick={() => setFormOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Icon name="plus" size={14} />Nouveau projet
          </button>
        )}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 16 }}>
        <KpiCard label="Projets visibles" value={projects.length} tint="#3B82F6" />
        <KpiCard label="Actifs" value={projects.filter((p) => p.status === 'active').length} tint="#10B981" />
        <KpiCard label="Membre de" value={projects.filter((p) => p.memberIds.includes(user?.id)).length} tint="#8B5CF6" />
      </div>

      {formOpen && (
        <Modal title="Nouveau projet" sub="Visible seulement des membres sélectionnés, hors administrateurs" onClose={() => setFormOpen(false)} width={520}>
          <form onSubmit={createProject}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 5, color: 'var(--text-muted)' }}>Nom</label>
                <input className="input" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="api-gateway" />
              </div>
              <div style={{ flex: 2 }}>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 5, color: 'var(--text-muted)' }}>Description</label>
                <input className="input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Passerelle API publique" />
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 6, color: 'var(--text-muted)' }}>
              <Icon name="users" size={13} />Membres — un compte n'ayant qu'un seul projet ne verra que celui-ci
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {allUsers.map((u) => (
                <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, padding: '5px 10px', borderRadius: 999, border: '1px solid var(--border-soft)', cursor: 'pointer', background: form.memberIds.includes(u.id) ? 'var(--primary-soft)' : 'transparent' }}>
                  <input type="checkbox" checked={form.memberIds.includes(u.id)} onChange={() => toggleMember(u.id)} />
                  {u.name}
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <span className="btn-outline" onClick={() => setFormOpen(false)}>Annuler</span>
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Création…' : 'Créer le projet'}</button>
            </div>
          </form>
        </Modal>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
        {projects.length === 0 ? (
          <div className="card" style={{ gridColumn: '1/-1', padding: 30, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>
            {user?.role === 'admin' ? 'Aucun projet créé.' : "Vous n'êtes membre d'aucun projet — contactez un administrateur."}
          </div>
        ) : projects.map((p) => (
          <Link key={p.id} to={`/deployments/projects/${p.id}`} className="card" style={{ padding: 16, textDecoration: 'none', color: 'inherit', display: 'block' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700 }}>
                <Icon name="folder" size={15} style={{ color: 'var(--text-faint)' }} />{p.name}
              </span>
              <span className={`badge badge-${p.status === 'active' ? 'ok' : p.status === 'paused' ? 'warn' : 'mut'}`}><span className="dot" />{p.status}</span>
            </div>
            <p className="faint" style={{ fontSize: 12.5, minHeight: 32, margin: '0 0 10px' }}>{p.description || 'Aucune description'}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5, color: 'var(--text-faint)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="users" size={12} />{p.memberIds.length}</span>
              <span>·</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="gitBranch" size={12} />{p.repoKeys.length}</span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
