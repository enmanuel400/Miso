import type { SVGProps } from 'react';

/**
 * Iconos de la aplicacion.
 *
 * Viven juntos y no repartidos por cada componente porque comparten trazo: un
 * `strokeWidth` de 1.6 y las mismas puntas redondeadas. Dibujarlos por separado
 * es como empiezan a desalinearse los grosores.
 *
 * Todos son de 24x24 y escalan con `size`, que es lo unico que cambia entre la
 * navegacion (16) y los botones de accion (15).
 */

type Props = SVGProps<SVGSVGElement> & { size?: number };

function baseProps(size: number): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };
}

export function IconHome({ size = 16, ...rest }: Props) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6 9.5V20h12V9.5" />
    </svg>
  );
}

/** Generos: una rejilla de bloques, no un corazon ni una etiqueta. */
export function IconGenres({ size = 16, ...rest }: Props) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <rect x="4" y="4" width="7" height="7" rx="1.4" />
      <rect x="13" y="4" width="7" height="7" rx="1.4" />
      <rect x="4" y="13" width="7" height="7" rx="1.4" />
      <rect x="13" y="13" width="7" height="7" rx="1.4" />
    </svg>
  );
}

export function IconHistory({ size = 16, ...rest }: Props) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
      <path d="M4 4v3.2h3.2" />
      <path d="M12 8.4V12l2.6 1.6" />
    </svg>
  );
}

export function IconStar({ size = 16, filled = false, ...rest }: Props & { filled?: boolean }) {
  return (
    <svg {...baseProps(size)} {...rest} fill={filled ? 'currentColor' : 'none'}>
      <path d="M12 3.7l2.63 5.33 5.87.86-4.25 4.14 1 5.85L12 17.9l-5.25 2.76 1-5.85-4.25-4.14 5.87-.86z" />
    </svg>
  );
}

/** Ajustes: un engranaje, el simbolo que todos reconocen como configuracion. */
export function IconSettings({ size = 16, ...rest }: Props) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/** Lupa: la entrada al buscador desde el riel y la cabecera del movil. */
export function IconSearch({ size = 16, ...rest }: Props) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <circle cx="11" cy="11" r="6.4" />
      <path d="M15.8 15.8 20 20" />
    </svg>
  );
}

export function IconClose({ size = 15, ...rest }: Props) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
