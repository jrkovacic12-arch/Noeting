import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openPC, createPCServer } from "../src/sync/server";
async function main() {
  if (process.env.NOETING_ENABLE_SYNC_V2 !== "1")
    throw new Error(
      "Development gate: set NOETING_ENABLE_SYNC_V2=1 for disposable test data only. Native HTTPS acceptance is pending.",
    );
  const port = Number(process.env.NOETING_PORT ?? 8788);
  if (process.env.NOETING_HOST && process.env.NOETING_HOST !== "127.0.0.1")
    throw new Error("Only localhost binding is supported.");
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("Invalid local port.");
  const pc = await openPC(
    process.env.NOETING_PC_DB ?? "./work/noeting-pc/library.sqlite",
  );
  const server = createPCServer(
    pc.repository,
    process.env.NOETING_SYNC_TOKEN ?? "",
    process.env.NOETING_PUBLIC_ORIGIN,
    process.env.NOETING_PC_TOKEN,
  );
  server.listen(port, "127.0.0.1", () =>
    console.log(
      `Noeting v2 disposable-test PC library: http://127.0.0.1:${port}`,
    ),
  );
  const close = () =>
    server.close(() => {
      pc.close();
      process.exit(0);
    });
  process.on("SIGTERM", close);
  process.on("SIGINT", close);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  void main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
