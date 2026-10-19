import {once} from 'node:events';
import {createPCServer,openPC} from '../src/sync/server';
import {replica} from './syncFixtures';
import type {RPC} from '../src/sync/client';
export const pcSecret = "test-only-pc-admin-".repeat(3);
export const secret = "test-only-secret-".repeat(3);
export async function harness(filename?: string) {
  const pc = filename
    ? await openPC(filename)
    : { repository: replica().repo, close: () => {} };
  const server = createPCServer(pc.repository, secret, undefined, pcSecret);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const rpc: RPC = async (action, input) => {
    if (action === "edit" && !input.expected)
      input = {
        ...input,
        expected: await pc.repository.sync(async (s) =>
          s.current(await s.records()),
        ),
      };
    const response = await fetch(`${address}/api/sync/v2/${action}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${["pc", "edit", "revoke", "allow", "pc-resolve"].includes(action) ? pcSecret : secret}`,
      },
      body: JSON.stringify({ protocol: 2, ...input }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    return data;
  };
  return {
    pc,
    server,
    address,
    rpc,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      pc.close();
    },
  };
}
