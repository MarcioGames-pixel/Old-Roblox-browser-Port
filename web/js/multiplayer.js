(function () {
"use strict";

class MultiplayerClient {
  constructor() { this.socket=null; this.scene=null; this.world=null; this.ui=null; this.id=null; this.remotes=new Map(); this.lastSent=0; this.connected=false; }

  connect(options) {
    this.disconnect();
    this.scene=options.scene; this.world=options.world; this.ui=options.ui;
    const query=new URLSearchParams(location.search);
    const url=query.get("ws") || (location.protocol==="file:" ? "" : (location.protocol==="https:"?"wss:":"ws:")+"//"+location.host+"/ws");
    if (!url) { this.ui.notify("Multiplayer: use ?ws=ws://HOST:3001"); return false; }
    let ws;
    try { ws=new WebSocket(url); } catch(e) { this.ui.notify("WebSocket: "+e.message); return false; }
    this.socket=ws;
    ws.addEventListener("open",()=>ws.send(JSON.stringify({type:"join",placeId:options.placeId,roomId:query.get("room")||options.placeId,name:options.name})));
    ws.addEventListener("message",e=>{ let m; try { m=JSON.parse(e.data); } catch { return; } this.handle(m); });
    ws.addEventListener("close",()=>{ this.connected=false; this.clearRemotes(); if(this.ui)this.ui.notify("Multiplayer disconnected."); });
    ws.addEventListener("error",()=>this.ui.notify("WebSocket connection error."));
    return true;
  }

  handle(m) {
    if(m.type==="welcome") { this.id=m.id; this.connected=true; (m.players||[]).forEach(p=>this.addRemote(p)); this.ui.notify("Online: connected to room "+m.roomId); }
    else if(m.type==="player_joined") { this.addRemote(m.player); this.ui.chat((m.player.name||"Player")+" joined.",null,"#ffff00"); }
    else if(m.type==="player_left") this.removeRemote(m.id);
    else if(m.type==="player_state") { const r=this.remotes.get(m.id); if(r)r.target={x:m.x,y:m.y,z:m.z,yaw:m.yaw}; }
    else if(m.type==="chat") this.ui.chat(m.text,m.name||"Player");
    else if(m.type==="error") this.ui.notify(m.message||"Multiplayer error");
  }

  async addRemote(data) {
    if(!data||!data.id||this.remotes.has(data.id))return;
    const c=new window.RBLXcharacter.Character(this.scene,this.world,data.name||"Player");
    c.group.position.set(data.x||0,data.y||100,data.z||0);
    c.group.rotation.y=data.yaw||0;
    this.remotes.set(data.id,{character:c,target:{x:c.group.position.x,y:c.group.position.y,z:c.group.position.z,yaw:c.group.rotation.y}});
    try { await c.load(); if(!this.remotes.has(data.id))this.scene.remove(c.group); }
    catch(e) { console.warn("Remote avatar failed",e); this.removeRemote(data.id); }
  }

  removeRemote(id) { const r=this.remotes.get(id); if(!r)return; this.scene.remove(r.character.group); this.remotes.delete(id); }
  clearRemotes() { for(const id of this.remotes.keys())this.removeRemote(id); }

  sendState(character,yaw) {
    if(!this.connected||!character||!this.socket||this.socket.readyState!==WebSocket.OPEN)return;
    const now=performance.now(); if(now-this.lastSent<50)return; this.lastSent=now;
    const p=character.group.position;
    this.socket.send(JSON.stringify({type:"state",position:{x:p.x,y:p.y,z:p.z},yaw:yaw||0}));
  }

  sendChat(text) {
    if(!this.connected||!this.socket||this.socket.readyState!==WebSocket.OPEN)return false;
    this.socket.send(JSON.stringify({type:"chat",text:String(text).slice(0,100)})); return true;
  }

  update(dt) {
    const a=Math.min(1,dt*12);
    for(const r of this.remotes.values()) {
      const p=r.character.group.position,t=r.target;
      p.x+=(t.x-p.x)*a; p.y+=(t.y-p.y)*a; p.z+=(t.z-p.z)*a;
      const d=Math.atan2(Math.sin(t.yaw-r.character.group.rotation.y),Math.cos(t.yaw-r.character.group.rotation.y));
      r.character.group.rotation.y+=d*a;
      r.character.step(dt,{moveDir:new THREE.Vector3(),jump:false});
    }
  }

  disconnect() {
    if(this.socket){this.socket.close();this.socket=null;}
    this.connected=false; this.id=null; this.clearRemotes();
  }
}
window.RBLXmultiplayer=MultiplayerClient;
})();
