import { useState } from 'react';
import { clearHistory, forgetHistory, useLibrary } from '../lib/library.js';
import type { SavedTitle, TitleCard } from '../lib/types.js';
import { IconClose } from './Icons.js';
import { ResultCard } from './ResultCard.js';

/**
 * Pantalla de guardados.
 *
 * La misma vista dibuja favoritos e historial porque comparten todo: leer el
 * almacen del cliente, encabezado, vacio. Lo unico distinto es el cuerpo
 * —rejilla en favoritos, lista cronologica en historial— y eso decide un solo
 * `if`.
 *
 * El historial como LISTA y no como rejilla es deliberado: su valor es el orden
 * ("estaba viendo esto ayer"), y una rejilla de carteles no dice cuando. La
 * insignia de fuente sigue en cada fila, que es el requisito de la aplicacion.
 */

interface Props {
  tipo: 'favoritos' | 'historial';
  accentBySource: Record<string, string>;
  onOpen(card: TitleCard): void;
}

function hace(ms: number): string {
  const seg = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (seg < 60) return 'ahora';
  const min = Math.round(seg / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d < 7) return `hace ${d} d`;
  const sem = Math.round(d / 7);
  if (sem < 5) return `hace ${sem} sem`;
  const mes = Math.round(d / 30);
  if (mes < 12) return `hace ${mes} ${mes === 1 ? 'mes' : 'meses'}`;
  const anio = Math.round(d / 365);
  return `hace ${anio} ${anio === 1 ? 'año' : 'años'}`;
}

function tipoLabel(card: TitleCard): string {
  if (card.kind === 'series') return 'Serie';
  if (card.kind === 'anime') return 'Anime';
  return 'Película';
}

function Poster({ card }: { card: TitleCard }) {
  const [fallo, setFallo] = useState(false);
  if (!card.poster || fallo) {
    return (
      <span className="hist-fallback" aria-hidden="true">
        {card.title.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      className="hist-img"
      src={`/api/img?u=${encodeURIComponent(card.poster)}`}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFallo(true)}
    />
  );
}

export function LibraryView({ tipo, accentBySource, onOpen }: Props) {
  const { history, favorites } = useLibrary();
  const [confirmando, setConfirmando] = useState(false);

  return (
    <div className="library">
      <div className="library-head">
        <h2 className="home-title">{tipo === 'favoritos' ? 'Favoritos' : 'Historial'}</h2>
        <p className="hint">
          {tipo === 'favoritos'
            ? 'Lo que has marcado con la estrella. Se guarda en este equipo.'
            : 'Lo último que has abierto, en orden. Se guarda en este equipo.'}
        </p>

        {tipo === 'historial' && history.length > 0 && (
          <div className="library-actions">
            {confirmando ? (
              <>
                <span className="library-confirm">Se borrará entero.</span>
                <button
                  type="button"
                  className="ghost-btn danger"
                  onClick={() => {
                    clearHistory();
                    setConfirmando(false);
                  }}
                >
                  Sí, vaciar
                </button>
                <button type="button" className="ghost-btn" onClick={() => setConfirmando(false)}>
                  Cancelar
                </button>
              </>
            ) : (
              <button type="button" className="ghost-btn" onClick={() => setConfirmando(true)}>
                Vaciar historial
              </button>
            )}
          </div>
        )}
      </div>

      <div className="library-body">
        {tipo === 'favoritos' && favorites.length === 0 && (
          <p className="hint">
            Todavía no hay favoritos. Toca la estrella de cualquier título para guardarlo aquí.
          </p>
        )}

        {tipo === 'favoritos' && favorites.length > 0 && (
          <ul className="grid">
            {favorites.map((f, i) => (
              <ResultCard
                key={f.key}
                card={f.card}
                accentBySource={accentBySource}
                onOpen={onOpen}
                index={i}
              />
            ))}
          </ul>
        )}

        {tipo === 'historial' && history.length === 0 && (
          <p className="hint">Todavía no has abierto nada. Lo que veas aparecerá aquí.</p>
        )}

        {tipo === 'historial' && history.length > 0 && (
          <ul className="hist">
            {history.map((s: SavedTitle) => (
              <li className="hist-item" key={s.key}>
                <button type="button" className="hist-open" onClick={() => onOpen(s.card)}>
                  <span className="hist-art">
                    <Poster card={s.card} />
                  </span>
                  <span className="hist-text">
                    <span className="hist-title">{s.card.title}</span>
                    <span className="hist-sub">
                      {tipoLabel(s.card)}
                      {s.card.year ? ` · ${s.card.year}` : ''}
                      {s.last ? ` · T${s.last.season}E${s.last.episode}` : ''}
                    </span>
                  </span>
                  <span className="hist-when">{hace(s.at)}</span>
                </button>
                <button
                  type="button"
                  className="hist-del"
                  aria-label={`Quitar ${s.card.title} del historial`}
                  title="Quitar del historial"
                  onClick={() => forgetHistory(s.key)}
                >
                  <IconClose size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
