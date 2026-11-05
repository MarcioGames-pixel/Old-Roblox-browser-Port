# Multiplayer server (experimental)

This is a separate WebSocket service for the browser port. It uses a custom JSON protocol; it is not compatible with original Roblox 2007/2008 servers.

## Start

```sh
cd server
npm install
npm start
```

The service listens on port 3001. For local testing, open the browser client with `?ws=ws://YOUR-LAN-IP:3001&room=Crossroads`. Both players must use the same room and map. On HTTPS pages, use `wss://` (plain `ws://` is blocked by browsers).

## Current milestone

Room join/leave, remote R6 avatars, transform relay (20 updates/second), and room chat. The server limits payload size, room capacity, state frequency, and chat frequency.

This is an experimental relay, not authoritative physics. Do not expose it as a public service or connect real account sessions until short-lived website-issued tickets, authentication, server-side movement validation, and abuse controls are added. The browser client defaults to the same host at `/ws`; configure a reverse proxy from `/ws` to `127.0.0.1:3001`, or pass `?ws=wss://your-host/ws`.
