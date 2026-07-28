process.env.VITE_DISABLE_SOCKET = "true";
process.env.VITE_STRIPE_PUBLISHABLE_KEY ??= "pk_test_e2e_placeholder";

const { createServer } = await import("vite");

const server = await createServer({
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
  },
});

await server.listen();
server.printUrls();

let closing = false;
async function closeServer() {
  if (closing) return;
  closing = true;
  server.httpServer?.closeAllConnections();
  await server.close();
  process.exit(0);
}

process.once("SIGINT", closeServer);
process.once("SIGTERM", closeServer);
