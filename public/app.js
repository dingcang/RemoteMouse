const statusText = document.getElementById("statusText");
const baseUrl = document.getElementById("baseUrl");
const qrImage = document.getElementById("qrImage");
const touchpad = document.getElementById("touchpad");
const fullscreenToggle = document.getElementById("fullscreenToggle");
const gravityToggle = document.getElementById("gravityToggle");
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
const touchPanel = document.querySelector('[data-tab-panel="touch"]');

const trustedTokenKey = "remote-mouse-trusted-token";
const sensitivityKey = "remote-mouse-sensitivity";
const touchpadSizeKey = "remote-mouse-touchpad-size";
const fullscreenStateKey = "remote-mouse-fullscreen";
const sensitivityMin = 0.2;
const sensitivityMax = 4;
const sensitivityDefault = 1.3;
const touchpadSizeMin = 32;
const touchpadSizeMax = 68;
const touchpadSizeDefault = 44;

let socket;
let wsUrl = "";
let lastPoint = null;
let lastTap = 0;
let lastTouchCenter = null;
let authorized = false;
let trustedToken = localStorage.getItem(trustedTokenKey) || "";
let pointerRemainder = { x: 0, y: 0 };
let gravityLocked = false;
let fullscreenFallbackActive = localStorage.getItem(fullscreenStateKey) === "true";

bootstrap();

