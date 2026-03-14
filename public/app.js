const statusText = document.getElementById("statusText");
const baseUrl = document.getElementById("baseUrl");
const qrImage = document.getElementById("qrImage");
const touchpad = document.getElementById("touchpad");
const sensitivity = document.getElementById("sensitivity");
const sensitivityValue = document.getElementById("sensitivityValue");
const sensitivitySettingValue = document.getElementById("sensitivitySettingValue");
const touchpadSize = document.getElementById("touchpadSize");
const touchpadSizeValue = document.getElementById("touchpadSizeValue");
const textInput = document.getElementById("textInput");
const reconnectButton = document.getElementById("reconnectButton");
const sendTextButton = document.getElementById("sendText");
const pairCodeInput = document.getElementById("pairCodeInput");
const deviceNameInput = document.getElementById("deviceName");
const pairButton = document.getElementById("pairButton");
const pairState = document.getElementById("pairState");
const controlPanels = Array.from(document.querySelectorAll("[data-control-panel]"));
const tabButtons = Array.from(document.querySelectorAll("[data-tab-button]"));
const tabPanels = Array.from(document.querySelectorAll("[data-tab-panel]"));

const trustedTokenKey = "remote-mouse-trusted-token";
const sensitivityKey = "remote-mouse-sensitivity";
const touchpadSizeKey = "remote-mouse-touchpad-size";
const sensitivityMin = 0.2;
const sensitivityMax = 4;
const sensitivityDefault = 1.3;
const touchpadSizeMin = 32;
const touchpadSizeMax = 68;
const touchpadSizeDefault = 44;
const touchNoiseThreshold = 0.01;

let socket;
let wsUrl = "";
let lastPoint = null;
let lastTap = 0;
let lastTouchCenter = null;
let authorized = false;
let trustedToken = localStorage.getItem(trustedTokenKey) || "";

bootstrap();

