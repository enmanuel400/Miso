import { useMemo, useState, type ComponentType } from 'react';
import { IconGenres, IconHistory, IconHome, IconSettings, IconStar } from '../ui/Icons.js';
import { LogoMark } from '../ui/Logo.js';
import {
  ARMAZON_POR_DEFECTO,
  SECCIONES,
  jsonDeArmazon,
  type ArmazonDisposicion,
  type ArmazonDisposiciones,
  type Device,
  type SeccionDisposicion,
  type SeccionId,
} from './types.js';
import {
  Bloque,
  Deslizador,
  ExportarJson,
  Interruptor,
  LabTop,
  Segmentado,
} from './ui.js';

/**
 * Laboratorio del armazon.
 *
 * Dibuja un simulacro del armazon real (cabecera, buscador, filas de tarjetas y
 * barra inferior) con las clases CSS de la aplicacion, para que lo que se ve
 * aqui sea lo que se va a implementar. El panel de la derecha cambia la
 * disposicion; el JSON de salida es el contrato con la implementacion.
 *
 * No carga datos ni usa la biblioteca: doce tarjetas de mentira bastan para
 * juzgar tamano, separacion y orden, y evitan que el laboratorio dependa de que
 * las fuentes respondan.
 */

const TITULOS = [
  'Sobrenatural',
  'Duna: Parte dos',
  'Rick y Morty',
  'The Last of Us',
  'Arcane',
  'Naruto',
  'Chernobyl',
  'El Padrino',
  'Breaking Bad',
  'Stranger Things',
  'The Batman',
  'Interstellar',
];

const TINTES = ['#24211a', '#1b2126', '#251b20', '#1a2420', '#211d27', '#262219'];

const NAV: { label: string; Icono: ComponentType<{ size?: number }> }[] = [
  { label: 'Inicio', Icono: IconHome },
  { label: 'Géneros', Icono: IconGenres },
  { label: 'Favoritos', Icono: IconStar },
  { label: 'Historial', Icono: IconHistory },
  { label: 'Ajustes', Icono: IconSettings },
];

const NOTAS: Record<SeccionId, string[]> = {
  continuar: [
    'T2E5 · quedan 25 min',
    'T1E1 · quedan 1 h 12 min',
    'T4E9 · quedan 8 min',
    'T3E2 · quedan 41 min',
  ],
  novedades: ['T15E20 · estreno', 'T2E3 · estreno', 'Nuevo', 'T1E6 · estreno'],
  resultados: [],
};

function clonar(): ArmazonDisposiciones {
  return JSON.parse(JSON.stringify(ARMAZON_POR_DEFECTO)) as ArmazonDisposiciones;
}

