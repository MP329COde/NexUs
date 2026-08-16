import { useEffect, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';

// Wiki d'équipe : pages de texte éditables par tout membre de l'organisation
// sélectionnée, avec historique des révisions (voir routes/wiki.routes.js).
// Contenu stocké réellement en base (contrairement au lien runbook des
// incidents, qui pointe volontairement vers une doc externe existante).
export default function WikiPage() {
  const { data: orgsData } = useApi(() => api.get('/organizations'), []);
  const organizations = orgsData?.items || [];
  const [orgId, setOrgId] = useState('');
  const notify = useNotify();

  useEffect(() => {
    if (!orgId && organizations.length > 0) setOrgId(organizations[0].id);
  }, [organizations, orgId]);

  const [q, setQ] = useState('');
  const pages = useApi(() => (orgId ? api.get(`/wiki?orgId=${orgId}${q ? `&q=${encodeURIComponent(q)}` : ''}`) : Promise.resolve({ items: [] })), [orgId, q]);
  const items = pages.data?.items || [];

  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [historyFor, setHistoryFor] = useState(null);

  useEffect(() => { setSelectedId(null); }, [orgId]);

  async function createPage(title) {
    try {
      const res = await api.post('/wiki', { orgId, title, content: '' });
      notify('Page créée', { type: 'ok' });
      setCreating(false);
      pages.reload();
      setSelectedId(res.page.id);
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  async function deletePage(id) {
    try {
      await api.del(`/wiki/${id}`);
      notify('Page supprimée', { type: 'ok' });
      if (selectedId === id) setSelectedId(null);
      pages.reload();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    }
  }

  return (
    <>
      <PageHeader
        title="Wiki d'équipe"
        sub="Base de connaissance partagée par organisation : procédures, décisions techniques, onboarding."
        actions={(
          <select className="input" value={orgId} onChange={(e) => setOrgId(e.target.value)} style={{ height: 32, fontSize: 12.5, width: 220 }}>
            {organizations.length === 0 && <option value="">Aucune organisation</option>}
            {organizations.map((o) => <option key={o.id} value={o.id}>{o.icon ? `${o.icon} ` : ''}{o.name}</option>)}
          </select>
        )}
      />

      {organizations.length === 0 ? (
        <div className="card" style={{ padding: 30, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>
          Aucune organisation — créez-en une dans Organisations pour démarrer un wiki.
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <Panel title="Pages" style={{ width: 260, flex: 'none' }} actions={(
            <span className="btn-outline" style={{ height: 26, padding: '0 9px', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setCreating(true)}>
              <Icon name="plus" size={12} />Nouvelle
            </span>
          )}>
            <div style={{ padding: '0 12px 10px' }}>
              <input className="input" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} style={{ height: 30, fontSize: 12.5, width: '100%' }} />
            </div>
            {items.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--text-faint)' }}>Aucune page</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 8px 8px' }}>
                {items.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    style={{
                      padding: '8px 10px', borderRadius: 8, fontSize: 12.5, cursor: 'pointer',
                      fontWeight: selectedId === p.id ? 600 : 500,
                      color: selectedId === p.id ? 'var(--primary)' : 'var(--text-muted)',
                      background: selectedId === p.id ? 'var(--primary-soft)' : 'transparent'
                    }}
                  >
                    {p.title}
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <div style={{ flex: 1, minWidth: 0 }}>
            {selectedId ? (
              <WikiPageDetail id={selectedId} onDeleted={() => deletePage(selectedId)} onHistory={() => setHistoryFor(selectedId)} onSaved={pages.reload} />
            ) : (
              <div className="card" style={{ padding: 40, textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>
                Sélectionnez une page, ou créez-en une nouvelle.
              </div>
            )}
          </div>
        </div>
      )}

      {creating && <CreatePageModal onCreate={createPage} onClose={() => setCreating(false)} />}
      {historyFor && <HistoryModal pageId={historyFor} onClose={() => setHistoryFor(null)} />}
    </>
  );
}

function CreatePageModal({ onCreate, onClose }) {
  const [title, setTitle] = useState('');
  return (
    <Modal title="Nouvelle page" onClose={onClose} width={420}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input className="input" placeholder="Titre de la page" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <span className="btn-outline" onClick={onClose}>Annuler</span>
          <button className="btn" disabled={!title.trim()} onClick={() => onCreate(title.trim())}>Créer</button>
        </div>
      </div>
    </Modal>
  );
}

function WikiPageDetail({ id, onDeleted, onHistory, onSaved }) {
  const { data, loading, error, reload } = useApi(() => api.get(`/wiki/${id}`), [id]);
  const notify = useNotify();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data?.page) { setTitle(data.page.title); setContent(data.page.content || ''); }
  }, [data]);

  async function save() {
    setBusy(true);
    try {
      await api.put(`/wiki/${id}`, { title, content });
      notify('Page enregistrée', { type: 'ok' });
      setEditing(false);
      reload();
      onSaved?.();
    } catch (err) {
      notify(err.message, { type: 'crit' });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="card faint" style={{ padding: 30, fontSize: 12.5 }}>Chargement…</div>;
  if (error) return <div className="card" style={{ padding: 30, fontSize: 12.5, color: 'var(--tone-crit-fg)' }}>{error}</div>;
  const page = data?.page;
  if (!page) return null;

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12 }}>
        {editing ? (
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} style={{ fontSize: 15, fontWeight: 700, flex: 1 }} />
        ) : (
          <div style={{ fontSize: 17, fontWeight: 700 }}>{page.title}</div>
        )}
        <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
          <span className="btn-outline" style={{ height: 28, padding: '0 10px', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 5 }} onClick={onHistory}>
            <Icon name="clock" size={12} />Historique
          </span>
          {editing ? (
            <>
              <span className="btn-outline" style={{ height: 28, padding: '0 10px', fontSize: 11.5, display: 'flex', alignItems: 'center' }} onClick={() => { setEditing(false); setTitle(page.title); setContent(page.content || ''); }}>Annuler</span>
              <button className="btn" style={{ height: 28, padding: '0 12px', fontSize: 11.5 }} disabled={busy || !title.trim()} onClick={save}>Enregistrer</button>
            </>
          ) : (
            <>
              <span className="btn-outline" style={{ height: 28, padding: '0 10px', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setEditing(true)}>
                <Icon name="edit" size={12} />Modifier
              </span>
              <span className="btn-outline" style={{ height: 28, padding: '0 10px', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 5, color: 'var(--tone-crit-fg)' }} onClick={onDeleted}>
                <Icon name="trash" size={12} />Supprimer
              </span>
            </>
          )}
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 14 }}>
        Modifiée le {new Date(page.updated_at).toLocaleString('fr-FR')}
      </div>
      {editing ? (
        <textarea
          className="input"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          style={{ width: '100%', minHeight: 340, fontSize: 13, lineHeight: 1.6, fontFamily: 'inherit', resize: 'vertical' }}
        />
      ) : (
        <div style={{ fontSize: 13.5, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
          {page.content || <span className="faint">Page vide — cliquez sur « Modifier » pour rédiger du contenu.</span>}
        </div>
      )}
    </div>
  );
}

function HistoryModal({ pageId, onClose }) {
  const { data, loading } = useApi(() => api.get(`/wiki/${pageId}/revisions`), [pageId]);
  const items = data?.items || [];
  return (
    <Modal title="Historique des modifications" onClose={onClose} width={480}>
      {loading && <div className="faint" style={{ fontSize: 12.5 }}>Chargement…</div>}
      {items.length === 0 && !loading && <div className="faint" style={{ fontSize: 12.5 }}>Aucune révision précédente — cette page n'a jamais été modifiée depuis sa création.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((r) => (
          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2, var(--bg))' }}>
            <span>{r.title}</span>
            <span className="faint">{new Date(r.edited_at).toLocaleString('fr-FR')}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
