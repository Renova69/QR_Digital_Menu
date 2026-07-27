const HOST = "127.0.0.1";
const PORT = 4173;
const BASE_URL = `http://${HOST}:${PORT}`;

async function isServerRunning(): Promise<boolean> {
  try {
    const response = await fetch(BASE_URL);
    return response.ok;
  } catch {
    return false;
  }
}

export default async function globalSetup() {
  if (await isServerRunning()) {
    return;
  }

  process.env.VITE_DISABLE_SOCKET = "true";
  const { createServer } = await import("vite");
  const server = await createServer({
    server: {
      host: HOST,
      port: PORT,
      strictPort: true,
    },
  });

  await server.listen();

  return async () => {
    server.httpServer?.closeAllConnections();
    await server.close();
  };
}