async function bootstrap() {
  const session = await fetch("/api/session").then((response) => response.json());
  wsUrl = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`;
  baseUrl.textContent = session.baseUrl;
  qrImage.src = session.qrDataUrl;
  deviceNameInput.value = getDefaultDeviceName();
  applyStoredSettings();
  lockControls(true);
  setActiveTab(authorized ? "touch" : "settings");
  connect();
}

function connect() {
  if (socket && socket.readyState <= 1) {
    socket.close();
  }

  socket = new WebSocket(wsUrl || `${location.origin.replace(/^http/, "ws")}/ws`);

  socket.addEventListener("open", () => {
    setStatus("已连接，等待配对");
    setPairState(trustedToken ? "正在验证已授权设备" : authorized ? "已配对" : "请输入房间码");
    socket.send(JSON.stringify({
      type: "device-register",
      deviceName: deviceNameInput.value.trim() || getDefaultDeviceName(),
      trustedToken
    }));
  });

  socket.addEventListener("close", () => {
    setStatus("连接已断开");
    lockControls(true);
    if (!authorized) {
      setPairState("连接已断开，请稍后重试");
      setActiveTab("settings");
    }
    setTimeout(() => {
      if (!socket || socket.readyState === WebSocket.CLOSED) {
        connect();
      }
    }, 1600);
  });

  socket.addEventListener("error", () => setStatus("连接异常"));
  socket.addEventListener("message", handleSocketMessage);
}

function handleSocketMessage(event) {
  const payload = JSON.parse(event.data);
  switch (payload.type) {
    case "authorized":
      authorized = true;
      if (payload.trustedToken) {
        trustedToken = payload.trustedToken;
        localStorage.setItem(trustedTokenKey, trustedToken);
      }
      lockControls(false);
      setStatus("已连接并授权");
      setPairState(payload.remembered ? "已识别为已授权设备" : "已授权，可以开始控制");
      setActiveTab("touch");
      return;
    case "pair-pending":
      authorized = false;
      lockControls(true);
      setPairState("已提交，等待电脑端确认");
      setActiveTab("settings");
      return;
    case "pair-rejected":
      authorized = false;
      lockControls(true);
      setPairState("配对被拒绝，请重新申请");
      setActiveTab("settings");
      return;
    case "pair-revoked":
      authorized = false;
      trustedToken = "";
      localStorage.removeItem(trustedTokenKey);
      lockControls(true);
      setStatus("授权已撤销");
      setPairState("电脑端已撤销授权，请重新配对");
      setActiveTab("settings");
      return;
    case "error":
      setPairState(payload.message);
      setActiveTab("settings");
      return;
    default:
      return;
  }
}

function lockControls(locked) {
  for (const panel of controlPanels) {
    panel.classList.toggle("locked", locked);
  }
}

function setStatus(value) {
  statusText.textContent = value;
}

function setPairState(value) {
  pairState.textContent = value;
}

function setActiveTab(tabName) {
  for (const button of tabButtons) {
    button.classList.toggle("active", button.dataset.tabButton === tabName);
  }

  for (const panel of tabPanels) {
    panel.classList.toggle("active", panel.dataset.tabPanel === tabName);
  }
}

function applyStoredSettings() {
  sensitivity.value = String(getClampedNumber(
    localStorage.getItem(sensitivityKey),
    sensitivityMin,
    sensitivityMax,
    sensitivityDefault
  ));

  touchpadSize.value = String(getClampedNumber(
    localStorage.getItem(touchpadSizeKey),
    touchpadSizeMin,
    touchpadSizeMax,
    touchpadSizeDefault
  ));

  updateSensitivityDisplay();
  updateTouchpadSizeDisplay();
}

function updateSensitivityDisplay() {
  const value = `${getSensitivityScale().toFixed(1)}x`;
  sensitivityValue.textContent = value;
  sensitivitySettingValue.textContent = value;
}

function updateTouchpadSizeDisplay() {
  const value = `${getClampedNumber(touchpadSize.value, touchpadSizeMin, touchpadSizeMax, touchpadSizeDefault)}vh`;
  touchpadSizeValue.textContent = value;
  document.documentElement.style.setProperty("--touchpad-height", value);
}

function getSensitivityScale() {
  return getClampedNumber(sensitivity.value, sensitivityMin, sensitivityMax, sensitivityDefault);
}

function getClampedNumber(value, min, max, fallback) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, numericValue));
}

function send(payload) {
  if (!authorized) {
    return;
  }

  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function sendMove(dx, dy) {
  const nextDx = Math.round(dx);
  const nextDy = Math.round(dy);

  if (Math.abs(nextDx) <= touchNoiseThreshold && Math.abs(nextDy) <= touchNoiseThreshold) {
    return;
  }

  send({ type: "move", dx: nextDx, dy: nextDy });
}

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setActiveTab(button.dataset.tabButton);
  });
});

sensitivity.addEventListener("input", () => {
  localStorage.setItem(sensitivityKey, sensitivity.value);
  updateSensitivityDisplay();
});

touchpadSize.addEventListener("input", () => {
  localStorage.setItem(touchpadSizeKey, touchpadSize.value);
  updateTouchpadSizeDisplay();
});

pairButton.addEventListener("click", () => {
  const code = pairCodeInput.value.trim();
  const deviceName = deviceNameInput.value.trim() || getDefaultDeviceName();
  if (code.length !== 6) {
    setPairState("请输入 6 位房间码");
    return;
  }

  if (!socket || socket.readyState !== WebSocket.OPEN) {
    setPairState("连接未就绪，请稍后");
    return;
  }

  authorized = false;
  lockControls(true);
  setActiveTab("settings");
  socket.send(JSON.stringify({ type: "pair-request", code, deviceName }));
});

touchpad.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "touch") {
    return;
  }

  touchpad.setPointerCapture(event.pointerId);
  lastPoint = { x: event.clientX, y: event.clientY };
});

touchpad.addEventListener("pointermove", (event) => {
  if (event.pointerType === "touch") {
    return;
  }

  if (!lastPoint || event.pointerType === "mouse" && event.buttons === 0) {
    return;
  }

  const scale = getSensitivityScale();
  const dx = (event.clientX - lastPoint.x) * scale;
  const dy = (event.clientY - lastPoint.y) * scale;
  lastPoint = { x: event.clientX, y: event.clientY };
  sendMove(dx, dy);
});

touchpad.addEventListener("pointerup", (event) => {
  if (event.pointerType === "touch") {
    return;
  }

  const now = Date.now();
  if (now - lastTap < 260) {
    send({ type: "click", button: "left", double: true });
  }
  lastTap = now;
  lastPoint = null;
  touchpad.releasePointerCapture(event.pointerId);
});

touchpad.addEventListener("touchstart", (event) => {
  event.preventDefault();
  if (event.touches.length === 1) {
    const touch = event.touches[0];
    lastPoint = { x: touch.clientX, y: touch.clientY };
    lastTouchCenter = null;
    return;
  }

  if (event.touches.length === 2) {
    lastTouchCenter = getTouchCenter(event.touches);
    lastPoint = null;
  }
}, { passive: false });

touchpad.addEventListener("touchmove", (event) => {
  event.preventDefault();
  if (event.touches.length === 1 && lastPoint) {
    const touch = event.touches[0];
    const scale = getSensitivityScale();
    const dx = (touch.clientX - lastPoint.x) * scale;
    const dy = (touch.clientY - lastPoint.y) * scale;
    lastPoint = { x: touch.clientX, y: touch.clientY };
    sendMove(dx, dy);
    return;
  }

  if (event.touches.length === 2) {
    const center = getTouchCenter(event.touches);
    if (lastTouchCenter) {
      send({ type: "scroll", dy: Math.round((center.y - lastTouchCenter.y) * 1.6) });
    }
    lastTouchCenter = center;
  }
}, { passive: false });

touchpad.addEventListener("touchend", (event) => {
  if (event.touches.length === 0) {
    lastPoint = null;
    lastTouchCenter = null;
  }
});

touchpad.addEventListener("wheel", (event) => {
  event.preventDefault();
  send({ type: "scroll", dy: Math.round(event.deltaY / 3) });
}, { passive: false });

document.querySelectorAll("[data-click]").forEach((button) => {
  button.addEventListener("click", () => {
    send({
      type: "click",
      button: button.dataset.click,
      double: button.dataset.double === "true"
    });
  });
});

document.querySelectorAll("[data-key]").forEach((button) => {
  button.addEventListener("click", () => {
    send({ type: "key", key: button.dataset.key });
  });
});

sendTextButton.addEventListener("click", () => {
  const text = textInput.value;
  if (!text.length) {
    return;
  }
  send({ type: "type", text });
  textInput.value = "";
});

reconnectButton.addEventListener("click", connect);

function getTouchCenter(touches) {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2
  };
}

function getDefaultDeviceName() {
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
    return "iPhone";
  }
  if (/android/i.test(navigator.userAgent)) {
    return "Android";
  }
  return "Phone";
}
