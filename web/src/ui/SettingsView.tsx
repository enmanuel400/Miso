import { useState } from 'react';
import { ApiError, setSource } from '../lib/api.js';
import type { SourceInfo } from '../lib/types.js';

/**
 * Pantalla de ajustes.
 *
 * De momento solo deja elegir en que fuentes busca la aplicacion. El estado vive
 * en el servidor, no aqui: al tocar un interruptor se guarda y la respuesta con
 * el catalogo actualizado vuelve por `onChange`. Asi, si algo falla al guardar,
 * la interfaz no miente: solo se pinta lo que el servidor confirmo.
 *
 * La ultima fuente activa no se puede apagar. El servidor tambien lo rechaza
 * (409), pero deshabilitar el control evita el viaje que ya sabemos que falla.
 */

interface Props {
  sources: SourceInfo[];
  onChange(sources: SourceInfo[]): void;
}

export function SettingsView({ sources, onChange }: Props) {
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activas = sources.filter((s) => s.enabled).length;

  async function alternar(source: SourceInfo): Promise<void> {
    if (ocupada) return;
    setError(null);
    setOcupada(source.id);
    try {
      const r = await setSource(source.id, !source.enabled);
      onChange(r.sources);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el ajuste.');
    } finally {
      setOcupada(null);
    }
  }

  return (
    <div className="ajustes">
      <div className="ajustes-head">
        <h2 className="home-title">Ajustes</h2>
        <p className="hint">
          Elige en qué fuentes busca Miso. Lo que desactives deja de aparecer en el inicio, en las
          búsquedas y en los géneros. Tu historial y tus favoritos no se tocan.
        </p>
      </div>

      <div className="ajustes-body">
        <h3 className="ajustes-titulo">
          Fuentes <span className="ajustes-cuenta">{activas} de {sources.length} activas</span>
        </h3>

        <ul className="ajustes-lista">
          {sources.map((source) => {
            const ultima = source.enabled && activas === 1;
            return (
              <li key={source.id} className="ajuste">
                <span className="ajuste-punto" style={{ background: source.accent }} aria-hidden />
                <span className="ajuste-texto">
                  <span className="ajuste-label">{source.label}</span>
                  <span className="ajuste-id">{source.id}</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  className="switch"
                  data-on={source.enabled || undefined}
                  aria-checked={source.enabled}
                  aria-label={`${source.enabled ? 'Desactivar' : 'Activar'} ${source.label}`}
                  disabled={ultima || ocupada === source.id}
                  title={ultima ? 'Tiene que quedar al menos una fuente activa' : undefined}
                  onClick={() => void alternar(source)}
                >
                  <span className="switch-pin" />
                </button>
              </li>
            );
          })}
        </ul>

        {error && <p className="hint hint-error">{error}</p>}
      </div>
    </div>
  );
}
