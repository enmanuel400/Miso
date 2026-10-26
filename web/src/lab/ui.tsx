import { useState, type ReactNode } from 'react';
import { DEVICES, type Device } from './types.js';

/**
 * Piezas comunes de los dos laboratorios.
 *
 * Los controles son los mismos en ambas paginas para que la lectura sea la
 * misma: un desplegable de dispositivo arriba, bloques con un rotulo y un
 * control debajo, y un exportador al final. No hay nada que guarde estado en el
 * servidor ni que toque la aplicacion de verdad.
 */

export function LabTop({
  titulo,
  subtitulo,
  device,
  onDevice,
  otro,
  onReset,
}: {
  titulo: string;
  subtitulo: string;
  device: Device;
  onDevice(device: Device): void;
  otro: { href: string; label: string };
  onReset(): void;
}) {
  return (
    <header className="lab-top">
      <div className="lab-top-text">
        <p className="lab-eyebrow">Miso · laboratorio</p>
        <h1 className="lab-title">{titulo}</h1>
        <p className="lab-subtitle">{subtitulo}</p>
      </div>

      <div className="lab-top-actions">
        <a className="lab-link" href={otro.href}>
          {otro.label}
        </a>
        <button type="button" className="ghost" onClick={onReset}>
          Restablecer
        </button>
      </div>

      <div className="lab-devices" role="group" aria-label="Dispositivo">
        {DEVICES.map((d) => (
          <button
            key={d.id}
            type="button"
            className="lab-device"
            data-active={device === d.id || undefined}
            onClick={() => onDevice(d.id)}
          >
            {d.label}
          </button>
        ))}
      </div>
    </header>
  );
}

export function Bloque({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion?: string;
  children: ReactNode;
}) {
  return (
    <section className="lab-bloque">
      <h2 className="lab-bloque-title">{titulo}</h2>
      {descripcion && <p className="lab-bloque-note">{descripcion}</p>}
      <div className="lab-bloque-body">{children}</div>
    </section>
  );
}

export function Campo({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="lab-campo">
      <span className="lab-campo-label">
        {label}
        {hint && <span className="lab-campo-hint">{hint}</span>}
      </span>
      {children}
    </div>
  );
}

export function Segmentado<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; disabled?: boolean; title?: string }[];
  onChange(value: T): void;
}) {
  return (
    <Campo label={label}>
      <div className="lab-segmentado" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className="lab-segmento"
            data-active={value === o.value || undefined}
            disabled={o.disabled}
            title={o.title}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </Campo>
  );
}

export function Deslizador({
  label,
  value,
  min,
  max,
  step = 1,
  sufijo = ' px',
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  sufijo?: string;
  onChange(value: number): void;
  disabled?: boolean;
}) {
  return (
    <Campo label={label}>
      <div className="lab-slider">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          aria-label={label}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <output className="lab-slider-value">
          {value}
          {sufijo}
        </output>
      </div>
    </Campo>
  );
}

export function Interruptor({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange(checked: boolean): void;
}) {
  return (
    <label className="lab-switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="lab-switch-track" aria-hidden="true" />
      <span className="lab-switch-label">{label}</span>
    </label>
  );
}

async function copiarAlPortapapeles(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Sin contexto seguro (por ejemplo `http://192.168.x.x`) la API no existe.
    // El respaldo con un textarea sigue funcionando en cualquier navegador.
    const ta = document.createElement('textarea');
    ta.value = texto;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function ExportarJson({ nombre, json }: { nombre: string; json: string }) {
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    const ok = await copiarAlPortapapeles(json);
    setCopiado(ok);
    if (ok) setTimeout(() => setCopiado(false), 2000);
  };

  const descargar = () => {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${nombre}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <details className="lab-export">
      <summary>
        <span>Exportar JSON</span>
        <span className="lab-export-hint">esto es lo que se implementa</span>
      </summary>
      <p className="lab-bloque-note">
        Copia el JSON o descárgalo y pásalo. La disposición se implementa en la interfaz real; el
        laboratorio no cambia la aplicación por sí solo.
      </p>
      <textarea
        className="lab-json"
        readOnly
        value={json}
        spellCheck={false}
        onFocus={(e) => e.currentTarget.select()}
      />
      <div className="lab-export-actions">
        <button type="button" className="lab-primary" onClick={() => void copiar()}>
          {copiado ? 'Copiado' : 'Copiar JSON'}
        </button>
        <button type="button" className="ghost" onClick={descargar}>
          Descargar
        </button>
      </div>
    </details>
  );
}
