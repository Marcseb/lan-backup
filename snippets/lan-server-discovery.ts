/**
 * Reusable IPv4 LAN server discovery.
 *
 * The target server must expose an unauthenticated GET /ping endpoint returning
 * JSON with a stable `id` and an optional `hostname`, for example:
 *   { "id": "desktop-123", "version": "1.0.0", "hostname": "DESKTOP" }
 *
 * This scans the local /24 subnet, addresses .1 through .254, in batches.
 * Supply the device's LAN IPv4 address and the server's port.
 */

export interface DiscoveredLanServer {
  ip: string;
  hostname: string;
  id: string;
}

export interface LanPingResponse {
  id: string;
  version?: string;
  hostname?: string;
}

export type LanFetch = (
  url: string,
  init: { signal: AbortSignal }
) => Promise<{
  ok: boolean;
  json(): Promise<unknown>;
}>;

export interface DiscoverLanServersOptions {
  /** Device IPv4 address, e.g. "192.168.1.24". */
  localIp: string;
  /** Port where the companion server listens, e.g. 7823. */
  port: number | string;
  /** Abort to stop starting new probes and cancel active probes. */
  signal: AbortSignal;
  /** Called after each completed probe. */
  onProgress?: (
    scanned: number,
    total: number,
    found: DiscoveredLanServer[]
  ) => void;
  /** Defaults match LAN Backup's current scanner. */
  batchSize?: number;
  timeoutMs?: number;
  /** Override for tests or runtimes with a custom fetch implementation. */
  fetchImpl?: LanFetch;
}

/** Returns the first three IPv4 octets followed by a dot (assumes a /24 LAN). */
export function getIpv4SubnetPrefix(localIp: string): string {
  const parts = localIp.split(".");
  if (
    parts.length !== 4 ||
    parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)
  ) {
    throw new Error(`Expected a valid IPv4 address; received "${localIp}"`);
  }
  return `${parts[0]}.${parts[1]}.${parts[2]}.`;
}

function isPingResponse(value: unknown): value is LanPingResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    value.id.length > 0
  );
}

/**
 * Probe each host in the local /24 for GET http://<ip>:<port>/ping.
 * Results are deduplicated by server id; the first response for each id wins.
 */
export async function discoverLanServers({
  localIp,
  port,
  signal,
  onProgress,
  batchSize = 30,
  timeoutMs = 500,
  fetchImpl = globalThis.fetch as LanFetch,
}: DiscoverLanServersOptions): Promise<DiscoveredLanServer[]> {
  const subnetPrefix = getIpv4SubnetPrefix(localIp);
  const numericPort = typeof port === "string" ? Number(port.trim()) : port;

  if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65535) {
    throw new Error(`Invalid server port: "${port}"`);
  }
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error("batchSize must be a positive integer");
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("timeoutMs must be greater than zero");
  }

  const total = 254;
  let scanned = 0;
  const byId = new Map<string, DiscoveredLanServer>();
  const ips = Array.from(
    { length: total },
    (_, index) => `${subnetPrefix}${index + 1}`
  );

  for (let start = 0; start < ips.length; start += batchSize) {
    if (signal.aborted) break;
    const batch = ips.slice(start, start + batchSize);

    await Promise.all(
      batch.map(async (ip) => {
        if (signal.aborted) return;

        const controller = new AbortController();
        const cancelProbe = () => controller.abort();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        signal.addEventListener("abort", cancelProbe, { once: true });

        try {
          const response = await fetchImpl(
            `http://${ip}:${numericPort}/ping`,
            { signal: controller.signal }
          );
          if (response.ok) {
            const data: unknown = await response.json();
            if (isPingResponse(data) && !byId.has(data.id)) {
              byId.set(data.id, {
                ip,
                hostname:
                  typeof data.hostname === "string" && data.hostname
                    ? data.hostname
                    : ip,
                id: data.id,
              });
            }
          }
        } catch {
          // Timeouts, blocked hosts, and unreachable addresses are expected.
        } finally {
          clearTimeout(timer);
          signal.removeEventListener("abort", cancelProbe);
          scanned += 1;
          onProgress?.(scanned, total, [...byId.values()]);
        }
      })
    );
  }

  return [...byId.values()];
}
