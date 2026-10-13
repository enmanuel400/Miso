import { useEffect, useRef, useState } from 'react';
import { ApiError, byGenre, genres as fetchGenres } from '../lib/api.js';
import { failedSources, mergeResults } from '../lib/merge.js';
import type { AggregatedSearch, Genre, TitleCard } from '../lib/types.js';
import { ResultCard } from './ResultCard.js';
import { SkeletonGrid } from './Skeletons.js';

/**
 * Pantalla de generos.
 *
 * Dos filas y un cuerpo. Arriba el catalogo entero —una sola vez, fijo— y debajo
 * lo que devuelve el genero elegido, federado igual que una busqueda. El estado
 * no se guarda entre visitas: volver a la pantalla reabre lo ultimo elegido con
 * la cache del servidor, que es mas barata que un estado propio que se queda
 * obsoleto.
 *
 * El catalogo lo sirve el servidor (`/api/genres`) y no esta escrito aqui. La
 * lista de generos es la misma para la federacion entera, y una copia local se
 * desincronizaria en cuanto una fuente estrene una taxonomia.
 */

interface Props {
  accentBySource: Record<string, string>;
  onOpen(card: TitleCard): void;
}

type Filtro = 'movie' | 'series' | 'anime' | null;

const FILTROS: { id: Filtro; label: string }[] = [
  { id: null, label: 'Todo' },
  { id: 'movie', label: 'Películas' },
  { id: 'series', label: 'Series' },
  { id: 'anime', label: 'Anime' },
];

export function GenresView({ accentBySource, onOpen }: Props) {
  const [catalogo, setCatalogo] = useState<Genre[]>([]);
  const [genero, setGenero] = useState<Genre | null>(null);
  const [filtro, setFiltro] = useState<Filtro>(null);
  const [data, setData] = useState<AggregatedSearch | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    let vivo = true;
    void fetchGenres()
      .then((r) => {
        if (vivo) setCatalogo(r.genres);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    if (!genero) {
      setData(null);
      return;
    }
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setCargando(true);
    setError(null);

    void (async () => {
      try {
        const r = await byGenre(genero, filtro, ctl.signal);
        if (ctl.signal.aborted) return;
        setData(r);
        setCargando(false);
      } catch (err) {
        if (ctl.signal.aborted) return;
        setError(err instanceof ApiError ? err.message : 'No se pudo cargar el género.');
        setCargando(false);
      }
    })();

    return () => ctl.abort();
  }, [genero, filtro]);

  const cards = data ? mergeResults(data.results) : [];
  const fallidas = data ? failedSources(data) : [];

  return (
    <div className="genres">
      <div className="genres-head">
        <h2 className="home-title">Géneros</h2>
        <p className="hint">
          Elige uno y Miso pregunta a todas las fuentes a la vez. Los títulos que aparecen en
          varias se agrupan en una sola tarjeta.
        </p>

        <div className="chips" role="group" aria-label="Géneros">
          {catalogo.map((g) => (
            <button
              key={g.slug}
              type="button"
              className="chip"
              data-active={genero?.slug === g.slug || undefined}
              aria-pressed={genero?.slug === g.slug}
              onClick={() => setGenero(g)}
            >
              {g.name}
            </button>
          ))}
        </div>
      </div>

      <div className="genres-body">
        {!genero && (
          <p className="hint">Todavía no has elegido un género. Toca uno de arriba para verlo.</p>
        )}

        {genero && (
          <>
            <div className="genres-toolbar">
              <h3 className="genres-titulo">{genero.name}</h3>
              <div className="segmented" role="group" aria-label="Filtrar por tipo">
                {FILTROS.map((f) => (
                  <button
                    key={f.label}
                    type="button"
                    className="segmented-btn"
                    data-active={filtro === f.id || undefined}
                    aria-pressed={filtro === f.id}
                    onClick={() => setFiltro(f.id)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {fallidas.map((f) => (
              <p className="warning" key={f.id}>
                <strong>{f.id}</strong>
                {f.message ? `: ${f.message}` : ' no respondió'}
                , así que no aporta a este género.
              </p>
            ))}

            {error && <p className="hint hint-error">{error}</p>}

            {cargando && cards.length === 0 && <SkeletonGrid />}

            {cards.length > 0 && (
              <ul className="grid">
                {cards.map((card, i) => (
                  <ResultCard
                    key={card.key}
                    card={card}
                    accentBySource={accentBySource}
                    onOpen={onOpen}
                    index={i}
                  />
                ))}
              </ul>
            )}

            {!cargando && !error && cards.length === 0 && (
              <p className="hint">Ninguna fuente tiene «{genero.name}» con este filtro.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
