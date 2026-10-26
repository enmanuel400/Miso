import { useMemo, useState, type CSSProperties } from 'react';
import {
  REPRODUCTOR_POR_DEFECTO,
  jsonDeReproductor,
  type Device,
  type ReproductorDisposicion,
  type ReproductorDisposiciones,
} from './types.js';
import {
  Bloque,
  Deslizador,
  ExportarJson,
  LabTop,
  Segmentado,
} from './ui.js';

/**
 * Laboratorio de la pantalla de reproduccion.
 *
 * Es una pagina aparte de `/lab` a proposito: el armazon y la ficha no
 * comparten estructura ni se editan a la vez. Aqui se decide donde van el
 * reproductor, el poster, la informacion, los capitulos y los avisos.
 */

const EPISODIOS = [
  'En el principio',
  'Formas extrañas',
  'Sangre fresca',
  'El final del camino',
  'Simetría',
  'Un mundo mejor',
  'La gran evasión',
  'El precio',
];

function clonar(): ReproductorDisposiciones {
  return JSON.parse(JSON.stringify(REPRODUCTOR_POR_DEFECTO)) as ReproductorDisposiciones;
}

export function LabReproductor() {
  const [device, setDevice] = useState<Device>('desktop');
  const [layouts, setLayouts] = useState<ReproductorDisposiciones>(clonar);

  const config = layouts[device];

  const patch = (parcial: Partial<ReproductorDisposicion>) => {
    setLayouts((prev) => {
      const actual = prev[device];
      const siguiente = { ...actual, ...parcial };

      // El panel y la lista de capitulos son dos controles que describen el
      // mismo hueco. Se mantienen coherentes aqui para que no exista un estado
      // en el que los capitulos no se pintan en ningun sitio.
      if (parcial.panel === 'capitulos') {
        siguiente.capitulos = 'panel';
      } else if (parcial.panel && actual.capitulos === 'panel') {
        siguiente.capitulos = 'debajo';
      }

      if (parcial.capitulos === 'panel') {
        siguiente.panel = 'capitulos';
      } else if (parcial.capitulos && actual.panel === 'capitulos') {
        siguiente.panel = 'ninguno';
      }

      return { ...prev, [device]: siguiente };
    });
  };

  const json = useMemo(() => jsonDeReproductor(layouts), [layouts]);

  return (
    <div className="lab">
      <LabTop
        titulo="Disposición de la reproducción"
        subtitulo="Ficha y reproductor de series y películas. El armazón del inicio se edita en el otro laboratorio."
        device={device}
        onDevice={setDevice}
        otro={{ href: '/lab', label: '← Ir al laboratorio del armazón' }}
        onReset={() => setLayouts(clonar())}
      />

      <div className="lab-cuerpo">
        <div className="lab-escenario">
          <VistaReproductor config={config} device={device} />
          <p className="lab-pie">
            El reproductor y las tarjetas son un simulacro: lo que se decide aquí es qué ocupa cada
            zona de la ficha.
          </p>
        </div>

        <aside className="lab-panel">
          <Bloque
            titulo="Reproductor y ficha"
            descripcion="La ficha es la pantalla que aparece al abrir un título. Los avisos son los de «reanudado» y «siguiente capítulo»."
          >
            <Segmentado
              label="Orden"
              value={config.orden ?? 'reproductor-arriba'}
              options={[
                { value: 'reproductor-arriba', label: 'Reproductor arriba' },
                { value: 'info-arriba', label: 'Poster + info arriba' },
              ]}
              onChange={(orden) => patch({ orden: orden as ReproductorDisposicion['orden'] })}
            />
            <Segmentado
              label="Ancho del reproductor"
              value={config.reproductor}
              options={[
                { value: 'contenido', label: 'Dentro del contenido' },
                { value: 'ancho', label: 'Ancho completo' },
              ]}
              onChange={(reproductor) => patch({ reproductor })}
            />
            <Segmentado
              label="Póster"
              value={config.poster}
              options={[
                { value: 'lateral', label: 'Lateral' },
                { value: 'cabecera', label: 'Cabecera' },
                { value: 'oculto', label: 'Sin póster' },
              ]}
              onChange={(poster) => patch({ poster })}
            />
            <Segmentado
              label="Acciones (favorito, visto)"
              value={config.acciones}
              options={[
                { value: 'titulo', label: 'Junto al título' },
                { value: 'debajo', label: 'Bajo el reproductor' },
              ]}
              onChange={(acciones) => patch({ acciones })}
            />
            <Segmentado
              label="Avisos"
              value={config.avisos}
              options={[
                { value: 'esquina', label: 'Esquina' },
                { value: 'arriba', label: 'Arriba' },
                { value: 'centro', label: 'Centro' },
              ]}
              onChange={(avisos) => patch({ avisos })}
            />
            <Deslizador
              label="Ancho máximo de la ficha"
              value={config.ancho}
              min={720}
              max={1600}
              step={20}
              onChange={(ancho) => patch({ ancho })}
            />
            <Deslizador
              label="Separación entre bloques"
              value={config.separacion}
              min={10}
              max={40}
              step={2}
              onChange={(separacion) => patch({ separacion })}
            />
          </Bloque>

          <Bloque
            titulo="Capítulos y servidores"
            descripcion="El panel lateral puede quedarse para los capítulos o para los datos de la ficha. Si los capítulos bajan, el panel se libera."
          >
            <Segmentado
              label="Panel lateral"
              value={config.panel}
              options={[
                { value: 'capitulos', label: 'Capítulos' },
                { value: 'informacion', label: 'Información' },
                { value: 'ninguno', label: 'Sin panel' },
              ]}
              onChange={(panel) => patch({ panel })}
            />
            <Segmentado
              label="Capítulos"
              value={config.capitulos}
              options={[
                { value: 'panel', label: 'En el panel' },
                { value: 'debajo', label: 'Debajo' },
                { value: 'desplegable', label: 'Desplegable' },
              ]}
              onChange={(capitulos) => patch({ capitulos })}
            />
            <Segmentado
              label="Temporadas"
              value={config.temporadas}
              options={[
                { value: 'fila', label: 'Fila de botones' },
                { value: 'desplegable', label: 'Desplegable' },
              ]}
              onChange={(temporadas) => patch({ temporadas })}
            />
            <Segmentado
              label="Servidores"
              value={config.servidores}
              options={[
                { value: 'encima', label: 'Encima del video' },
                { value: 'debajo', label: 'Debajo del video' },
                { value: 'menu', label: 'Menú' },
              ]}
              onChange={(servidores) => patch({ servidores })}
            />
          </Bloque>

          <ExportarJson nombre="miso-reproductor" json={json} />
        </aside>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Simulacro
// ----------------------------------------------------------------------

function VistaReproductor({
  config,
  device,
}: {
  config: ReproductorDisposicion;
  device: Device;
}) {
  const estilo = {
    '--lab-ancho': `${config.ancho}px`,
    '--lab-gap': `${config.separacion}px`,
  } as CSSProperties;

  const esSerie = true;
  const conPanel = device !== 'mobile' && esSerie && config.panel !== 'ninguno' && config.capitulos === 'panel';
  const orden = config.orden ?? 'reproductor-arriba';

  const info = (
    <div className="lab-player-hero" data-poster={config.poster === 'oculto' ? 'oculto' : 'lateral'} data-panel={conPanel ? 'capitulos' : 'ninguno'}>
      {config.poster !== 'oculto' && <Poster />}

      <div className="lab-player-main">
        <div className="lab-titulo-bloque">
          <h2 className="detail-title">Sobrenatural</h2>
          <p className="detail-facts">
            2005 <span>·</span> {esSerie ? 'Serie' : 'Película'} <span>·</span> 15 temporadas
            <span className="card-rating">8.4</span>
          </p>
          <p className="lab-sinopsis">
            Sam y Dean Winchester recorren Estados Unidos cazando lo sobrenatural. La
            ficha reúne los capítulos de todas las fuentes en una sola lista.
          </p>
          {config.acciones === 'titulo' && <Acciones />}
        </div>

        {config.servidores !== 'debajo' && <Servidores config={config} />}

        {config.acciones === 'debajo' && <Acciones />}

        {config.servidores === 'debajo' && <Servidores config={config} />}

        {device === 'mobile' && esSerie && (
          <details className="lab-desplegable" open>
            <summary>Capítulos de la temporada</summary>
            <Capitulos config={config} dentro />
          </details>
        )}
      </div>

      {conPanel && (
        <aside className="lab-player-aside">
          <Capitulos config={config} />
        </aside>
      )}
    </div>
  );

  return (
    <div className="lab-frame" data-device={device}>
      <div className="lab-player" style={estilo}>
        <div className="detail-bar lab-detail-bar">
          <span className="detail-back">← Volver</span>
          <span className="lab-detail-source">sololatino · T2E5</span>
        </div>

        <div className="lab-player-scroll">
          <div className="lab-player-inner">
            {orden === 'reproductor-arriba' ? (
              <>
                <Video />
                {info}
              </>
            ) : (
              <>
                {info}
                <Video />
              </>
            )}
          </div>
        </div>

        <Aviso posicion={config.avisos} />
      </div>
    </div>
  );
}

function Video() {
  return (
    <div className="lab-video" aria-hidden="true">
      <span className="lab-video-play">▶</span>
      <div className="lab-video-controls">
        <span className="lab-video-mini">▶</span>
        <span className="lab-video-time">12:34</span>
        <span className="lab-video-track">
          <span style={{ width: '38%' }} />
        </span>
        <span className="lab-video-time">45:10</span>
        <span className="lab-video-mini">⛶</span>
      </div>
    </div>
  );
}

function Poster() {
  return (
    <div className="lab-poster" aria-hidden="true">
      <span>S</span>
    </div>
  );
}

function Acciones() {
  return (
    <div className="lab-acciones">
      <span className="ghost">☆ Favorito</span>
      <span className="ghost">✓ Marcar visto</span>
    </div>
  );
}

function Servidores({ config }: { config: ReproductorDisposicion }) {
  if (config.servidores === 'menu') {
    return (
      <div className="lab-servidores">
        <p className="switcher-label">
          Servidor <span className="switcher-hint">3 disponibles</span>
        </p>
        <span className="lab-select-servidor">Latino · vidhide ▾</span>
      </div>
    );
  }

  return (
    <div className="lab-servidores">
      <p className="switcher-label">
        Servidores <span className="switcher-hint">3 disponibles</span>
      </p>
      <div className="switcher-options">
        <span className="switcher-option" data-active>
          Latino · vidhide
        </span>
        <span className="switcher-option">Latino · streamwish</span>
        <span className="switcher-option">Latino · voe</span>
      </div>
    </div>
  );
}

function Capitulos({
  config,
  dentro,
}: {
  config: ReproductorDisposicion;
  dentro?: boolean;
}) {
  return (
    <div className="lab-capitulos">
      <p className="switcher-label">
        Capítulos <span className="switcher-hint">Temporada 2 · 8 episodios</span>
      </p>

      {config.temporadas === 'fila' ? (
        <div className="switcher-options lab-temporadas">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className="switcher-option ep-season" data-active={i === 1 || undefined}>
              {i + 1}
            </span>
          ))}
        </div>
      ) : (
        <select className="lab-select" defaultValue="2" aria-label="Temporada">
          {Array.from({ length: 15 }, (_, i) => (
            <option key={i} value={i + 1}>
              Temporada {i + 1}
            </option>
          ))}
        </select>
      )}

      <div className="lab-episodios" data-compacto={dentro || undefined}>
        {EPISODIOS.map((nombre, i) => (
          <div key={nombre} className="lab-ep" data-active={i === 4 || undefined}>
            <span className="lab-ep-num">T2E{i + 1}</span>
            <span className="lab-ep-nombre">{nombre}</span>
            <span className="lab-ep-dur">42 min</span>
          </div>
        ))}
      </div>

      <p className="ep-note">
        <strong>T2E5 · Simetría</strong> <span className="ep-meta">· 42 min</span>
      </p>
    </div>
  );
}

function Aviso({ posicion }: { posicion: ReproductorDisposicion['avisos'] }) {
  return (
    <div className="lab-aviso" data-pos={posicion} aria-hidden="true">
      <div className="next-up">
        <p className="next-up-text">
          Siguiente capítulo en 8 s
          <span className="next-up-sub"> · T2E6</span>
        </p>
        <div className="next-up-actions">
          <span className="next-up-go">Ver ahora</span>
          <span className="ghost-btn">Cancelar</span>
        </div>
      </div>
    </div>
  );
}