async function bootstrap() {
  const session = await fetch("/api/session").then((response) => response.json());
  wsUrl = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`;
  baseUrl.textContent = session.baseUrl;
  qrImage.src = session.qrDataUrl;
  deviceNameInput.value = getDefaultDeviceName();
  applyStoredSettings();
  updateFullscreenState();
  updateGravityControls();
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

function updateFullscreenState() {
  const fullscreenActive = isTouchPanelFullscreen();
  document.body.classList.toggle("touch-fullscreen", fullscreenActive);
  localStorage.setItem(fullscreenStateKey, String(fullscreenActive));
  fullscreenToggle.classList.toggle("active", fullscreenActive);
  fullscreenToggle.setAttribute("aria-label", fullscreenActive ? "退出全屏" : "进入全屏");
  fullscreenToggle.title = fullscreenActive ? "退出全屏" : "进入全屏";

  if (!fullscreenActive && gravityLocked) {
    unlockGravity();
  }

  updateGravityControls();
}

function updateGravityControls() {
  const fullscreenActive = isTouchPanelFullscreen();
  gravityToggle.disabled = !fullscreenActive;
  gravityToggle.classList.toggle("active", gravityLocked && fullscreenActive);
  gravityToggle.setAttribute("aria-label", gravityLocked ? "解锁触控区" : "锁定触控区");
  gravityToggle.title = gravityLocked ? "解锁触控区" : "锁定触控区";
  touchpad.classList.toggle("touchpad-locked", gravityLocked && fullscreenActive);
}

function isTouchPanelFullscreen() {
  return fullscreenFallbackActive
    || document.fullscreenElement === touchPanel
    || document.webkitFullscreenElement === touchPanel;
}

async function toggleFullscreen() {
  if (isTouchPanelFullscreen()) {
    await exitFullscreen();
    return;
  }

  await enterFullscreen();
}

async function enterFullscreen() {
  try {
    if (touchPanel.requestFullscreen) {
      await touchPanel.requestFullscreen();
      fullscreenFallbackActive = false;
      updateFullscreenState();
      return;
    }

    if (touchPanel.webkitRequestFullscreen) {
      touchPanel.webkitRequestFullscreen();
      fullscreenFallbackActive = false;
      updateFullscreenState();
      return;
    }
  } catch (_error) {
    fullscreenToggle.title = "当前浏览器不支持原生全屏，已切换为全屏布局";
  }

  fullscreenFallbackActive = true;
  updateFullscreenState();
  updateGravityControls();
}

async function exitFullscreen() {
  try {
    if (document.exitFullscreen) {
      await document.exitFullscreen();
      fullscreenFallbackActive = false;
      updateFullscreenState();
      return;
    }

    if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
      fullscreenFallbackActive = false;
      updateFullscreenState();
      return;
    }
  } catch (_error) {
    fullscreenToggle.title = "已退出原生全屏，保留布局回退";
  }

  fullscreenFallbackActive = false;
  updateFullscreenState();
  updateGravityControls();
}

async function toggleGravityLock() {
  if (!isTouchPanelFullscreen()) {
    return;
  }

  if (gravityLocked) {
    unlockGravity();
    return;
  }

  lockGravity();
}

function unlockGravity() {
  gravityLocked = false;
  updateGravityControls();
}

function lockGravity() {
  gravityLocked = true;
  lastPoint = null;
  lastTouchCenter = null;
  pointerRemainder = { x: 0, y: 0 };
  updateGravityControls();
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
  if (!authorized || isTouchpadInteractionLocked()) {
    return;
  }

  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function sendMove(dx, dy, remainder = pointerRemainder) {
  remainder.x += dx;
  remainder.y += dy;

  const nextDx = takeWholePixels(remainder.x);
  const nextDy = takeWholePixels(remainder.y);

  remainder.x -= nextDx;
  remainder.y -= nextDy;

  if (nextDx === 0 && nextDy === 0) {
    return;
  }

  send({ type: "move", dx: nextDx, dy: nextDy });
}

function isTouchpadInteractionLocked() {
  return gravityLocked && isTouchPanelFullscreen();
}

function takeWholePixels(value) {
  if (value > 0) {
    return Math.floor(value);
  }

  if (value < 0) {
    return Math.ceil(value);
  }

  return 0;
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
  if (isTouchpadInteractionLocked()) {
    return;
  }

  if (event.pointerType === "touch") {
    return;
  }

  touchpad.setPointerCapture(event.pointerId);
  lastPoint = { x: event.clientX, y: event.clientY };
});

touchpad.addEventListener("pointermove", (event) => {
  if (isTouchpadInteractionLocked()) {
    return;
  }

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
  sendMove(dx, dy, pointerRemainder);
});

touchpad.addEventListener("pointerup", (event) => {
  if (isTouchpadInteractionLocked()) {
    return;
  }

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
  if (isTouchpadInteractionLocked()) {
    return;
  }

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
  if (isTouchpadInteractionLocked()) {
    return;
  }

  event.preventDefault();
  if (event.touches.length === 1 && lastPoint) {
    const touch = event.touches[0];
    const scale = getSensitivityScale();
    const dx = (touch.clientX - lastPoint.x) * scale;
    const dy = (touch.clientY - lastPoint.y) * scale;
    lastPoint = { x: touch.clientX, y: touch.clientY };
    sendMove(dx, dy, pointerRemainder);
    return;
  }

  if (event.touches.length === 2) {
    const center = getTouchCenter(event.touches);
    if (lastTouchCenter) {
      const scale = getSensitivityScale();
      const dx = (center.x - lastTouchCenter.x) * scale;
      const dy = (center.y - lastTouchCenter.y) * scale;
      send({
        type: "scroll",
        dx: Math.abs(dx) > Math.abs(dy) ? Math.round(dx * 1.6) : 0,
        dy: Math.abs(dx) > Math.abs(dy) ? 0 : Math.round(dy * 1.6)
      });
    }
    lastTouchCenter = center;
  }
}, { passive: false });

touchpad.addEventListener("touchend", (event) => {
  if (isTouchpadInteractionLocked()) {
    return;
  }

  if (event.touches.length === 0) {
    lastPoint = null;
    lastTouchCenter = null;
  }
});

touchpad.addEventListener("wheel", (event) => {
  if (isTouchpadInteractionLocked()) {
    return;
  }

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
fullscreenToggle.addEventListener("click", toggleFullscreen);
gravityToggle.addEventListener("click", toggleGravityLock);

document.addEventListener("fullscreenchange", () => {
  updateFullscreenState();
  updateGravityControls();
});

document.addEventListener("webkitfullscreenchange", () => {
  updateFullscreenState();
  updateGravityControls();
});

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
