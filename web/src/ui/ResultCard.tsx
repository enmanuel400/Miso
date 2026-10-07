import { useState } from 'react';
import type { TitleCard } from '../lib/types.js';

/**
 * Tarjeta de resultado.
 *
 * Hereda la direccion elegida ("Sala"): el poster ES la tarjeta, sin caja, sin
 * borde y sin sombra. La profundidad la da unicamente el degradado inferior,
 * que existe para que el texto se lea sobre cualquier imagen y no solo sobre las
 * oscuras.
 *
 * Un cambio respecto al prototipo: ahora una tarjeta puede traer VARIAS
 * insignias de fuente, porque los titulos repetidos se agrupan. Se apilan en la
 * esquina y, a partir de la tercera, se resume en un contador: cuatro insignias
 * taparian el cartel sin aportar mas informacion.
 *
 * Hay una insignia por fuente, no por entrada, aunque la tarjeta agrupe tres
 * capitulos de una misma serie. Repetir el mismo nombre tres veces no es mas
 * informacion y desplaza a las demas fuentes fuera del hueco.
 */

interface Props {
  card: TitleCard;
  accentBySource: Record<string, string>;
  onOpen(card: TitleCard): void;
  /** Posicion en la rejilla, solo para escalonar la entrada. */
  index: number;
}

/** Numero maximo de insignias antes de resumir el resto. */
const MAX_BADGES = 2;

/**
 * Escalonado de la entrada.
 *
 * Se topa el retardo: con veinte resultados, la ultima tarjeta entrando a los
 * 560 ms se percibe como lentitud y no como ritmo. A partir del tope, todas
 * entran juntas.
 */
const STAGGER_CAP = 12;

export function ResultCard({ card, accentBySource, onOpen, index }: Props) {
  const [posterFailed, setPosterFailed] = useState(false);

  /*
   * Una insignia por FUENTE, no por entrada.
   *
   * Se agrupaba sobre `entries`, y en el inicio eso es un problema: una serie con
   * tres capitulos recientes trae tres entradas de la MISMA fuente, y la tarjeta
   * pintaba "cuevana" tres veces. No era informacion: era el mismo dato repetido,
   * y ademas empujaba a la segunda insignia real fuera del hueco que hay. El
   * numero de capitulos ya lo dice la nota ("3 capitulos nuevos"); el nombre de la
   * fuente tiene que decir de donde viene, una vez.
   */
  const fuentes = [...new Set(card.entries.map((e) => e.source))];
  const shown = fuentes.slice(0, MAX_BADGES);
  const hidden = fuentes.length - shown.length;

  return (
    <li className="card" style={{ animationDelay: `${Math.min(index, STAGGER_CAP) * 28}ms` }}>
      <button type="button" className="card-button" onClick={() => onOpen(card)}>
        <div className="card-art">
          {card.poster && !posterFailed ? (
            <img
              className="card-img"
              src={`/api/img?u=${encodeURIComponent(card.poster)}`}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setPosterFailed(true)}
            />
          ) : (
            <div className="card-fallback" aria-hidden="true">
              <span>{card.title.charAt(0).toUpperCase()}</span>
            </div>
          )}

          {/* Las insignias de fuente son el requisito de fondo de todo esto: sin
              ellas la pantalla seria un catalogo anonimo. */}
          <span className="card-badges">
            {shown.map((id) => {
              const deEsta = card.entries.find((e) => e.source === id)!;
              return (
                <span
                  key={id}
                  className="card-badge"
                  style={{ ['--accent' as string]: accentBySource[id] ?? '#8d8983' }}
                >
                  {deEsta.sourceLabel}
                </span>
              );
            })}
            {hidden > 0 && <span className="card-badge card-badge-more">+{hidden}</span>}
          </span>

          <span className="card-play" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
            </svg>
          </span>
        </div>

        <div className="card-meta">
          <h3 className="card-title">{card.title}</h3>
          <p className="card-facts">
            {card.kind === 'series' ? 'Serie' : card.kind === 'anime' ? 'Anime' : card.year ?? 'Película'}
            {card.rating && <span className="card-rating">{card.rating}</span>}
          </p>
          {/*
           * La nota solo aparece en el inicio, y es lo que explica por que esta
           * tarjeta esta aqui: "T9E9 · Saluda a tus Morts" en un capitulo que se
           * acaba de emitir, "Estreno" en una pelicula. En la busqueda es null y
           * no ocupa sitio, porque ahi el titulo ya se explica solo.
           */}
          {card.note && <p className="card-note">{card.note}</p>}
        </div>
      </button>
    </li>
  );
}
