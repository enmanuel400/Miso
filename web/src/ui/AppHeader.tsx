import type { ComponentType } from 'react';
import { LogoMark } from './Logo.js';
import { IconGenres, IconHistory, IconHome, IconStar } from './Icons.js';

/**
 * Cabecera unica de la aplicacion.
 *
 * Estaba dentro de la busqueda, con la marca y el campo a la misma altura. Al
 * aparecer tres pantallas mas, la marca y la navegacion tienen que ser de todas
 * y no de la primera: de lo contrario cada vista nueva repetiria el logotipo y
 * habria cuatro sitios donde olvidarse de actualizarlo.
 */

export type Seccion = 'inicio' | 'generos' | 'favoritos' | 'historial';

interface Props {
  seccion: Seccion;
  onSeccion(seccion: Seccion): void;
}

const ITEMS: { id: Seccion; label: string; Icono: ComponentType<{ size?: number }> }[] = [
  { id: 'inicio', label: 'Inicio', Icono: IconHome },
  { id: 'generos', label: 'Géneros', Icono: IconGenres },
  { id: 'favoritos', label: 'Favoritos', Icono: IconStar },
  { id: 'historial', label: 'Historial', Icono: IconHistory },
];

export function AppHeader({ seccion, onSeccion }: Props) {
  return (
    <header className="apphead">
      <button
        type="button"
        className="apphead-brand"
        onClick={() => onSeccion('inicio')}
        aria-label="Miso, ir al inicio"
      >
        <LogoMark className="brand-mark" />
        <span className="wordmark">Miso</span>
      </button>

      <nav className="appnav" aria-label="Secciones">
        {ITEMS.map(({ id, label, Icono }) => (
          <button
            key={id}
            type="button"
            className="appnav-btn"
            data-active={seccion === id || undefined}
            aria-current={seccion === id ? 'page' : undefined}
            onClick={() => onSeccion(id)}
          >
            <Icono size={15} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </header>
  );
}
