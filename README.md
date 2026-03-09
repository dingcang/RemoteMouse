# Remote Mouse

[中文说明](./README.zh-CN.md)

Turn your phone into a LAN touchpad and keyboard for your computer.

Remote Mouse starts a local web server, shows a QR code in the terminal, and lets a phone open a control page on the same network. Mouse movement, clicks, scroll, and text input are sent over WebSocket and executed on the host machine.

## Features

- QR-code entry for fast phone access on the local network
- Mobile touchpad UI with left click, right click, double click, and scroll
- Text input and quick keys for `Enter`, `Tab`, and `Backspace`
- 6-digit room code plus local host approval before control is allowed
- Local-only host dashboard for approving, rejecting, and revoking devices
- Automated tests for pairing flow and input authorization

## Requirements

- Node.js 22+
- Phone and computer on the same LAN
- macOS users must grant Accessibility permission to the terminal app or Node.js

## Quick Start

```bash
npm install
npm start
```

After startup, the terminal prints:

- the LAN URL
- the QR code
- the 6-digit pair code
- the host dashboard URL

## How To Use

### 1. Start the server

```bash
npm start
```

If port `3000` is occupied, start on another port:

```bash
PORT=3001 npm start
```

### 2. Open the host dashboard on the computer

Default address:

```text
http://127.0.0.1:3000/host
```

This page is only available on the computer running the server.

### 3. Open the mobile controller

- Scan the QR code from the terminal, or
- open the LAN URL printed in the terminal on your phone browser

### 4. Pair the phone

- Enter the 6-digit pair code shown in the terminal or host dashboard
- Tap `发起配对` on the phone
- Click `允许` on the computer host dashboard

After approval, the phone can control the mouse and keyboard.

### 5. Revoke a device if needed

From the host dashboard, click `撤销授权` next to any approved device.

## Controls

- Single-finger drag: move cursor
- Double tap: double click
- Two-finger vertical move: scroll
- Buttons: left click, right click, double click
- Text box: send text to the current focused app on the host

## Testing

Run the automated test suite:

```bash
npm test
```

Current tests cover:

- relative mouse movement behavior
- screen-bound clamping
- blocking unauthorized control actions
- approval flow from host dashboard
- revoking an approved device

## Project Structure

```text
server.js              Web server, websocket handling, pairing, input control
public/index.html      Mobile controller page
public/app.js          Mobile controller behavior
public/host.html       Local host approval dashboard
public/host.js         Host dashboard behavior
public/styles.css      Shared UI styles
test/                  Automated tests
```

## Notes

- Remote control works by driving the host OS input APIs, so local manual mouse movement can still override the cursor position.
- The server now uses instant position updates instead of animated cursor movement to reduce fighting with the local trackpad.
- If startup fails with `EADDRINUSE`, another process is already using that port.

## Roadmap Ideas

- shortcut combinations such as `Cmd+C` and `Cmd+V`
- media keys and volume control
- device activity timestamps and one-click disconnect all
