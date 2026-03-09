# Remote Mouse

Use your phone as a LAN touchpad and keyboard for your computer.

## Features

- Start a local web server and print a QR code in the terminal.
- Open the LAN URL on a phone to get a touchpad-style controller page.
- Require a 6-digit room code and local host approval before control starts.
- Send mouse move, click, scroll, and text input events over WebSocket.
- Drive the host machine with `@nut-tree-fork/nut-js`.

## Run

```bash
npm install
npm start
```

Then scan the terminal QR code or open the LAN URL shown in the console.

Open `http://127.0.0.1:3000/host` on the computer running the server to review pairing requests.

## Notes

- Phone and computer must be on the same local network.
- Pairing requires both the terminal room code and approval from the local host dashboard.
- On macOS, grant Accessibility permission to your terminal app or Node.js so mouse and keyboard control can work.
- Default port is `3000`. Override it with `PORT=4000 npm start` if needed.
