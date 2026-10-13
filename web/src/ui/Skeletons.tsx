/**
 * Esqueletos de carga.
 *
 * Mantienen la rejilla en su sitio mientras llegan los resultados. Sin ellos, el
 * contenido salta de una vez que responde la fuente mas rapida y el resto empuja
 * la pantalla hacia abajo cuando llegan las demas.
 *
 * Viven en un archivo propio y no dentro de una vista porque los usan tres (la
 * busqueda, el genero y las que listan guardados), y una copia por vista es como
 * empiezan a verse distintos.
 */
export function SkeletonGrid({ n = 10 }: { n?: number }) {
  return (
    <ul className="grid" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <li key={i} className="card card-skeleton" style={{ animationDelay: `${i * 40}ms` }}>
          <div className="card-art" />
        </li>
      ))}
    </ul>
  );
}
