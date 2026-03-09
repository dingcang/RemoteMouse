const hostStatus = document.getElementById("hostStatus");
const hostBaseUrl = document.getElementById("hostBaseUrl");
const hostQrImage = document.getElementById("hostQrImage");
const pairCode = document.getElementById("pairCode");
const pendingList = document.getElementById("pendingList");
const approvedList = document.getElementById("approvedList");

let socket;

bootstrap();

async function bootstrap() {
  const session = await fetch("/api/host-session").then((response) => response.json());
  hostBaseUrl.textContent = session.baseUrl;
  hostQrImage.src = session.qrDataUrl;
  pairCode.textContent = session.pairCode;
  renderDevices(pendingList, session.pending, "pending");
  renderDevices(approvedList, session.approved, "approved");
  connect();
}

function connect() {
  socket = new WebSocket(`${location.origin.replace(/^http/, "ws")}/ws`);
  socket.addEventListener("open", () => {
    hostStatus.textContent = "等待配对";
    socket.send(JSON.stringify({ type: "host-register" }));
  });
  socket.addEventListener("close", () => {
    hostStatus.textContent = "已断开";
    setTimeout(connect, 1200);
  });
  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === "host-state") {
      pairCode.textContent = payload.pairCode;
      renderDevices(pendingList, payload.pending, "pending");
      renderDevices(approvedList, payload.approved, "approved");
    }
  });
}

function renderDevices(container, devices, mode) {
  container.innerHTML = "";
  if (!devices.length) {
    container.innerHTML = '<p class="empty-state">暂无设备</p>';
    return;
  }

  for (const device of devices) {
    const row = document.createElement("div");
    row.className = "device-row";
    row.innerHTML = `<div><strong>${escapeHtml(device.deviceName)}</strong><p>${device.id.slice(0, 8)}</p></div>`;

    if (mode === "pending") {
      const actions = document.createElement("div");
      actions.className = "device-actions";
      actions.innerHTML = `
        <button data-approve="${device.id}">允许</button>
        <button class="ghost" data-reject="${device.id}">拒绝</button>
      `;
      row.appendChild(actions);
    }

    if (mode === "approved") {
      const actions = document.createElement("div");
      actions.className = "device-actions";
      actions.innerHTML = `
        <button class="ghost" data-revoke="${device.id}">撤销授权</button>
      `;
      row.appendChild(actions);
    }

    container.appendChild(row);
  }
}

document.addEventListener("click", (event) => {
  const approveId = event.target.dataset.approve;
  const rejectId = event.target.dataset.reject;
  const revokeId = event.target.dataset.revoke;
  if (approveId) {
    socket.send(JSON.stringify({ type: "pair-approve", clientId: approveId }));
  }
  if (rejectId) {
    socket.send(JSON.stringify({ type: "pair-reject", clientId: rejectId }));
  }
  if (revokeId) {
    socket.send(JSON.stringify({ type: "pair-revoke", clientId: revokeId }));
  }
});

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
