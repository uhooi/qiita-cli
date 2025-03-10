import chokidar from "chokidar";
import express from "express";
import type { Server } from "node:http";
import { createServer } from "node:http";
import path from "node:path";
import WebSocket, { WebSocketServer } from "ws";
import { serverDebugger } from "../lib/debugger";
import { AssetsRouter } from "./api/assets";
import { EmojiRouter } from "./api/emoji";
import { ItemsRouter } from "./api/items";
import { ReadmeRouter } from "./api/readme";

export async function startServer() {
  const app = express();

  app.use(express.json());

  app.use((req, res, next) => {
    serverDebugger(req.method, req.url, JSON.stringify(req.body || {}));
    next();
  });

  app.use(express.static(path.join(__dirname, "../public")));

  app.use("/api/items", ItemsRouter);
  app.use("/api/readme", ReadmeRouter);
  app.use("/assets", AssetsRouter);
  app.use("/emoji", EmojiRouter);

  app.use("*", express.static(path.join(__dirname, "../public/index.html")));

  const server = createServer(app);
  const port = process.env.QIITA_CLI_PORT
    ? parseInt(process.env.QIITA_CLI_PORT, 10)
    : 8888;
  const host = "localhost";

  return new Promise<Server>((resolve, reject) => {
    server
      .listen(port, host)
      .once("listening", () => {
        console.log(`Preview: http://${host}:${port}`);

        resolve(server);
      })
      .once("error", () => {
        throw new Error("Failed to start server");
      });
  });
}

export function startLocalChangeWatcher({
  server,
  watchPath,
}: {
  server: Server;
  watchPath: string;
}) {
  const wsServer = new WebSocketServer({ server });
  const watcher = chokidar.watch(watchPath);
  watcher.on("change", () => {
    wsServer.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send("local changed");
      }
    });
  });
}
