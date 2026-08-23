const TONE_LABEL = { ok: 'OK', warn: 'Attention', crit: 'Critique', info: 'Info', mut: '—' };

// `entry.ok` n'est présent que lorsqu'une vérification live a réellement été
// effectuée (ex: /status/overview, ou après un clic sur "Tester la connexion").
// Certains appelants (page Paramètres > Intégrations & outils, GitServicesPanel)
// passent un objet qui ne contient QUE `configured` (lu depuis /settings, sans
// aucun appel réseau vers le service distant) : dans ce cas `entry.ok` vaut
// `undefined`, ce qui ne doit jamais être interprété comme un échec (rouge).
// Un badge rouge signifie désormais toujours "testé et en échec", jamais
// "configuré mais pas encore testé" — sinon toute intégration fraîchement
// configurée et fonctionnelle s'affichait en rouge tant qu'aucun test live
// n'avait été déclenché.
export function toneFromStatus(entry) {
  if (!entry || entry.configured === false) return 'mut';
  if (entry.ok === true) return 'ok';
  if (entry.ok === false) return 'crit';
  return 'mut';
}

export default function StatusBadge({ tone = 'mut', label }) {
  return (
    <span className={`badge badge-${tone}`}>
      <span className="dot" />
      {label ?? TONE_LABEL[tone]}
    </span>
  );
}
