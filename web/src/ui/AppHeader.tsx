import type { ComponentType } from 'react';
import { LogoMark } from './Logo.js';
import { IconGenres, IconHistory, IconHome, IconSearch, IconSettings, IconStar } from './Icons.js';

/**
 * Cabecera unica de la aplicacion.
 *
 * Estaba dentro de la busqueda, con la marca y el campo a la misma altura. Al
 * aparecer tres pantallas mas, la marca y la navegacion tienen que ser de todas
 * y no de la primera: de lo contrario cada vista nueva repetiria el logotipo y
 * habria cuatro sitios donde olvidarse de actualizarlo.
 *
 * En escritorio y tablet es un riel de iconos que se abre al pasar el cursor; en
 * el movil vuelve a ser una fila, que es donde no cabe una columna fija.
 */

export type Seccion = 'inicio' | 'generos' | 'favoritos' | 'historial' | 'ajustes';

interface Props {
  seccion: Seccion;
  onSeccion(seccion: Seccion): void;
  /** Lleva al inicio y deja el campo de busqueda listo para escribir. */
  onBuscar(): void;
}

const ITEMS: { id: Seccion; label: string; Icono: ComponentType<{ size?: number }> }[] = [
  { id: 'inicio', label: 'Inicio', Icono: IconHome },
  { id: 'generos', label: 'Géneros', Icono: IconGenres },
  { id: 'favoritos', label: 'Favoritos', Icono: IconStar },
  { id: 'historial', label: 'Historial', Icono: IconHistory },
  { id: 'ajustes', label: 'Ajustes', Icono: IconSettings },
];

export function AppHeader({ seccion, onSeccion, onBuscar }: Props) {
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

      <button
        type="button"
        className="apphead-search"
        onClick={onBuscar}
        title="Buscar"
        aria-label="Buscar"
      >
        <IconSearch size={15} />
        <span>Buscar</span>
      </button>
    </header>
  );
}
