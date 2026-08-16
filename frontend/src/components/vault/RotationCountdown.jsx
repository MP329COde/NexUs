import { useEffect, useRef, useState } from 'react';

// Compte à rebours avant la prochaine rotation automatique du secret —
// purement d'affichage, la rotation réelle est décidée côté serveur
// (services/vaultRotationService.js) ; ce composant se contente de refléter
// `rotatesAt` et d'appeler `onDue` une seule fois l'échéance atteinte pour
// déclencher un re-fetch silencieux (tant que le panneau reste ouvert).
export default function RotationCountdown({ rotatesAt, onDue }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, new Date(rotatesAt).getTime() - Date.now()));
  const firedRef = useRef(false);
  // `onDue` est recréée à chaque rendu du parent (fonction fléchée inline) —
  // si elle figurait dans les deps de l'effet ci-dessous, chaque rendu
  // déclenché par le silent refresh relancerait l'effet, retrouverait
  // `remaining` déjà à 0 (avant que le serveur ait eu le temps de renvoyer
  // la nouvelle échéance) et rappellerait onDue en boucle. Une ref évite
  // cette dépendance tout en appelant toujours la version la plus récente.
  const onDueRef = useRef(onDue);
  onDueRef.current = onDue;

  useEffect(() => {
    firedRef.current = false;
    const tick = () => {
      const left = Math.max(0, new Date(rotatesAt).getTime() - Date.now());
      setRemaining(left);
      if (left === 0 && !firedRef.current) {
        firedRef.current = true;
        onDueRef.current();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [rotatesAt]);

  if (!rotatesAt) return null;
  const s = Math.ceil(remaining / 1000);
  const label = s <= 0 ? 'rotation en cours…' : `renouvellement dans ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return <span className="faint mono" style={{ fontSize: 10.5, marginLeft: 8 }}>{label}</span>;
}
