import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

import { WebSocket } from "ws";

import { createControlApi, createRemoteMouseServer, handleAction } from "../server.js";

test("relative mouse moves use instant setPosition", async () => {
  const calls = [];
  const fakeMouse = {
    async getPosition() {
      calls.push(["getPosition"]);
      return { x: 120, y: 45 };
    },
    async setPosition(point) {
      calls.push(["setPosition", point.x, point.y]);
    },
    async move() {
      calls.push(["move"]);
    }
  };

  const controlApi = createControlApi({
    mouse: fakeMouse,
    keyboard: {},
    screen: { async width() { return 1920; }, async height() { return 1080; } }
  });

  await handleAction({ type: "move", dx: 15, dy: -5 }, controlApi);

  assert.deepEqual(calls, [
    ["getPosition"],
    ["setPosition", 135, 40]
  ]);
});

test("absolute mouse moves are clamped to screen bounds", async () => {
  const positions = [];
  const controlApi = createControlApi({
    mouse: {
      async getPosition() {
        return { x: 0, y: 0 };
      },
      async setPosition(point) {
        positions.push([point.x, point.y]);
      }
    },
    keyboard: {},
    screen: {
      async width() {
        return 1440;
      },
      async height() {
        return 900;
      }
    }
  });

  await handleAction({ type: "position", x: 9999, y: -20 }, controlApi);
  assert.deepEqual(positions, [[1440, 0]]);
});

test("scroll actions support horizontal and vertical axes", async () => {
  const calls = [];
  const controlApi = createControlApi({
    mouse: {
      async scrollLeft(amount) {
        calls.push(["scrollLeft", amount]);
      },
      async scrollRight(amount) {
        calls.push(["scrollRight", amount]);
      },
      async scrollDown(amount) {
        calls.push(["scrollDown", amount]);
      },
      async scrollUp(amount) {
        calls.push(["scrollUp", amount]);
      }
    },
    keyboard: {},
    screen: { async width() { return 0; }, async height() { return 0; } }
  });

  await handleAction({ type: "scroll", dx: 4, dy: -3 }, controlApi);

  assert.deepEqual(calls, [
    ["scrollRight", 4],
    ["scrollUp", 3]
  ]);
});

test("unauthorized clients cannot send control actions", async () => {
  const trustedStorePath = createTrustedStorePath("unauthorized");
  const runtime = createRemoteMouseServer({
    port: 0,
    silent: true,
    pairCode: "654321",
    hostProvider: () => "127.0.0.1",
    trustedStorePath,
    controlApi: {
      async moveRelative() {
        throw new Error("should not be called");
      },
      async moveAbsolute() {},
      async click() {},
      async scroll() {},
      async type() {},
      async tapKey() {}
    }
  });

  await runtime.listen();
  const port = runtime.getPort();

  try {
    const ws = await openSocket(`ws://127.0.0.1:${port}/ws`);
    const error = await sendAndWaitFor(ws, { type: "move", dx: 1, dy: 1 }, "error");
    assert.equal(error.message, "Device is not paired yet");
    ws.close();
  } finally {
    await runtime.close();
    removeTrustedStore(trustedStorePath);
  }
});

test("paired clients can be approved through the host dashboard socket", async () => {
  const receivedActions = [];
  const trustedStorePath = createTrustedStorePath("approve");
  const runtime = createRemoteMouseServer({
    port: 0,
    silent: true,
    pairCode: "123456",
    hostProvider: () => "127.0.0.1",
    trustedStorePath,
    controlApi: {
      async moveRelative(dx, dy) {
        receivedActions.push([dx, dy]);
      },
      async moveAbsolute() {},
      async click() {},
      async scroll() {},
      async type() {},
      async tapKey() {}
    }
  });

  await runtime.listen();
  const port = runtime.getPort();

  try {
    const host = await openSocket(`ws://127.0.0.1:${port}/ws`);
    const phone = await openSocket(`ws://127.0.0.1:${port}/ws`);

    const hostState = await sendAndWaitFor(host, { type: "host-register" }, "host-state");
    assert.equal(hostState.pairCode, "123456");

    await sendAndWaitFor(phone, { type: "pair-request", code: "123456", deviceName: "QA Phone" }, "pair-pending");
    const pendingState = await waitForType(host, "host-state");
    assert.equal(pendingState.pending[0].deviceName, "QA Phone");

    await Promise.all([
      waitForType(phone, "authorized"),
      sendAndWaitFor(host, { type: "pair-approve", clientId: pendingState.pending[0].id }, "host-state")
    ]);

    const ack = await sendAndWaitFor(phone, { type: "move", dx: 7, dy: 9 }, "ack");
    assert.equal(ack.action, "move");
    assert.deepEqual(receivedActions, [[7, 9]]);

    host.close();
    phone.close();
  } finally {
    await runtime.close();
    removeTrustedStore(trustedStorePath);
  }
});

