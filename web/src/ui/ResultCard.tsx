import { useState } from 'react';
import { toggleFavorite, useLibrary } from '../lib/library.js';
import { fraccionVista } from '../lib/progress.js';
import type { TitleCard } from '../lib/types.js';
import { IconStar } from './Icons.js';

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
  const { favorites, history } = useLibrary();
  const favorito = favorites.some((f) => f.key === card.key);

  /**
   * Avance guardado, si este titulo esta a medias.
   *
   * El progreso vive en el historial, no en la tarjeta, porque la tarjeta es lo
   * que devuelve una busqueda y no sabe nada de lo que el usuario vio. Se busca
   * por la clave agrupada, que es la misma con la que se guardo.
   */
  const guardado = history.find((h) => h.key === card.key)?.progress ?? null;
  /** Fraccion 0..1, solo si se conoce la duracion: sin ella no hay barra honesta. */
  const avance = fraccionVista(guardado);

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

          {/*
           * Barra de avance: solo aparece si hay duracion conocida, porque una
           * barra sin denominador seria un adorno que miente sobre cuanto queda.
           * Va dentro del arte para que se lea sobre el cartel sin robar sitio al
           * texto de debajo.
           */}
          {avance !== null && (
            <span className="card-progress" aria-hidden="true">
              <span className="card-progress-fill" style={{ width: `${Math.round(avance * 100)}%` }} />
            </span>
          )}
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

      {/*
       * La estrella es HERMANA del boton de la tarjeta, no hija.
       *
       * Dentro habria dos `button` anidados —invalido— y el clic en la estrella
       * abriria ademas el titulo. Como hermana se coloca encima con `position` y
       * `stopPropagation` deja de hacer falta para lo mismo.
       */}
      <button
        type="button"
        className="card-fav"
        data-on={favorito || undefined}
        aria-pressed={favorito}
        aria-label={favorito ? 'Quitar de favoritos' : 'Añadir a favoritos'}
        title={favorito ? 'Quitar de favoritos' : 'Añadir a favoritos'}
        onClick={(e) => {
          e.stopPropagation();
          toggleFavorite(card);
        }}
      >
        <IconStar size={15} filled={favorito} />
      </button>
    </li>
  );
}
