/**
 * Marca de Miso.
 *
 * Un unico glifo: un triangulo de reproduccion (ver) y una chispa arriba a la
 * derecha (descubrir). Monocromo a proposito: hereda el color del contexto
 * (`currentColor`), asi que en la cabecera va en el acento dorado y, si algun
 * dia hace falta, en cualquier otro sitio sin tocar el componente.
 */

interface Props {
  size?: number;
  className?: string;
}

export function LogoMark({ size = 22, className }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="14.3 6.7 29.2 29.2"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M18.56 14.63 L34.5 24 L18.56 33.38 Z" fill="currentColor" />
      <path
        d="M36 9.19
           c0.34 2.25 0.94 2.85 3.19 3.19
           c-2.25 0.34 -2.85 0.94 -3.19 3.19
           c-0.34 -2.25 -0.94 -2.85 -3.19 -3.19
           c2.25 -0.34 2.85 -0.94 3.19 -3.19 Z"
        fill="currentColor"
      />
    </svg>
  );
}