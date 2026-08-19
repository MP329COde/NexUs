import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Icon from '../../components/ui/Icon.jsx';
import LoadingState from '../../components/ui/LoadingState.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';
import { useNotify } from '../../context/NotificationContext.jsx';
import './WikiPage.css';

// Wiki d'équipe : pages de texte éditables par tout membre de l'organisation,
// avec historique des révisions (voir routes/wiki.routes.js). Contenu stocké
// réellement en base (contrairement au lien runbook des incidents, qui
// pointe volontairement vers une doc externe existante). Rattaché au menu de
// l'organisation (voir OrganizationDetailPage.jsx) plutôt qu'à un sélecteur
// libre : le wiki appartient à une organisation précise, jamais consulté
// "hors contexte".
export default function WikiPage() {
  const { id: routeOrgId } = useParams();
  // Arrivée depuis la page d'un projet (voir ProjectDetailPage.jsx, panneau
  // Documentation) : ne montre que les pages rattachées à ce projet plutôt
  // que tout le wiki de l'organisation — reste désactivable ("Toutes les
  // pages") pour ne pas enfermer l'utilisateur dans ce filtre.
  const [searchParams, setSearchParams] = useSearchParams();
  const projectIdFilter = searchParams.get('projectId') || '';
  // Palier "équipe" (voir TeamMembersModal.jsx, bouton "Documentation
  // d'équipe") : même principe que projectIdFilter, mutuellement exclusif —
  // l'URL ne porte jamais les deux à la fois (voir clearFilter ci-dessous).
  const teamIdFilter = searchParams.get('teamId') || '';
  const { data: orgsData } = useApi(() => api.get('/organizations'), []);
  const organizations = orgsData?.items || [];
  const [orgId, setOrgId] = useState(routeOrgId || '');
  const currentOrg = organizations.find((o) => o.id === orgId);
  const teams = useApi(() => (teamIdFilter && orgId ? api.get(`/teams/org/${orgId}`) : Promise.resolve(null)), [teamIdFilter, orgId]);
  const currentTeam = (teams.data?.items || []).find((t) => t.id === teamIdFilter);
  const notify = useNotify();

  function clearFilter() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('projectId');
      next.delete('teamId');
      return next;
    });
  }

  useEffect(() => {
    if (routeOrgId) { setOrgId(routeOrgId); return; }
    if (!orgId && organizations.length > 0) setOrgId(organizations[0].id);
  }, [organizations, orgId, routeOrgId]);

  const [q, setQ] = useState('');
  const pages = useApi(() => (orgId ? api.get(`/wiki?orgId=${orgId}${projectIdFilter ? `&projectId=${projectIdFilter}` : ''}${teamIdFilter ? `&teamId=${teamIdFilter}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`) : Promise.resolve({ items: [] })), [orgId, q, projectIdFilter, teamIdFilter]);
  const items = pages.data?.items || [];

  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [historyFor, setHistoryFor] = useState(null);

  useEffect(() => { setSelectedId(null); }, [orgId]);

  async function createPage(title) {
    try {
      const res = await api.post('/wiki', { orgId, projectId: projectIdFilter || null, teamId: teamIdFilter || null, title, content: '' });
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
        breadcrumbs={[
          { label: 'Développement', to: '/deployments' },
          ...(currentOrg ? [{ label: currentOrg.name, to: `/deployments/organizations/${currentOrg.id}` }] : []),
          { label: teamIdFilter ? "Documentation d'équipe" : projectIdFilter ? 'Documentation de projet' : 'Documentation générale' }
        ]}
        title={teamIdFilter ? `Documentation d'équipe${currentTeam ? ` — ${currentTeam.name}` : ''}` : projectIdFilter ? 'Documentation de projet' : 'Documentation générale'}
        sub={routeOrgId ? `Organisation : ${currentOrg?.icon ? `${currentOrg.icon} ` : ''}${currentOrg?.name || '…'} — trois paliers : organisation, équipe, projet` : 'Base de connaissance partagée par organisation, équipe ou projet : procédures, décisions techniques, onboarding.'}
        actions={routeOrgId ? (
          <Link to={`/deployments/organizations/${routeOrgId}`} className="btn-outline wiki-org-select">← Retour à l'organisation</Link>
        ) : (
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
            {(projectIdFilter || teamIdFilter) && (
              <div className="wiki-project-filter">
                {projectIdFilter ? 'Documentation de projet' : `Documentation d'équipe${currentTeam ? ` — ${currentTeam.name}` : ''}`}
                <span className="wiki-project-filter-clear" onClick={clearFilter}>
                  Documentation générale
                </span>
              </div>
            )}
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

  if (loading) return <div className="card"><LoadingState className="wiki-detail-loading" /></div>;
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
      {loading && <LoadingState className="wiki-history-loading" />}
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
