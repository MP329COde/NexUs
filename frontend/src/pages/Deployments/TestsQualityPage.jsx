import PageHeader from '../../components/ui/PageHeader.jsx';
import Panel from '../../components/ui/Panel.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import MiniLineChart from '../../components/ui/MiniLineChart.jsx';
import DemoNote from '../../components/ui/DemoNote.jsx';
import { Link } from 'react-router-dom';

// Démonstration : aucun framework de tests (Jest/Vitest/pytest...) n'est
// intégré à la console. Cette page anticipe la mise en page une fois une
// telle intégration branchée — voir Pipelines CI/CD (réel) pour les
// exécutions de build/déploiement déjà suivies.
const COVERAGE_TREND = [61, 64, 60, 66, 58, 57, 63, 70, 66, 72, 75, 68, 60, 55, 52, 56, 58, 60, 65, 70, 78, 78, 73, 68, 66, 68, 70, 74, 75, 74, 78];

export default function TestsQualityPage() {
  return (
    <>
      <PageHeader title="Tests & qualité" sub="Résultats des suites de tests et évolution de la couverture." />
      <DemoNote>
        Aucune suite de tests n'est encore branchée à la console. Ces chiffres sont un jeu de démonstration pour valider la mise en page —
        cette page est pensée pour se nourrir des mêmes exécutions que <Link to="/deployments/pipelines">Pipelines CI/CD</Link> (déjà réel) une fois une étape "tests" identifiée dans vos pipelines.
      </DemoNote>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 16 }}>
        <KpiCard label="Tests exécutés 24h" value="12 480" tint="#3B82F6" />
        <KpiCard label="Échecs" value={14} tint="#F43F5E" />
        <KpiCard label="Couverture" value={78} unit="%" tint="#10B981" />
        <KpiCard label="Flaky" value={5} tint="#F59E0B" note="tests à stabiliser" />
      </div>

      <Panel title="Évolution de la couverture" sub="Moyenne pondérée sur 30 jours (démonstration)" span={12}>
        <div style={{ padding: '14px 16px' }}>
          <MiniLineChart values={COVERAGE_TREND} color="#3B82F6" />
        </div>
      </Panel>
    </>
  );
}