export function LabArmazon() {
  const [device, setDevice] = useState<Device>('desktop');
  const [layouts, setLayouts] = useState<ArmazonDisposiciones>(clonar);
  const [arrastrando, setArrastrando] = useState<SeccionId | null>(null);

  const config = layouts[device];

  const patch = (parcial: Partial<ArmazonDisposicion>) => {
    setLayouts((prev) => ({ ...prev, [device]: { ...prev[device], ...parcial } }));
  };

  const patchSeccion = (id: SeccionId, parcial: Partial<SeccionDisposicion>) => {
    setLayouts((prev) => ({
      ...prev,
      [device]: {
        ...prev[device],
        secciones: prev[device].secciones.map((s) => (s.id === id ? { ...s, ...parcial } : s)),
      },
    }));
  };

  const mover = (id: SeccionId, direccion: -1 | 1) => {
    const actual = config.secciones;
    const desde = actual.findIndex((s) => s.id === id);
    const hasta = desde + direccion;
    if (desde < 0 || hasta < 0 || hasta >= actual.length) return;
    const siguiente = [...actual];
    const [bloque] = siguiente.splice(desde, 1);
    siguiente.splice(hasta, 0, bloque);
    patch({ secciones: siguiente });
  };

  const soltar = (destino: SeccionId) => {
    if (!arrastrando || arrastrando === destino) return;
    const siguiente = [...config.secciones];
    const desde = siguiente.findIndex((s) => s.id === arrastrando);
    const hasta = siguiente.findIndex((s) => s.id === destino);
    if (desde < 0 || hasta < 0) return;
    const [bloque] = siguiente.splice(desde, 1);
    siguiente.splice(hasta, 0, bloque);
    patch({ secciones: siguiente });
    setArrastrando(null);
  };

  const json = useMemo(() => jsonDeArmazon(layouts), [layouts]);

  return (
    <div className="lab">
      <LabTop
        titulo="Disposición del armazón"
        subtitulo="Inicio, Géneros, Favoritos, Historial y Ajustes comparten esta estructura. La pantalla de reproducción se edita en el otro laboratorio."
        device={device}
        onDevice={setDevice}
        otro={{ href: '/lab/player', label: 'Ir al laboratorio de reproducción →' }}
        onReset={() => setLayouts(clonar())}
      />

      <div className="lab-cuerpo">
        <div className="lab-escenario">
          <VistaArmazon config={config} device={device} />
          <p className="lab-pie">
            Simulacro a escala real con las clases de la aplicación. Los carteles son de relleno:
            aquí se juzga la estructura, no el contenido.
          </p>
        </div>

        <aside className="lab-panel">
          <Bloque
            titulo="Armazón"
            descripcion="Lo que comparten todas las secciones. Los colores y la tipografía no se tocan."
          >
            <Segmentado
              label="Cabecera"
              value={config.cabecera}
              options={[
                { value: 'arriba', label: 'Arriba' },
                {
                  value: 'lateral',
                  label: 'Lateral',
                  disabled: device === 'mobile',
                  title: 'En móvil la cabecera va arriba',
                },
              ]}
              onChange={(cabecera) => patch({ cabecera })}
            />
            <Segmentado
              label="Buscador"
              value={config.buscador}
              options={[
                { value: 'cabecera', label: 'En la cabecera' },
                { value: 'fila', label: 'Fila propia' },
                { value: 'icono', label: 'Icono' },
              ]}
              onChange={(buscador) => patch({ buscador })}
            />
            <Segmentado
              label="Barra inferior"
              value={config.barraInferior}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'siempre', label: 'Siempre' },
                { value: 'oculta', label: 'Oculta' },
              ]}
              onChange={(barraInferior) => patch({ barraInferior })}
            />
            <Deslizador
              label="Ancho del contenido"
              value={config.anchoContenido}
              min={0}
              max={1440}
              step={40}
              sufijo={config.anchoContenido === 0 ? ' (completo)' : ' px'}
              onChange={(anchoContenido) => patch({ anchoContenido })}
            />
          </Bloque>

          <Bloque
            titulo="Secciones y tarjetas"
            descripcion="Arrastra un bloque para cambiar el orden. El formato, el tamaño y la separación se aplican solo a ese bloque."
          >
            <ol className="lab-bloques">
              {config.secciones.map((s, i) => {
                const meta = SECCIONES.find((m) => m.id === s.id)!;
                return (
                  <li
                    key={s.id}
                    className="lab-bloque-seccion"
                    draggable
                    data-arrastrando={arrastrando === s.id || undefined}
                    onDragStart={() => setArrastrando(s.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => soltar(s.id)}
                    onDragEnd={() => setArrastrando(null)}
                  >
                    <div className="lab-bloque-head">
                      <span className="lab-grip" aria-hidden="true">
                        ⠿
                      </span>
                      <strong>{meta.label}</strong>
                      <div className="lab-orden">
                        <button
                          type="button"
                          aria-label={`Subir ${meta.label}`}
                          disabled={i === 0}
                          onClick={() => mover(s.id, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          aria-label={`Bajar ${meta.label}`}
                          disabled={i === config.secciones.length - 1}
                          onClick={() => mover(s.id, 1)}
                        >
                          ↓
                        </button>
                      </div>
                    </div>

                    <Interruptor
                      label="Visible"
                      checked={s.visible}
                      onChange={(visible) => patchSeccion(s.id, { visible })}
                    />

                    <div className="lab-bloque-controles" data-apagado={!s.visible || undefined}>
                      <Segmentado
                        label="Formato"
                        value={s.formato}
                        options={[
                          { value: 'rejilla', label: 'Rejilla' },
                          { value: 'fila', label: 'Fila' },
                        ]}
                        onChange={(formato) => patchSeccion(s.id, { formato })}
                      />
                      <Deslizador
                        label="Tamaño de tarjeta"
                        value={s.tamano}
                        min={110}
                        max={260}
                        step={4}
                        onChange={(tamano) => patchSeccion(s.id, { tamano })}
                      />
                      <Deslizador
                        label="Separación"
                        value={s.separacion}
                        min={6}
                        max={36}
                        step={2}
                        onChange={(separacion) => patchSeccion(s.id, { separacion })}
                      />
                      <Deslizador
                        label="Cantidad"
                        value={s.cantidad}
                        min={2}
                        max={20}
                        sufijo=" tarjetas"
                        onChange={(cantidad) => patchSeccion(s.id, { cantidad })}
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
          </Bloque>

          <ExportarJson nombre="miso-armazon" json={json} />
        </aside>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Simulacro
// ----------------------------------------------------------------------

function VistaArmazon({ config, device }: { config: ArmazonDisposicion; device: Device }) {
  const cabecera = device === 'mobile' ? 'arriba' : config.cabecera;
  const barra =
    config.barraInferior === 'siempre' ||
    (config.barraInferior === 'auto' && device !== 'mobile');

  return (
    <div className="lab-frame" data-device={device}>
      <div className="lab-shell" data-head={cabecera}>
        {cabecera === 'arriba' ? (
          <header className="apphead lab-apphead">
            <Marca />
            {config.buscador === 'cabecera' && <Buscador />}
            {config.buscador === 'icono' && <BotonBuscar />}
            {navHorizontal()}
          </header>
        ) : (
          <aside className="lab-side">
            <Marca />
            {navVertical()}
            {config.buscador === 'icono' && <BotonBuscar />}
          </aside>
        )}

        <div
          className="lab-content"
          style={
            config.anchoContenido > 0
              ? { maxWidth: `${config.anchoContenido}px`, margin: '0 auto', width: '100%' }
              : undefined
          }
        >
          {config.buscador === 'fila' && (
            <div className="lab-fila-buscar">
              <Buscador />
            </div>
          )}
          {config.buscador === 'icono' && (
            <p className="lab-icono-nota">El buscador se abre desde el icono de la cabecera.</p>
          )}

          <div className="lab-scroll">
            {config.secciones.map((s) => (
              <SeccionVista key={s.id} seccion={s} />
            ))}
          </div>
        </div>

        {barra && (
          <footer className="bottombar lab-bottombar">
            <span className="bottombar-state" data-state="en-funcionamiento">
              <span className="bottombar-dot" aria-hidden="true" />
              Servidor en marcha
            </span>
            <span className="lab-bottombar-action">Detener servidor</span>
          </footer>
        )}
      </div>
    </div>
  );
}

function Marca() {
  return (
    <span className="lab-marca">
      <LogoMark className="brand-mark" />
      <span className="wordmark">Miso</span>
    </span>
  );
}

function navHorizontal() {
  return (
    <nav className="appnav lab-nav" aria-hidden="true">
      {NAV.map(({ label, Icono }, i) => (
        <span key={label} className="appnav-btn" data-active={i === 0 || undefined}>
          <Icono size={15} />
          <span>{label}</span>
        </span>
      ))}
    </nav>
  );
}

function navVertical() {
  return (
    <nav className="lab-nav-lateral" aria-hidden="true">
      {NAV.map(({ label, Icono }, i) => (
        <span key={label} className="appnav-btn" data-active={i === 0 || undefined}>
          <Icono size={15} />
          <span>{label}</span>
        </span>
      ))}
    </nav>
  );
}

function Buscador() {
  return (
    <div className="searchbar lab-buscador">
      <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M11 11l3.4 3.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <input readOnly placeholder="Busca una película en 5 fuentes" aria-label="Buscar" />
    </div>
  );
}

function BotonBuscar() {
  return (
    <span className="lab-search-icon" aria-hidden="true">
      <svg width="15" height="15" viewBox="0 0 16 16">
        <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M11 11l3.4 3.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function SeccionVista({ seccion }: { seccion: SeccionDisposicion }) {
  if (!seccion.visible) return null;
  const meta = SECCIONES.find((m) => m.id === seccion.id)!;
  const notas = NOTAS[seccion.id];
  const indices = Array.from({ length: seccion.cantidad }, (_, i) => i);

  return (
    <section className="lab-seccion">
      <h2 className="home-title">{meta.label}</h2>
      {seccion.id === 'novedades' && (
        <p className="hint lab-hint-inline">
          Estrenos y últimos capítulos de <strong>sololatino</strong>, <strong>cuevana</strong> y{' '}
          <strong>pelisplushd</strong>.
        </p>
      )}

      {seccion.formato === 'rejilla' ? (
        <ul
          className="grid"
          style={{
            gridTemplateColumns: `repeat(auto-fill, minmax(${seccion.tamano}px, 1fr))`,
            gap: `${seccion.separacion}px`,
          }}
        >
          {indices.map((i) => (
            <Tarjeta key={i} indice={i} nota={notas[i % notas.length]} />
          ))}
        </ul>
      ) : (
        <ul className="lab-fila" style={{ gap: `${seccion.separacion}px` }}>
          {indices.map((i) => (
            <Tarjeta key={i} indice={i} nota={notas[i % notas.length]} tamano={seccion.tamano} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Tarjeta({ indice, nota, tamano }: { indice: number; nota?: string; tamano?: number }) {
  const titulo = TITULOS[indice % TITULOS.length];
  const tinte = TINTES[indice % TINTES.length];
  const serie = indice % 2 === 0;

  return (
    <li className="card" style={tamano ? { flex: `0 0 ${tamano}px` } : undefined}>
      <div className="card-button">
        <div className="card-art">
          <div
            className="card-fallback"
            style={{ background: `linear-gradient(155deg, ${tinte}, #101014)` }}
          >
            <span>{titulo.charAt(0)}</span>
          </div>
          <span className="card-badges">
            <span className="card-badge" style={{ ['--accent' as string]: '#c9a227' }}>
              sololatino
            </span>
          </span>
          {indice % 3 === 0 && (
            <span className="card-progress" aria-hidden="true">
              <span
                className="card-progress-fill"
                style={{ width: `${28 + (indice % 4) * 17}%` }}
              />
            </span>
          )}
        </div>
        <div className="card-meta">
          <h3 className="card-title">{titulo}</h3>
          <p className="card-facts">
            {serie ? 'Serie' : 'Película'}
            {serie && <span className="card-rating">8.4</span>}
          </p>
          {nota && <p className="card-note">{nota}</p>}
        </div>
      </div>
    </li>
  );
}
