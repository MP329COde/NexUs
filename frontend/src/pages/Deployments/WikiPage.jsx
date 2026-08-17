import { useEffect, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import './WikiPage.css';

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
          <select className="input wiki-org-select" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            {organizations.length === 0 && <option value="">Aucune organisation</option>}
            {organizations.map((o) => <option key={o.id} value={o.id}>{o.icon ? `${o.icon} ` : ''}{o.name}</option>)}
          </select>
        )}
      />

      {organizations.length === 0 ? (
        <div className="card wiki-no-org">
          Aucune organisation — créez-en une dans Organisations pour démarrer un wiki.
        </div>
      ) : (
        <div className="wiki-layout">
          <Panel title="Pages" style={{ width: 260, flex: 'none' }} actions={(
            <span className="btn-outline wiki-sidebar-new-btn" onClick={() => setCreating(true)}>
              <Icon name="plus" size={12} />Nouvelle
            </span>
          )}>
            <div className="wiki-search-wrap">
              <input className="input wiki-search-input" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {items.length === 0 ? (
              <div className="wiki-pages-empty">Aucune page</div>
            ) : (
              <div className="wiki-pages-list">
                {items.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    className={`wiki-page-item${selectedId === p.id ? ' wiki-page-item-active' : ''}`}
                  >
                    {p.title}
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <div className="wiki-detail-wrap">
            {selectedId ? (
              <WikiPageDetail id={selectedId} onDeleted={() => deletePage(selectedId)} onHistory={() => setHistoryFor(selectedId)} onSaved={pages.reload} />
            ) : (
              <div className="card wiki-detail-empty">
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
      <div className="wiki-modal-form">
        <input className="input" placeholder="Titre de la page" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <div className="wiki-modal-actions">
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

  if (loading) return <div className="card faint wiki-detail-loading">Chargement…</div>;
  if (error) return <div className="card wiki-detail-error">{error}</div>;
  const page = data?.page;
  if (!page) return null;

  return (
    <div className="card wiki-detail-card">
      <div className="wiki-detail-header">
        {editing ? (
          <input className="input wiki-title-input" value={title} onChange={(e) => setTitle(e.target.value)} />
        ) : (
          <div className="wiki-title-display">{page.title}</div>
        )}
        <div className="wiki-detail-actions">
          <span className="btn-outline wiki-detail-action-btn" onClick={onHistory}>
            <Icon name="clock" size={12} />Historique
          </span>
          {editing ? (
            <>
              <span className="btn-outline wiki-detail-action-btn-plain" onClick={() => { setEditing(false); setTitle(page.title); setContent(page.content || ''); }}>Annuler</span>
              <button className="btn wiki-detail-save-btn" disabled={busy || !title.trim()} onClick={save}>Enregistrer</button>
            </>
          ) : (
            <>
              <span className="btn-outline wiki-detail-action-btn" onClick={() => setEditing(true)}>
                <Icon name="edit" size={12} />Modifier
              </span>
              <span className="btn-outline wiki-detail-action-btn wiki-detail-danger" onClick={onDeleted}>
                <Icon name="trash" size={12} />Supprimer
              </span>
            </>
          )}
        </div>
      </div>
      <div className="wiki-detail-meta">
        Modifiée le {new Date(page.updated_at).toLocaleString('fr-FR')}
      </div>
      {editing ? (
        <textarea
          className="input wiki-detail-textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      ) : (
        <div className="wiki-detail-content">
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
      {loading && <div className="faint wiki-history-loading">Chargement…</div>}
      {items.length === 0 && !loading && <div className="faint wiki-history-empty">Aucune révision précédente — cette page n'a jamais été modifiée depuis sa création.</div>}
      <div className="wiki-history-list">
        {items.map((r) => (
          <div key={r.id} className="wiki-history-row">
            <span>{r.title}</span>
            <span className="faint">{new Date(r.edited_at).toLocaleString('fr-FR')}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
