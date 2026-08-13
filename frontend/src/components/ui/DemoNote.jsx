import Icon from './Icon.jsx';

// Bandeau explicite pour les pages qui n'ont pas (encore) de source de
// données réelle dans la console (aucune intégration Docker, registry
// d'images, framework de tests...). Les chiffres affichés sont un jeu de
// démonstration pour valider la mise en page — jamais présentés comme réels.
export default function DemoNote({ children }) {
  return (
    <div style={{ display: 'flex', gap: 9, padding: '10px 14px', borderRadius: 9, background: 'var(--tone-warn-soft, var(--primary-soft))', color: 'var(--tone-warn-fg)', fontSize: 12, marginBottom: 16 }}>
      <Icon name="info" size={15} style={{ flex: 'none', marginTop: 1 }} />
      <span>{children || "Données de démonstration : aucune intégration réelle ne fournit encore cette information. Mise en page à valider avant câblage."}</span>
    </div>
  );
}
