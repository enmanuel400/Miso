import { HttpError } from './http.js';

/**
 * Convierte un fallo de fuente en algo que se pueda leer en una sola linea.
 *
 * El mensaje crudo de la capa HTTP lleva la URL completa y se trunca como
 * "This operation was aborted", que no le dice nada a nadie. Aqui solo importa
 * distinguir tres cosas: que no respondio, que no nos deja entrar, o que su
 * servidor esta roto. El detalle se queda en la consola del servidor.
 *
 * Vive aparte de search.ts porque lo usan las dos rutas que hablan con fuentes:
 * la busqueda y la pantalla de inicio. Con dos copias, el dia que una fuente
 * conteste un 429 las dos lineas dejarian de decir lo mismo, y esa es
 * exactamente la vez que el usuario necesita que coincidan.
 */
export function briefSourceError(err: unknown): string {
  const status = err instanceof HttpError ? err.status : 0;
  if (status === 403 || status === 401) return 'no nos deja buscar';
  if (status === 429) return 'nos está limitando las peticiones';
  if (status >= 500) return 'su servidor está teniendo problemas';
  if (status === 404) return 'la página de búsqueda ya no existe';
  if (status === 0) return 'no respondió a tiempo';

  // Cualquier otra cosa se recorta y se limpia de URLs por si acaso.
  const texto = err instanceof Error ? err.message : String(err);
  return texto.replace(/https?:\/\/\S+/g, 'su página').slice(0, 120);
}
