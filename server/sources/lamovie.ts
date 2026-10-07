import { crearFuenteWpApi } from './wpapi.js';

/**
 * lamovie.org
 *
 * Usa el mismo backend que cuevana3.gs (`/wp-api/v1`) pero devuelve los embeds
 * del hoster directamente, sin pasar por `player.php`. Por eso comparte adaptador
 * con `cuevana3gs`: lo unico que cambia es el dominio y la etiqueta.
 */
export const lamovie = crearFuenteWpApi(
  { id: 'lamovie', label: 'lamovie', accent: '#6fb5ff' },
  ['lamovie.org'],
);