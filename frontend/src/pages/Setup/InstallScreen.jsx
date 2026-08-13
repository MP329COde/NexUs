import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/apiClient.js';
import BrandMark from '../../components/ui/BrandMark.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { DOMAINS } from '../../config/domains.js';

const STATUS_META = {
  connecting: { label: 'Connexion SSH…', color: '#F59E0B', icon: 'sync' },
  installing: { label: 'Installation…', color: '#2563EB', icon: 'sync' },
  success: { label: 'Installée', color: '#10B981', icon: 'check' },
  error: { label: 'Échec', color: '#BE123C', icon: 'xCircle' }
};

// Écran affiché après la création de l'administrateur quand au moins un outil
// a été marqué « Installer automatiquement » à l'étape 5. Vue scindée : à
// gauche le suivi (approbation implicite déjà donnée en cochant la case, puis
// progression) des jobs d'installation lancés côté backend (services SSH sur
// la clé unique de la console — voir services/provisioningService.js) ; à
// droite une présentation de la plateforme pour patienter utilement pendant
// que l'installation tourne en tâche de fond.
export default function InstallScreen({ tools, onFinish }) {
  const [jobs, setJobs] = useState(() => tools.map((t) => ({ toolId: t.id, label: t.label, address: t.address, status: 'connecting', message: null, id: null })));
  const [launchError, setLaunchError] = useState(null);
  const pollRef = useRef(null);
  const launchedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function launch() {
      // Verrou explicite (indépendant du nettoyage d'effet) : en StrictMode,
      // React monte/démonte/remonte cet effet une fois en développement, ce
      // qui déclencherait deux installations réelles pour le même outil côté
      // backend si on ne se fiait qu'au flag `cancelled`.
      if (launchedRef.current) return;
      launchedRef.current = true;
      try {
        const res = await api.post('/setup/provision', {
          tools: tools.map((t) => ({ toolId: t.id, address: t.address, port: t.port, sshUser: t.sshUser }))
        });
        if (cancelled) return;
        const started = res.jobs;
        setJobs((prev) => prev.map((j, i) => ({ ...j, ...started[i] })));

        const ids = started.map((j) => j.id).filter(Boolean);
        if (ids.length === 0) return;

        pollRef.current = setInterval(async () => {
          try {
            const statusRes = await api.get(`/setup/provision/status?ids=${ids.join(',')}`);
            if (cancelled) return;
            // Fusionné (et non remplacé) : les jobs renvoyés par le backend ne
            // portent pas `label`, propre à l'affichage côté assistant.
            setJobs((prev) => prev.map((j) => {
              const fresh = statusRes.jobs.find((s) => s.id === j.id);
              return fresh ? { ...j, ...fresh } : j;
            }));
            const allDone = statusRes.jobs.every((j) => j.status === 'success' || j.status === 'error');
            if (allDone) clearInterval(pollRef.current);
          } catch {
            clearInterval(pollRef.current);
          }
        }, 1500);
      } catch (err) {
        if (!cancelled) setLaunchError(err.message);
      }
    }

    launch();
    return () => { cancelled = true; if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allSettled = jobs.every((j) => j.status === 'success' || j.status === 'error');
  const successCount = jobs.filter((j) => j.status === 'success').length;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#0B1120', color: '#E7ECF5' }}>
      <section style={{ width: '46%', flex: 'none', display: 'flex', flexDirection: 'column', padding: '32px 40px', borderRight: '1px solid #1A2338' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <BrandMark size={28} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>Nexus Console</span>
        </div>

        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Installation des outils</h1>
        <p style={{ margin: '6px 0 24px', fontSize: 12.5, color: '#6B7A9C' }}>
          Déploiement via la clé SSH de la console — aucun mot de passe transmis. Vous pouvez ouvrir la
          console dès maintenant, l'installation continue en tâche de fond.
        </p>

        {launchError && (
          <div style={{ fontSize: 12.5, color: '#FDA4AF', background: '#3F1725', border: '1px solid #6B2333', borderRadius: 8, padding: '10px 12px', marginBottom: 16 }}>
            {launchError}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, overflowY: 'auto' }}>
          {jobs.map((job) => {
            const meta = STATUS_META[job.status] || STATUS_META.connecting;
            return (
              <div key={job.toolId} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 8, background: '#111A2E', border: '1px solid #1A2338' }}>
                <span style={{ color: meta.color, marginTop: 1 }}>
                  <Icon name={meta.icon} size={16} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600 }}>{job.label}</span>
                    <span style={{ fontSize: 11, color: meta.color, flex: 'none' }}>{meta.label}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#6B7A9C' }}>{job.address}</div>
                  {job.message && <div style={{ fontSize: 11, color: job.status === 'error' ? '#FDA4AF' : '#6B7A9C', marginTop: 2 }}>{job.message}</div>}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #1A2338', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11.5, color: '#6B7A9C' }}>
            {allSettled ? `${successCount}/${jobs.length} installations réussies` : 'Installation en cours…'}
          </span>
          <button type="button" className="btn" onClick={onFinish}>
            {allSettled ? 'Ouvrir la console' : 'Continuer en arrière-plan'}
          </button>
        </div>
      </section>

      <section style={{ flex: 1, padding: '48px 56px', display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: 720 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: '#5B7CFA', textTransform: 'uppercase', marginBottom: 10 }}>
          Pendant que ça s'installe
        </div>
        <h2 style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>Le centre de contrôle de votre infrastructure</h2>
        <p style={{ margin: '10px 0 28px', fontSize: 13.5, color: '#9AA7C7', lineHeight: 1.6 }}>
          Une fois ouverte, la console réunit chaque domaine de votre homelab derrière une seule
          interface. Chaque outil connecté ci-contre alimente automatiquement la page correspondante.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {DOMAINS.filter((d) => !d.adminOnly).map((d) => (
            <div key={d.id} style={{ display: 'flex', gap: 10, padding: 14, borderRadius: 10, background: '#111A2E', border: '1px solid #1A2338' }}>
              <span style={{
                width: 30, height: 30, borderRadius: 8, background: '#1B2542', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#7C93E0', flex: 'none'
              }}>
                {d.code}
              </span>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{d.label}</div>
                <div style={{ fontSize: 11, color: '#6B7A9C' }}>{d.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
