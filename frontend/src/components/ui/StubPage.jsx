import PageHeader from './PageHeader.jsx';
import EmptyState from './EmptyState.jsx';

// Emplacement réservé pour un domaine pas encore développé : garde la navigation
// cohérente avec la structure cible sans imposer un module vide inutile.
export default function StubPage({ title, sub }) {
  return (
    <>
      <PageHeader title={title} sub={sub} />
      <div className="card">
        <EmptyState title="Module à venir" hint="Cet espace de la console sera développé lors d'une prochaine itération, sans modification de l'architecture existante." />
      </div>
    </>
  );
}
