import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";

const rooms = new Map();
const clients = new Map();
const wss = new WebSocketServer({
  host: "0.0.0.0",
  port: Number(process.env.PORT || 3001),
  maxPayload: 4096,
  perMessageDeflate: false
});

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

function clean(value, max) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}

function finiteVector(v, limit) {
  return !!v && [v.x,v.y,v.z].every(n => Number.isFinite(n) && Math.abs(n) <= limit);
}

function publicPlayer(p) {
  return {
    id:p.id,
    name:p.name,
    x:p.x,
    y:p.y,
    z:p.z,
    yaw:p.yaw,
    velocity:p.velocity,
    onGround:p.onGround,
    climbing:p.climbing,
    alive:p.alive
  };
}

function broadcast(room, data, except) {
  const packet = JSON.stringify(data);
  for (const p of room.players.values()) {
    if (p.ws !== except && p.ws.readyState === WebSocket.OPEN) p.ws.send(packet);
  }
}

function leave(ws) {
  const state = clients.get(ws);
  if (!state) return;
  clients.delete(ws);
  const room = rooms.get(state.room);
  if (!room) return;
  room.players.delete(state.id);
  broadcast(room, { type:"player_left", id:state.id });
  if (!room.players.size) rooms.delete(state.room);
}

wss.on("connection", ws => {
  const state = { id:randomUUID(), room:null, lastState:0, lastChat:0 };
  clients.set(ws,state);

  ws.on("message", raw => {
    let m;
    try { m=JSON.parse(raw.toString()); } catch { return; }
    if (!m || typeof m.type!=="string") return;

    if (m.type==="join" && !state.room) {
      const place=clean(m.placeId,80)||"Crossroads";
      const roomId=clean(m.roomId,100)||place;
      let room=rooms.get(roomId);
      if (!room) rooms.set(roomId,room={place,players:new Map()});
      if (room.place!==place || room.players.size>=20) {
        send(ws,{type:"error",message:"Sala cheia ou mapa incompatível."});
        return;
      }

      state.room=roomId;
      const player={
        id:state.id,
        name:clean(m.name,20)||"Player",
        x:0,y:100,z:0,yaw:0,
        velocity:{x:0,y:0,z:0},
        onGround:false,
        climbing:false,
        alive:true,
        ws
      };
      room.players.set(state.id,player);
      send(ws,{
        type:"welcome",
        id:state.id,
        roomId,
        players:[...room.players.values()]
          .filter(p=>p.id!==state.id)
          .map(publicPlayer)
      });
      broadcast(room,{type:"player_joined",player:publicPlayer(player)},ws);
      return;
    }

    const room=state.room&&rooms.get(state.room);
    const player=room&&room.players.get(state.id);
    if (!player) return;

    if (m.type==="state") {
      const now=Date.now();
      if (now-state.lastState<50) return;
      state.lastState=now;

      const p=m.position;
      const v=m.velocity||{x:0,y:0,z:0};
      if (!finiteVector(p,100000) || !finiteVector(v,1000) ||
          !Number.isFinite(m.yaw) || Math.abs(m.yaw)>1000) return;

      player.x=p.x;
      player.y=p.y;
      player.z=p.z;
      player.yaw=m.yaw;
      player.velocity={x:v.x,y:v.y,z:v.z};
      player.onGround=m.onGround===true;
      player.climbing=m.climbing===true;
      player.alive=m.alive!==false;

      broadcast(room,{
        type:"player_state",
        id:player.id,
        x:player.x,y:player.y,z:player.z,
        yaw:player.yaw,
        velocity:player.velocity,
        onGround:player.onGround,
        climbing:player.climbing,
        alive:player.alive
      },ws);
    } else if (m.type==="chat") {
      const now=Date.now();
      if (now-state.lastChat<500) return;
      state.lastChat=now;
      const text=clean(m.text,100);
      if (text) broadcast(room,{
        type:"chat",
        id:player.id,
        name:player.name,
        text
      });
    }
  });

  ws.on("close",()=>leave(ws));
  ws.on("error",()=>leave(ws));
});

console.log("Browser multiplayer listening on ws://0.0.0.0:"+(process.env.PORT||3001));
