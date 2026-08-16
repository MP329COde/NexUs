import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

const ORG_EMOJIS = ['🏢', '🚀', '⚙️', '🛰️', '🔧', '🧩', '🗄️', '🌐', '🔥', '🧠', '🛡️', '📊'];
const ORG_COLORS = ['#2563EB', '#8B5CF6', '#10B981', '#F59E0B', '#F43F5E', '#0EA5E9', '#EC4899', '#475569'];

// Organisations : socle relationnel PostgreSQL (voir store/orgStore.js).
// GET /api/organizations ne liste que celles dont l'utilisateur est membre —
// pas de vue globale "toutes les organisations" ici, cohérent avec le reste
// de la plateforme (jamais de fuite d'existence d'une organisation dont on
// n'est pas membre). Icône/couleur personnalisées comme pour les projets.
export default function OrganizationsPage() {
  const { data, error, reload } = useApi(() => api.get('/organizations'), []);
  const notify = useNotify();
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [icon, setIcon] = useState('');
  const [color, setColor] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);

  const organizations = data?.items || [];
  const configured = !error || !String(error).includes('DATABASE_URL');

  async function createOrg(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/organizations', { name, slug, icon: icon || undefined, color: color || undefined });
      notify(`${name} créée`, { type: 'ok' });
      setName('');
      setSlug('');
      setIcon('');
      setColor('');
      setFormOpen(false);
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(org, patch) {
    try {
      await api.put(`/organizations/${org.id}`, patch);
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  if (!configured) {
    return (
      <>
        <PageHeader title="Organisations" sub="Socle relationnel des projets, équipes et environnements" />
        <div className="card" style={{ padding: 30, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>
          Socle relationnel non configuré sur cette instance (variable d'environnement <code>DATABASE_URL</code> absente
          côté backend) — voir README, section « Socle relationnel ».
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Organisations"
        sub="Regroupe équipes, projets et environnements — vous ne voyez que celles dont vous êtes membre"
        actions={(
          <button className="btn" onClick={() => setFormOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Icon name="plus" size={14} />Nouvelle organisation
          </button>
        )}
      />

      {formOpen && (
        <Modal title="Nouvelle organisation" onClose={() => setFormOpen(false)} width={420}>
          <form onSubmit={createOrg} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 5, color: 'var(--text-muted)' }}>Nom</label>
              <input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Mon équipe" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 5, color: 'var(--text-muted)' }}>Identifiant (URL, minuscules/tirets)</label>
              <input className="input" required pattern="[a-z0-9-]+" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="mon-equipe" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 6, color: 'var(--text-muted)' }}>Icône (optionnel)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ORG_EMOJIS.map((e) => (
                  <span
                    key={e} onClick={() => setIcon(e === icon ? '' : e)}
                    style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, cursor: 'pointer', fontSize: 14, background: e === icon ? 'var(--primary-soft)' : 'var(--border-soft)', border: e === icon ? '1px solid var(--primary)' : '1px solid transparent' }}
                  >{e}</span>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {ORG_COLORS.map((c) => (
                <span
                  key={c} onClick={() => setColor(c)}
                  style={{ width: 20, height: 20, borderRadius: '50%', background: c, cursor: 'pointer', boxShadow: c === color ? '0 0 0 2px var(--surface), 0 0 0 4px var(--primary)' : 'none' }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <span className="btn-outline" onClick={() => setFormOpen(false)}>Annuler</span>
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Création…' : 'Créer'}</button>
            </div>
          </form>
        </Modal>
      )}

      {editing && (
        <Modal title={`Modifier "${editing.name}"`} onClose={() => setEditing(null)} width={380}>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 6, color: 'var(--text-muted)' }}>Icône</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {ORG_EMOJIS.map((e) => (
                <span
                  key={e}
                  onClick={() => saveEdit(editing, { icon: e === editing.icon ? '' : e }).then(() => setEditing((prev) => ({ ...prev, icon: e === prev.icon ? '' : e })))}
                  style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, cursor: 'pointer', fontSize: 14, background: e === editing.icon ? 'var(--primary-soft)' : 'var(--border-soft)', border: e === editing.icon ? '1px solid var(--primary)' : '1px solid transparent' }}
                >{e}</span>
              ))}
            </div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 6, color: 'var(--text-muted)' }}>Couleur</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {ORG_COLORS.map((c) => (
                <span
                  key={c}
                  onClick={() => saveEdit(editing, { color: c }).then(() => setEditing((prev) => ({ ...prev, color: c })))}
                  style={{ width: 20, height: 20, borderRadius: '50%', background: c, cursor: 'pointer', boxShadow: c === editing.color ? '0 0 0 2px var(--surface), 0 0 0 4px var(--primary)' : 'none' }}
                />
              ))}
            </div>
          </div>
        </Modal>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16 }}>
        {organizations.length === 0 ? (
          <div className="card" style={{ gridColumn: '1/-1', padding: 30, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>
            Vous n'êtes membre d'aucune organisation. Les projets créés en créent automatiquement une par défaut.
          </div>
        ) : organizations.map((org) => (
          <div key={org.id} className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700 }}>
                {org.icon ? (
                  <span style={{ width: 22, height: 22, borderRadius: 6, background: org.color || 'var(--border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flex: 'none' }}>{org.icon}</span>
                ) : (
                  <Icon name="users" size={15} style={{ color: org.color || 'var(--text-faint)' }} />
                )}
                {org.name}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="badge badge-vio">{org.my_role}</span>
                {(org.my_role === 'owner' || org.my_role === 'admin') && (
                  <span className="btn-outline" style={{ height: 24, padding: '0 8px', fontSize: 11, cursor: 'pointer' }} onClick={() => setEditing(org)}>
                    <Icon name="edit" size={12} />
                  </span>
                )}
              </span>
            </div>
            <p className="faint mono" style={{ fontSize: 12, margin: 0 }}>{org.slug}</p>
          </div>
        ))}
      </div>
    </>
  );
}
