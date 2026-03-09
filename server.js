import os from "node:os";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import express from "express";
import QRCode from "qrcode";
import { WebSocketServer } from "ws";
import { mouse, keyboard, Button, Key, Point, screen } from "@nut-tree-fork/nut-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");

const keyMap = {
  enter: Key.Enter,
  backspace: Key.Backspace,
  tab: Key.Tab,
  escape: Key.Escape,
  space: Key.Space,
  up: Key.Up,
  down: Key.Down,
  left: Key.Left,
  right: Key.Right
};

mouse.config.autoDelayMs = 0;

export function createControlApi(deps = {}) {
  const mouseApi = deps.mouse ?? mouse;
  const keyboardApi = deps.keyboard ?? keyboard;
  const screenApi = deps.screen ?? screen;

  return {
    async moveRelative(dx, dy) {
      const position = await mouseApi.getPosition();
      const next = new Point(position.x + dx, position.y + dy);
      await mouseApi.setPosition(next);
    },
    async moveAbsolute(x, y) {
      const width = await screenApi.width();
      const height = await screenApi.height();
      await mouseApi.setPosition(new Point(clamp(x, 0, width), clamp(y, 0, height)));
    },
    async click(button, isDouble) {
      if (isDouble) {
        await mouseApi.doubleClick(button);
        return;
      }

      await mouseApi.click(button);
    },
    async scroll(deltaY) {
      const amount = Math.round(deltaY);
      if (amount > 0) {
        await mouseApi.scrollDown(amount);
      } else if (amount < 0) {
        await mouseApi.scrollUp(Math.abs(amount));
      }
    },
    async type(text) {
      if (text) {
        await keyboardApi.type(text);
      }
    },
    async tapKey(key) {
      await keyboardApi.pressKey(key);
      await keyboardApi.releaseKey(key);
    }
  };
}

