import { createServer } from "node:http";
import next from "next";
import { WebSocketServer } from "ws";
import { attachTerminalSocket, authorizeTerminalUpgrade } from "./src/lib/ctf/ws-terminal";

const portArgIndex = process.argv.indexOf("--port");
const port = Number(portArgIndex >= 0 ? process.argv[portArgIndex + 1] : process.env.PORT || 3000);
// HOSTNAME is often auto-populated by Docker/CI with the container id. Bind to
// an explicit HOST instead so the server always listens on all interfaces.
const hostname = process.env.HOST || "0.0.0.0";
const dev = process.env.NODE_ENV === "development";
const app = next({ dev, dir: process.cwd() });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((request, response) => {
    void handle(request, response);
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64_000 });

  wss.on("connection", (socket, request) => {
    void attachTerminalSocket(socket, request);
  });

  server.on("upgrade", (request, socket, head) => {
    let pathname = "";
    try {
      pathname = new URL(request.url || "/", "http://localhost").pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== "/api/ctf/terminal/ws") {
      socket.destroy();
      return;
    }
    if (!authorizeTerminalUpgrade(request)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (client) => {
      wss.emit("connection", client, request);
    });
  });

  server.listen(port, hostname, () => {
    console.log(`> CTF Intelligence siap di http://${hostname}:${port} (WebSocket terminal aktif)`);
  });

  const shutdown = () => {
    for (const client of wss.clients) client.close(1001, "server shutdown");
    wss.close();
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}).catch((error: unknown) => {
  console.error("Gagal menyiapkan server:", error);
  process.exit(1);
});
