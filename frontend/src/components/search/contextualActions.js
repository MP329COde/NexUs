// Actions contextuelles du Command Center : chaque type de ressource définit
// sa propre liste, exécutée en naviguant vers sa page avec des paramètres
// d'URL que celle-ci lit au montage pour ouvrir directement le bon dialogue
// ou déclencher la bonne action (voir KubernetesPage.jsx). Aucune action
// n'est effectuée depuis la palette elle-même : elle reste un point d'entrée
// vers le contexte réel de la page, pas un shell parallèle.
export function contextLabel(context) {
  if (!context) return null;
  if (context.type === 'pod') return `Pod : ${context.name}`;
  if (context.type === 'deployment') return `Deployment : ${context.name}`;
  return null;
}

export function contextualActions(context, navigate, closePalette) {
  if (!context) return [];

  function go(url) {
    return () => { closePalette(); navigate(url); };
  }

  if (context.type === 'pod') {
    const base = `/kubernetes?ns=${encodeURIComponent(context.namespace)}&pod=${encodeURIComponent(context.name)}`;
    return [
      { label: 'Voir les logs', icon: 'terminal', run: go(`${base}&open=logs`) },
      { label: 'Redémarrer (supprimer le pod)', icon: 'refresh', tone: 'warn', run: go(`${base}&open=restart`) },
      { label: 'Décrire', icon: 'terminal', run: go(`${base}&open=describe`) },
      { label: 'Voir le Deployment et les Services', icon: 'box', run: go(`${base}&open=owners`) },
      { label: 'Voir les événements', icon: 'event', run: go(`${base}&open=events`) },
      { label: 'Voir les métriques', icon: 'gauge', run: go(`${base}&open=metrics`) }
    ];
  }

  if (context.type === 'deployment') {
    const base = `/kubernetes?ns=${encodeURIComponent(context.namespace)}&deploy=${encodeURIComponent(context.name)}`;
    return [
      { label: 'Redémarrer (rolling restart)', icon: 'refresh', run: go(`${base}&open=restart`) },
      { label: 'Mettre à l\'échelle', icon: 'layers', run: go(`${base}&open=scale`) },
      { label: 'Revenir à la révision précédente', icon: 'refresh', tone: 'crit', run: go(`${base}&open=rollback`) },
      { label: 'Purger tous les pods', icon: 'trash', tone: 'crit', run: go(`${base}&open=purge`) }
    ];
  }

  return [];
}
