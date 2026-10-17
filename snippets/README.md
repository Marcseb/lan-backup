# LAN server discovery snippet

`lan-server-discovery.ts` is a reusable version of LAN Backup's IPv4 subnet
scanner. It probes `GET http://<host>:<port>/ping` for addresses `.1`–`.254`
on the device's `/24` subnet, in batches of 30, with a 500 ms per-host timeout.
Servers are deduplicated by their stable `id` in the ping response.

## Expo example

```ts
import * as Network from "expo-network";
import {
  discoverLanServers,
  type DiscoveredLanServer,
} from "./lan-server-discovery";

const localIp = await Network.getIpAddressAsync();
const controller = new AbortController();

const servers: DiscoveredLanServer[] = await discoverLanServers({
  localIp,
  port: 7823,
  signal: controller.signal,
  onProgress: (scanned, total, found) => {
    console.log(`${scanned}/${total}`, found);
  },
});

// To stop a scan:
// controller.abort();
```

The ping endpoint must be reachable without authentication and return JSON
containing a stable string `id`; `hostname` is optional. LAN Backup's
companion-server `/ping` endpoint follows this contract.

This intentionally scans only a `/24` subnet and uses plain HTTP, matching
LAN Backup's current implementation. For Android standalone builds, allow
cleartext traffic in the app's network security configuration if the server
uses HTTP. Guest Wi-Fi, client isolation, firewalls, VPNs, and networks with a
different subnet mask can prevent discovery; use a manually entered address or
adapt subnet calculation for those networks.
