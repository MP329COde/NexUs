import { useEffect, useRef, useState } from 'react';

const CLOSE_ANIM_MS = 130;

// Gère un popover (menu déroulant) : fermeture au clic extérieur, à Échap,
// et un état `closing` à utiliser pour jouer une animation de sortie avant
// le démontage réel (au lieu d'une disparition instantanée).
export function useClosablePopover(open, setOpen) {
  const ref = useRef(null);
  const [closing, setClosing] = useState(false);

  function close() {
    setClosing(true);
    setTimeout(() => { setOpen(false); setClosing(false); }, CLOSE_ANIM_MS);
  }

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(e) {
      if (ref.current && !ref.current.contains(e.target)) close();
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return { ref, closing, close, visible: open || closing };
}
