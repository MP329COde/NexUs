import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/apiClient.js';
import BrandMark from '../../components/ui/BrandMark.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { DOMAINS } from '../../config/domains.js';
import './InstallScreen.css';

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
    <div className="install-screen">
      <section className="install-jobs-col">
        <div className="install-brand-row">
          <BrandMark size={28} />
          <span className="install-brand-name">Nexus Console</span>
        </div>

        <h1 className="install-title">Installation des outils</h1>
        <p className="install-intro">
          Déploiement via la clé SSH de la console — aucun mot de passe transmis. Vous pouvez ouvrir la
          console dès maintenant, l'installation continue en tâche de fond.
        </p>

        {launchError && (
          <div className="install-launch-error">
            {launchError}
          </div>
        )}

        <div className="install-jobs-list">
          {jobs.map((job) => {
            const meta = STATUS_META[job.status] || STATUS_META.connecting;
            return (
              <div key={job.toolId} className="install-job-card">
                <span className="install-job-icon" style={{ color: meta.color }}>
                  <Icon name={meta.icon} size={16} />
                </span>
                <div className="install-job-body">
                  <div className="install-job-head">
                    <span className="install-job-label">{job.label}</span>
                    <span className="install-job-status" style={{ color: meta.color }}>{meta.label}</span>
                  </div>
                  <div className="install-job-address">{job.address}</div>
                  {job.message && <div className={`install-job-message${job.status === 'error' ? ' install-job-message-error' : ''}`}>{job.message}</div>}
                </div>
              </div>
            );
          })}
        </div>

        <div className="install-footer">
          <span className="install-footer-status">
            {allSettled ? `${successCount}/${jobs.length} installations réussies` : 'Installation en cours…'}
          </span>
          <button type="button" className="btn" onClick={onFinish}>
            {allSettled ? 'Ouvrir la console' : 'Continuer en arrière-plan'}
          </button>
        </div>
      </section>

      <section className="install-showcase-col">
        <div className="install-showcase-eyebrow">
          Pendant que ça s'installe
        </div>
        <h2 className="install-showcase-title">Le centre de contrôle de votre infrastructure</h2>
        <p className="install-showcase-desc">
          Une fois ouverte, la console réunit chaque domaine de votre homelab derrière une seule
          interface. Chaque outil connecté ci-contre alimente automatiquement la page correspondante.
        </p>

        <div className="install-domains-grid">
          {DOMAINS.filter((d) => !d.adminOnly).map((d) => (
            <div key={d.id} className="install-domain-card">
              <span className="install-domain-badge">
                {d.code}
              </span>
              <div>
                <div className="install-domain-label">{d.label}</div>
                <div className="install-domain-sub">{d.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