export function createRemoteMouseServer(options = {}) {
  const port = Number(options.port ?? process.env.PORT ?? 3000);
  const silent = Boolean(options.silent);
  const pairCode = String(options.pairCode ?? createPairCode());
  const hostProvider = options.hostProvider ?? getLanAddress;
  const controlApi = options.controlApi ?? createControlApi();
  let actualPort = port;

  const app = express();
  const clients = new Map();
  const hostSockets = new Set();

  app.use(express.json({ limit: "1mb" }));
  app.use(express.static(publicDir));

  app.get("/host", (req, res) => {
    if (!isLocalRequest(req.socket.remoteAddress)) {
      res.status(403).send("Host dashboard is only available on the computer running the server.");
      return;
    }

    res.sendFile(path.join(publicDir, "host.html"));
  });

  app.get("/api/session", async (_req, res) => {
    const host = hostProvider();
    const baseUrl = `http://${host}:${actualPort}`;
    const qrDataUrl = await createQrDataUrl(baseUrl);

    res.json({
      baseUrl,
      wsUrl: `ws://${host}:${actualPort}/ws`,
      qrDataUrl
    });
  });

  app.get("/api/host-session", async (req, res) => {
    if (!isLocalRequest(req.socket.remoteAddress)) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    const host = hostProvider();
    const baseUrl = `http://${host}:${actualPort}`;
    const qrDataUrl = await createQrDataUrl(baseUrl);

    res.json({
      baseUrl,
      hostUrl: `http://127.0.0.1:${actualPort}/host`,
      pairCode,
      qrDataUrl,
      pending: getPendingClients(clients),
      approved: getApprovedClients(clients)
    });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });

  const broadcastHostState = () => {
    const message = JSON.stringify({
      type: "host-state",
      pairCode,
      pending: getPendingClients(clients),
      approved: getApprovedClients(clients)
    });

    for (const socket of hostSockets) {
      if (socket.readyState === socket.OPEN) {
        socket.send(message);
      }
    }
  };

  wss.on("connection", (socket, req) => {
    const clientId = crypto.randomUUID();
    const clientState = {
      id: clientId,
      socket,
      role: "controller",
      approved: false,
      pending: false,
      deviceName: `Phone-${clientId.slice(0, 4)}`,
      isLocal: isLocalRequest(req.socket.remoteAddress)
    };

    clients.set(clientId, clientState);
    socket.send(JSON.stringify({ type: "session", clientId }));
    socket.send(JSON.stringify({ type: "status", message: "connected" }));

    socket.on("message", async (raw) => {
      try {
        const payload = JSON.parse(String(raw));
        await handleMessage({ clientState, payload, clients, hostSockets, pairCode, controlApi, broadcastHostState });
      } catch (error) {
        socket.send(JSON.stringify({
          type: "error",
          message: error instanceof Error ? error.message : "Unknown error"
        }));
      }
    });

    socket.on("close", () => {
      hostSockets.delete(socket);
      clients.delete(clientId);
      broadcastHostState();
    });
  });

  return {
    app,
    server,
    port,
    pairCode,
    getPort() {
      return actualPort;
    },
    listen() {
      return new Promise((resolve, reject) => {
        server.once("error", (error) => {
          reject(error);
        });

        server.listen(port, async () => {
          server.removeAllListeners("error");
          actualPort = server.address().port;
          const host = hostProvider();
          const baseUrl = `http://${host}:${actualPort}`;

          if (!silent) {
            const qr = await QRCode.toString(baseUrl, { type: "terminal", small: true });
            process.stdout.write(`\nRemote Mouse is running at ${baseUrl}\n`);
            process.stdout.write(`Pair code: ${pairCode}\n`);
            process.stdout.write(`Host dashboard: http://127.0.0.1:${actualPort}/host\n`);
            process.stdout.write(`${qr}\n`);
            process.stdout.write("On macOS, grant Accessibility permission to Terminal/Node for control input.\n\n");
          }

          resolve();
        });
      });
    },
    close() {
      for (const socket of wss.clients) {
        socket.close();
      }

      return new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  };
}

export async function handleMessage(context) {
  const { clientState, payload, clients, hostSockets, pairCode, controlApi, broadcastHostState } = context;

  switch (payload.type) {
    case "host-register": {
      if (!clientState.isLocal) {
        throw new Error("Host dashboard is only available locally");
      }

      clientState.role = "host";
      hostSockets.add(clientState.socket);
      clientState.socket.send(JSON.stringify({
        type: "host-state",
        pairCode,
        pending: getPendingClients(clients),
        approved: getApprovedClients(clients)
      }));
      return;
    }
    case "pair-request": {
      const code = String(payload.code || "").trim();
      if (code !== pairCode) {
        throw new Error("Pair code is incorrect");
      }

      clientState.deviceName = sanitizeName(payload.deviceName) || clientState.deviceName;
      clientState.pending = true;
      clientState.approved = false;
      clientState.socket.send(JSON.stringify({ type: "pair-pending" }));
      broadcastHostState();
      return;
    }
    case "pair-approve": {
      ensureLocalHost(clientState);
      const target = clients.get(String(payload.clientId || ""));
      if (!target) {
        throw new Error("Pair request no longer exists");
      }

      target.pending = false;
      target.approved = true;
      target.socket.send(JSON.stringify({ type: "authorized" }));
      broadcastHostState();
      return;
    }
    case "pair-reject": {
      ensureLocalHost(clientState);
      const target = clients.get(String(payload.clientId || ""));
      if (!target) {
        throw new Error("Pair request no longer exists");
      }

      target.pending = false;
      target.approved = false;
      target.socket.send(JSON.stringify({ type: "pair-rejected" }));
      broadcastHostState();
      return;
    }
    case "pair-revoke": {
      ensureLocalHost(clientState);
      const target = clients.get(String(payload.clientId || ""));
      if (!target) {
        throw new Error("Approved device no longer exists");
      }

      target.pending = false;
      target.approved = false;
      target.socket.send(JSON.stringify({ type: "pair-revoked" }));
      broadcastHostState();
      return;
    }
    default: {
      if (!clientState.approved) {
        throw new Error("Device is not paired yet");
      }

      await handleAction(payload, controlApi);
      clientState.socket.send(JSON.stringify({ type: "ack", action: payload.type }));
    }
  }
}

export async function handleAction(payload, controlApi = createControlApi()) {
  switch (payload.type) {
    case "move":
      await controlApi.moveRelative(Number(payload.dx || 0), Number(payload.dy || 0));
      return;
    case "click":
      await controlApi.click(toButton(payload.button), Boolean(payload.double));
      return;
    case "scroll":
      await controlApi.scroll(Number(payload.dy || 0));
      return;
    case "type":
      await controlApi.type(String(payload.text || ""));
      return;
    case "key": {
      const key = keyMap[String(payload.key || "").toLowerCase()];
      if (!key) {
        throw new Error("Unsupported key action");
      }

      await controlApi.tapKey(key);
      return;
    }
    case "position":
      await controlApi.moveAbsolute(Number(payload.x || 0), Number(payload.y || 0));
      return;
    default:
      throw new Error("Unsupported action type");
  }
}

async function createQrDataUrl(baseUrl) {
  return QRCode.toDataURL(baseUrl, {
    margin: 1,
    color: {
      dark: "#102f29",
      light: "#f6f3ea"
    }
  });
}

function toButton(value) {
  switch (String(value || "left").toLowerCase()) {
    case "right":
      return Button.RIGHT;
    case "middle":
      return Button.MIDDLE;
    default:
      return Button.LEFT;
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function sanitizeName(value) {
  return String(value || "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .slice(0, 24);
}

function createPairCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function ensureLocalHost(clientState) {
  if (!(clientState.role === "host" && clientState.isLocal)) {
    throw new Error("Only the local host dashboard can approve devices");
  }
}

function getPendingClients(clients) {
  return Array.from(clients.values())
    .filter((client) => client.role === "controller" && client.pending)
    .map((client) => ({ id: client.id, deviceName: client.deviceName }));
}

function getApprovedClients(clients) {
  return Array.from(clients.values())
    .filter((client) => client.role === "controller" && client.approved)
    .map((client) => ({ id: client.id, deviceName: client.deviceName }));
}

function isLocalRequest(remoteAddress) {
  return remoteAddress === "127.0.0.1" || remoteAddress === "::1" || remoteAddress === "::ffff:127.0.0.1";
}

function getLanAddress() {
  const interfaces = os.networkInterfaces();
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses || []) {
      if (address.family === "IPv4" && !address.internal) {
        return address.address;
      }
    }
  }

  return "127.0.0.1";
}

if (process.argv[1] === __filename) {
  const runtime = createRemoteMouseServer();
  try {
    await runtime.listen();
  } catch (error) {
    if (error && error.code === "EADDRINUSE") {
      process.stderr.write("Port 3000 is already in use. Stop the existing process or run with a different port, for example: PORT=3001 node server.js\n");
      process.exit(1);
    }

    throw error;
  }
}
