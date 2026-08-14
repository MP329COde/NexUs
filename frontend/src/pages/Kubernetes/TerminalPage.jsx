import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/apiClient.js';

const VERB_HELP = {
  get: 'get pods|deployments|services [-n <namespace>]',
  logs: 'logs <pod> -n <namespace> [-c <conteneur>] [--tail 200]',
  describe: 'describe pod <nom> -n <namespace>',
  scale: 'scale deployment/<nom> --replicas=<n> -n <namespace>',
  restart: 'restart deployment/<nom> -n <namespace>',
  delete: 'delete pod/<nom> -n <namespace>',
  exec: 'exec <pod> -n <namespace> [-c <conteneur>] -- <commande>',
  apply: 'apply  (avec le manifest YAML/JSON dans le champ ci-dessous)'
};
const TIER_LABEL = { developer: 'Developer', maintainer: 'Maintainer', admin: 'Admin' };

// Terminal sécurisé : PAS un shell générique. Une grammaire de commandes
// kubectl-like fixe, routée côté serveur vers les mêmes fonctions que les
// boutons d'action des autres pages Kubernetes (voir terminalService.js) —
// jamais de commande arbitraire exécutée sur le serveur. Le palier
// (Developer/Maintainer/Admin) détermine les verbes disponibles ; un compte
// "user" sans palier assigné n'a par défaut aucun accès.
export default function TerminalPage() {
  const perms = useApi(() => api.get('/terminal/permissions'), []);
  const [searchParams, setSearchParams] = useSearchParams();
  const [command, setCommand] = useState(searchParams.get('prefill') || '');
  const [manifest, setManifest] = useState('');
  const [showManifest, setShowManifest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);
  const scrollRef = useRef(null);

  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight); }, [history]);
  useEffect(() => { if (searchParams.get('prefill')) setSearchParams({}, { replace: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tier = perms.data?.tier;
  const verbs = perms.data?.verbs || [];

  async function run(e) {
    e.preventDefault();
    if (!command.trim() || busy) return;
    setBusy(true);
    const entry = { command, manifest: command.trim() === 'apply' ? manifest : null, at: new Date().toISOString() };
    try {
      const res = await api.post('/terminal/run', { command, manifest: command.trim().startsWith('apply') ? manifest : undefined });
      entry.result = res.result;
    } catch (err) {
      entry.error = err.message;
    } finally {
      setHistory((h) => [...h, entry]);
      setCommand('');
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Terminal sécurisé"
        sub="Grammaire de commandes bornée — pas un shell : chaque verbe est routé vers l'API Kubernetes officielle, jamais vers le système."
        actions={tier && (
          <span className="badge badge-vio">
            <Icon name="shield" size={12} />Palier {TIER_LABEL[tier]}
          </span>
        )}
      />

      {!perms.loading && !tier && (
        <div className="card" style={{ padding: 30, textAlign: 'center' }}>
          <Icon name="lock" size={22} style={{ color: 'var(--text-faint)', marginBottom: 8 }} />
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Aucun accès au terminal</div>
          <div className="faint" style={{ fontSize: 12.5 }}>Demandez à un administrateur de vous attribuer un palier depuis Paramètres → Utilisateurs.</div>
        </div>
      )}

      {tier && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 16 }}>
          <Panel title="Session" sub={`Verbes autorisés : ${verbs.join(', ')}`} span={9}>
            <div ref={scrollRef} className="mono" style={{ height: 380, overflowY: 'auto', padding: 14, fontSize: 12, lineHeight: 1.7, background: 'var(--surface-2, var(--bg))' }}>
              {history.length === 0 && <div className="faint">Tapez une commande ci-dessous — {VERB_HELP[verbs[0]]}</div>}
              {history.map((h, i) => (
                <div key={i} style={{ marginBottom: 14 }}>
                  <div style={{ color: 'var(--primary)', fontWeight: 600 }}>$ {h.command}</div>
                  {h.error && <div style={{ color: 'var(--tone-crit-fg)', whiteSpace: 'pre-wrap' }}>{h.error}</div>}
                  {h.result && <ResultView result={h.result} />}
                </div>
              ))}
            </div>
            <form onSubmit={run} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderTop: '1px solid var(--border-soft)' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <span className="mono" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-faint)' }}>$</span>
                <input
                  className="input mono" autoFocus
                  value={command} onChange={(e) => setCommand(e.target.value)}
                  placeholder="get pods -n default"
                  style={{ flex: 1, fontSize: 12.5 }}
                />
                <button className="btn" type="submit" disabled={busy || !command.trim()}>{busy ? '…' : 'Exécuter'}</button>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, cursor: 'pointer' }}>
                <input type="checkbox" checked={showManifest} onChange={(e) => setShowManifest(e.target.checked)} />
                Joindre un manifest (pour "apply")
              </label>
              {showManifest && (
                <textarea
                  className="input mono"
                  value={manifest} onChange={(e) => setManifest(e.target.value)}
                  placeholder={'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: exemple\n  namespace: default\ndata:\n  cle: valeur'}
                  style={{ minHeight: 120, fontSize: 11.5, resize: 'vertical' }}
                />
              )}
            </form>
          </Panel>

          <Panel title="Aide-mémoire" sub="Syntaxe par verbe" span={3}>
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(VERB_HELP).map(([verb, syntax]) => (
                <div key={verb} style={{ opacity: verbs.includes(verb) ? 1 : .35 }}>
                  <div className="mono" style={{ fontSize: 11.5, fontWeight: 700 }}>{verb}</div>
                  <div className="mono faint" style={{ fontSize: 10.5 }}>{syntax}</div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}

function ResultView({ result }) {
  if (result.rows) {
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
        <tbody>
          {result.rows.length === 0 && <tr><td className="faint">(vide)</td></tr>}
          {result.rows.map((r, i) => (
            <tr key={i}>
              <td style={{ paddingRight: 12 }}>{Object.values(r).slice(0, 5).join('  ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (result.text !== undefined) {
    return <pre style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{result.text || '(vide)'}</pre>;
  }
  if (result.stdout !== undefined) {
    return (
      <div style={{ marginTop: 4 }}>
        {result.stdout && <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{result.stdout}</pre>}
        {result.stderr && <pre style={{ margin: 0, color: 'var(--tone-warn-fg)', whiteSpace: 'pre-wrap' }}>{result.stderr}</pre>}
        <div className="faint">status: {result.status}</div>
      </div>
    );
  }
  if (result.object) {
    return <pre style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{JSON.stringify(result.object, null, 2)}</pre>;
  }
  if (result.message) {
    return <div style={{ color: 'var(--tone-ok-fg)' }}>{result.message}</div>;
  }
  return <pre style={{ margin: '4px 0 0' }}>{JSON.stringify(result, null, 2)}</pre>;
}
