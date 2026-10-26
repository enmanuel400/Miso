import { useEffect, useState } from 'react';

/**
 * Tamano de pantalla con el que se elige la disposicion.
 *
 * Son tres y no dos porque la ficha tiene una forma distinta en cada uno: en el
 * escritorio el poster va en la cabecera y los capitulos debajo; en la tablet el
 * poster pasa al lado y los capitulos a un panel; en el movil no hay poster y
 * los capitulos se pliegan. Los cortes coinciden con los de `app.css` para que
 * la hoja de estilos y los componentes no discutan.
 */
export type Dispositivo = 'desktop' | 'tablet' | 'mobile';

const MOVIL = '(max-width: 620px)';
const TABLET = '(max-width: 900px)';

function leer(): Dispositivo {
  if (typeof window === 'undefined') return 'desktop';
  if (window.matchMedia(MOVIL).matches) return 'mobile';
  if (window.matchMedia(TABLET).matches) return 'tablet';
  return 'desktop';
}

export function useDispositivo(): Dispositivo {
  const [dispositivo, setDispositivo] = useState<Dispositivo>(leer);

  useEffect(() => {
    const movil = window.matchMedia(MOVIL);
    const tablet = window.matchMedia(TABLET);

    const actualizar = () => {
      setDispositivo(movil.matches ? 'mobile' : tablet.matches ? 'tablet' : 'desktop');
    };

    actualizar();
    movil.addEventListener('change', actualizar);
    tablet.addEventListener('change', actualizar);

    return () => {
      movil.removeEventListener('change', actualizar);
      tablet.removeEventListener('change', actualizar);
    };
  }, []);

  return dispositivo;
}
