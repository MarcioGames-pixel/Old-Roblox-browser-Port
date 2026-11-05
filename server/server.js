import { WebSocketServer } from "ws";
const wss = new WebSocketServer({ host: "0.0.0.0", port: Number(process.env.PORT || 3001) });
wss.on("connection", socket => {
  socket.on("message", raw => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }
    if (message.type === "ping") socket.send(JSON.stringify({ type: "pong" }));
  });
});
console.log("Multiplayer WebSocket server listening on port 3001");
