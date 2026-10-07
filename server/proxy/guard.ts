import dns from 'node:dns/promises';
import net from 'node:net';

/**
 * Validacion de destinos del proxy.
 *
 * El proxy existe para traer medios de CDNs cuyo dominio cambia en cada
 * titulo (playnixes.com, sv3.ibra.lat, hgplaycdn.com...), asi que no podemos
 * usar una lista blanca de dominios: seria inútil.
 *
 * En su lugar validamos lo que de verdad importa: que el destino sea un
 * servidor publico de http/https y que no apunte a la red interna. Sin esto,
 * el proxy se convertiria en un punto de acceso a la red local.
 */

const PRIVATE_V4 = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\./,
  /^169\.254\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

export class ProxyBlockedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'ProxyBlockedError';
  }
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return PRIVATE_V4.some((re) => re.test(ip));
  if (net.isIPv6(ip)) {
    const low = ip.toLowerCase();
    if (low === '::1' || low === '::') return true;
    // fc00::/7 unicas locales, fe80::/10 enlace local
    if (/^f[cd][0-9a-f]{2}:/.test(low)) return true;
    if (/^fe[89ab][0-9a-f]:/.test(low)) return true;
    // IPv4 mapeada (::ffff:127.0.0.1)
    const mapped = low.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
  }
  return false;
}

const dnsCache = new Map<string, { ips: string[]; expiresAt: number }>();
const DNS_TTL = 60_000;

async function resolveHost(host: string): Promise<string[]> {
  const cached = dnsCache.get(host);
  if (cached && cached.expiresAt > Date.now()) return cached.ips;

  let ips: string[];
  try {
    ips = (await dns.lookup(host, { all: true })).map((r) => r.address);
  } catch {
    throw new ProxyBlockedError(`No se pudo resolver ${host}`);
  }

  dnsCache.set(host, { ips, expiresAt: Date.now() + DNS_TTL });
  return ips;
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ProxyBlockedError(`URL invalida: ${raw.slice(0, 80)}`);
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ProxyBlockedError(`Protocolo no permitido: ${url.protocol}`);
  }

  const ips = await resolveHost(url.hostname);
  if (ips.length === 0) throw new ProxyBlockedError(`Sin IPs para ${url.hostname}`);

  // Basta con que una IP sea privada para descartar el destino: un dominio
  // publico puede apuntar a 127.0.0.1 y se llamaria idneo.
  const privateOnes = ips.filter(isPrivateIp);
  if (privateOnes.length > 0) {
    throw new ProxyBlockedError(`${url.hostname} apunta a la red interna`);
  }

  return url;
}

/** Cabeceras que reenviamos al origen. Algunas CDNs validan el Referer. */
export function upstreamHeaders(referer?: string | null, extra?: Record<string, string>) {
  return {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Accept: '*/*',
    'Accept-Language': 'es-ES,es;q=0.9',
    ...(referer ? { Referer: referer } : {}),
    ...extra,
  };
}