test("host can revoke an approved device", async () => {
  const receivedActions = [];
  const trustedStorePath = createTrustedStorePath("revoke");
  const runtime = createRemoteMouseServer({
    port: 0,
    silent: true,
    pairCode: "222222",
    hostProvider: () => "127.0.0.1",
    trustedStorePath,
    controlApi: {
      async moveRelative(dx, dy) {
        receivedActions.push([dx, dy]);
      },
      async moveAbsolute() {},
      async click() {},
      async scroll() {},
      async type() {},
      async tapKey() {}
    }
  });

  await runtime.listen();
  const port = runtime.getPort();

  try {
    const host = await openSocket(`ws://127.0.0.1:${port}/ws`);
    const phone = await openSocket(`ws://127.0.0.1:${port}/ws`);

    await sendAndWaitFor(host, { type: "host-register" }, "host-state");
    await sendAndWaitFor(phone, { type: "pair-request", code: "222222", deviceName: "QA Phone" }, "pair-pending");
    const pendingState = await waitForType(host, "host-state");

    await Promise.all([
      waitForType(phone, "authorized"),
      sendAndWaitFor(host, { type: "pair-approve", clientId: pendingState.pending[0].id }, "host-state")
    ]);

    await sendAndWaitFor(phone, { type: "move", dx: 3, dy: 4 }, "ack");
    assert.deepEqual(receivedActions, [[3, 4]]);

    await Promise.all([
      waitForType(phone, "pair-revoked"),
      sendAndWaitFor(host, { type: "pair-revoke", clientId: pendingState.pending[0].id }, "host-state")
    ]);

    const error = await sendAndWaitFor(phone, { type: "move", dx: 1, dy: 1 }, "error");
    assert.equal(error.message, "Device is not paired yet");
    assert.deepEqual(receivedActions, [[3, 4]]);

    host.close();
    phone.close();
  } finally {
    await runtime.close();
    removeTrustedStore(trustedStorePath);
  }
});

test("remembered devices are auto-authorized on reconnect", async () => {
  const trustedStorePath = createTrustedStorePath("remembered");
  const receivedActions = [];
  const runtime = createRemoteMouseServer({
    port: 0,
    silent: true,
    pairCode: "333333",
    hostProvider: () => "127.0.0.1",
    trustedStorePath,
    controlApi: {
      async moveRelative(dx, dy) {
        receivedActions.push([dx, dy]);
      },
      async moveAbsolute() {},
      async click() {},
      async scroll() {},
      async type() {},
      async tapKey() {}
    }
  });

  await runtime.listen();
  const port = runtime.getPort();

  try {
    const host = await openSocket(`ws://127.0.0.1:${port}/ws`);
    const phone = await openSocket(`ws://127.0.0.1:${port}/ws`);

    await sendAndWaitFor(host, { type: "host-register" }, "host-state");
    phone.send(JSON.stringify({ type: "device-register", deviceName: "Remembered Phone", trustedToken: "" }));
    await sendAndWaitFor(phone, { type: "pair-request", code: "333333", deviceName: "Remembered Phone" }, "pair-pending");
    const pendingState = await waitForType(host, "host-state");

    const [authorizedPayload] = await Promise.all([
      waitForType(phone, "authorized"),
      sendAndWaitFor(host, { type: "pair-approve", clientId: pendingState.pending[0].id }, "host-state")
    ]);

    const trustedToken = authorizedPayload.trustedToken;
    assert.ok(trustedToken);

    phone.close();

    const returningPhone = await openSocket(`ws://127.0.0.1:${port}/ws`);
    const rememberedAuth = sendAndWaitFor(returningPhone, { type: "device-register", deviceName: "Remembered Phone", trustedToken }, "authorized");
    const rememberedPayload = await rememberedAuth;
    assert.equal(rememberedPayload.remembered, true);
    const ack = await sendAndWaitFor(returningPhone, { type: "move", dx: 11, dy: 12 }, "ack");
    assert.equal(ack.action, "move");
    assert.deepEqual(receivedActions, [[11, 12]]);

    host.close();
    returningPhone.close();
  } finally {
    await runtime.close();
    removeTrustedStore(trustedStorePath);
  }
});

function openSocket(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });
}

function waitForType(ws, type) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${type}`));
    }, 4000);

    const onMessage = (raw) => {
      const payload = JSON.parse(String(raw));
      if (payload.type === type) {
        cleanup();
        resolve(payload);
      }
    };

    const onError = (error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      clearTimeout(timeout);
      ws.off("message", onMessage);
      ws.off("error", onError);
    };

    ws.on("message", onMessage);
    ws.on("error", onError);
  });
}

async function sendAndWaitFor(ws, payload, type) {
  const waiting = waitForType(ws, type);
  ws.send(JSON.stringify(payload));
  return waiting;
}

function createTrustedStorePath(name) {
  return path.join(os.tmpdir(), `remote-mouse-${name}-${process.pid}-${Date.now()}.json`);
}

function removeTrustedStore(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    if (!error || error.code !== "ENOENT") {
      throw error;
    }
  }
}
