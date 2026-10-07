import { crearFuenteWpApi } from './wpapi.js';

/**
 * cuevana3.gs
 *
 * Sucede a la vieja "cuevana" (cuevana3.sc), cuya API `tmdb.*` murio. Es el mismo
 * tema react pero servido por un backend nuevo (`/wp-api/v1`), asi que entra por
 * el adaptador generico de sitios Cuevana. Sus reproductores pasan por
 * `player.php`, que no es mas que un iframe hacia el hoster real; el extractor lo
 * atraviesa como cualquier embed.
 */
export const cuevana3gs = crearFuenteWpApi(
  { id: 'cuevana3gs', label: 'cuevana3', accent: '#8f7cff' },
  ['cuevana3.gs'],
);