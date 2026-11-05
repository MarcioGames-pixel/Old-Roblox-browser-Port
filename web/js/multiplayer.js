(function () {
"use strict";

class MultiplayerClient {
  constructor() {
    this.socket=null;
    this.scene=null;
    this.world=null;
    this.ui=null;
    this.id=null;
    this.remotes=new Map();
    this.lastSent=0;
    this.connected=false;
    this.zeroMove=new THREE.Vector3();
  }

  connect(options) {
    this.disconnect();
    this.scene=options.scene;
    this.world=options.world;
    this.ui=options.ui;

    const query=new URLSearchParams(location.search);
    let url=query.get("ws");
    if (!url && location.protocol!=="file:") {
      const protocol=location.protocol==="https:" ? "wss:" : "ws:";
      url=protocol+"//"+location.hostname+":3001";
    }
    if (!url) {
      this.ui.notify("Multiplayer: configure ?ws=ws://HOST:3001");
      return false;
    }

    let ws;
    try { ws=new WebSocket(url); }
    catch(e) {
      this.ui.notify("WebSocket: "+e.message);
      return false;
    }

    this.socket=ws;
    ws.addEventListener("open",()=>{
      ws.send(JSON.stringify({
        type:"join",
        placeId:options.placeId,
        roomId:query.get("room")||options.placeId,
        name:options.name
      }));
    });
    ws.addEventListener("message",e=>{
      let m;
      try { m=JSON.parse(e.data); } catch { return; }
      this.handle(m);
    });
    ws.addEventListener("close",()=>{
      this.connected=false;
      this.clearRemotes();
      if(this.ui)this.ui.notify("Multiplayer disconnected.");
    });
    ws.addEventListener("error",()=>{
      if(this.ui)this.ui.notify("WebSocket connection error.");
    });
    return true;
  }

  makeTarget(data) {
    const v=data.velocity||{};
    return {
      x:Number.isFinite(data.x)?data.x:0,
      y:Number.isFinite(data.y)?data.y:100,
      z:Number.isFinite(data.z)?data.z:0,
      yaw:Number.isFinite(data.yaw)?data.yaw:0,
      vx:Number.isFinite(v.x)?v.x:0,
      vy:Number.isFinite(v.y)?v.y:0,
      vz:Number.isFinite(v.z)?v.z:0,
      onGround:data.onGround===true,
      climbing:data.climbing===true,
      alive:data.alive!==false
    };
  }

  handle(m) {
    if(m.type==="welcome") {
      this.id=m.id;
      this.connected=true;
      (m.players||[]).forEach(p=>this.addRemote(p));
      if(this.ui)this.ui.notify("Online: connected to room "+m.roomId);
    } else if(m.type==="player_joined") {
      this.addRemote(m.player);
      if(this.ui)this.ui.chat((m.player.name||"Player")+" joined.",null,"#ffff00");
    } else if(m.type==="player_left") {
      this.removeRemote(m.id);
    } else if(m.type==="player_state") {
      const r=this.remotes.get(m.id);
      if(r)r.target=this.makeTarget(m);
    } else if(m.type==="chat") {
      if(this.ui)this.ui.chat(m.text,m.name||"Player");
    } else if(m.type==="error") {
      if(this.ui)this.ui.notify(m.message||"Multiplayer error");
    }
  }

  async addRemote(data) {
    if(!data||!data.id||this.remotes.has(data.id))return;
    const c=new window.RBLXcharacter.Character(this.scene,this.world,data.name||"Player");
    const target=this.makeTarget(data);
    c.group.position.set(target.x,target.y,target.z);
    c.group.rotation.y=target.yaw;
    c.onGround=target.onGround;
    c.climbing=target.climbing;
    c.alive=target.alive;
    c.velocity.set(target.vx,target.vy,target.vz);
    const remote={character:c,target};
    this.remotes.set(data.id,remote);
    try {
      await c.load();
      if(!this.remotes.has(data.id))this.scene.remove(c.group);
    } catch(e) {
      console.warn("Remote avatar failed",e);
      this.removeRemote(data.id);
    }
  }

  removeRemote(id) {
    const r=this.remotes.get(id);
    if(!r)return;
    this.scene.remove(r.character.group);
    this.remotes.delete(id);
  }

  clearRemotes() {
    for(const id of this.remotes.keys())this.removeRemote(id);
  }

  sendState(character,yaw,controller) {
    if(!this.connected||!character||!this.socket||this.socket.readyState!==WebSocket.OPEN)return;
    const now=performance.now();
    if(now-this.lastSent<50)return;
    this.lastSent=now;

    const p=character.group.position;
    const v=character.velocity;
    this.socket.send(JSON.stringify({
      type:"state",
      position:{x:p.x,y:p.y,z:p.z},
      velocity:{x:v.x,y:v.y,z:v.z},
      yaw:Number.isFinite(yaw)?yaw:character.group.rotation.y,
      onGround:!!(controller?controller.onGround:character.onGround),
      climbing:!!(controller?controller.climbing:character.climbing),
      alive:character.alive!==false
    }));
  }

  sendChat(text) {
    if(!this.connected||!this.socket||this.socket.readyState!==WebSocket.OPEN)return false;
    this.socket.send(JSON.stringify({type:"chat",text:String(text).slice(0,100)}));
    return true;
  }

  update(dt) {
    const a=Math.min(1,dt*12);
    for(const r of this.remotes.values()) {
      const c=r.character;
      const p=c.group.position;
      const t=r.target;
      p.x+=(t.x-p.x)*a;
      p.y+=(t.y-p.y)*a;
      p.z+=(t.z-p.z)*a;
      const d=Math.atan2(Math.sin(t.yaw-c.group.rotation.y),Math.cos(t.yaw-c.group.rotation.y));
      c.group.rotation.y+=d*a;
      c.velocity.set(t.vx,t.vy,t.vz);
      c.onGround=t.onGround;
      c.climbing=t.climbing;
      c.alive=t.alive;
      c.step(dt,{moveDir:this.zeroMove,jump:false});
    }
  }

  disconnect() {
    if(this.socket) {
      this.socket.close();
      this.socket=null;
    }
    this.connected=false;
    this.id=null;
    this.clearRemotes();
  }
}
window.RBLXmultiplayer=MultiplayerClient;
})();
