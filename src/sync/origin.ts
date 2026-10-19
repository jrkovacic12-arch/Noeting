import { SyncError } from './errors';
/** This pins DNS/HTTPS syntax, not VPN routing. Private Serve (never Funnel)
 * and tailnet access policy remain mandatory operator configuration. */
export function tailscaleOrigin(value: string): string {
 const label='[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
 if(typeof value!=='string'||!new RegExp(`^https://${label}\\.${label}\\.ts\\.net/?$`).test(value))
   throw new SyncError('policy','Use the exact private Tailscale Serve HTTPS origin, such as https://pc.tailnet.ts.net/, without a port, path or credentials.');
 const url=new URL(value);
 return url.origin;
}
