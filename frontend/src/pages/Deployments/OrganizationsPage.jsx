import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

// Organisations : socle relationnel PostgreSQL (voir store/orgStore.js).
// GET /api/organizations ne liste que celles dont l'utilisateur est membre —
// pas de vue globale "toutes les organisations" ici, cohérent avec le reste
// de la plateforme (jamais de fuite d'existence d'une organisation dont on
// n'est pas membre).
export default function OrganizationsPage() {
  const { data, error, reload } = useApi(() => api.get('/organizations'), []);
  const notify = useNotify();
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [busy, setBusy] = useState(false);

  const organizations = data?.items || [];
  const configured = !error || !String(error).includes('DATABASE_URL');

  async function createOrg(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/organizations', { name, slug });
      notify(`${name} créée`, { type: 'ok' });
      setName('');
      setSlug('');
      setFormOpen(false);
      reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
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
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <span className="btn-outline" onClick={() => setFormOpen(false)}>Annuler</span>
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Création…' : 'Créer'}</button>
            </div>
          </form>
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
                <Icon name="users" size={15} style={{ color: 'var(--text-faint)' }} />{org.name}
              </span>
              <span className="badge badge-vio">{org.my_role}</span>
            </div>
            <p className="faint mono" style={{ fontSize: 12, margin: 0 }}>{org.slug}</p>
          </div>
        ))}
      </div>
    </>
  );
}
