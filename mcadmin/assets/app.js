// ═══ STATE ═════════════════════════════════════════════════
// Globales Zustandsobjekt: Server-Info, Packs, Konsolen-Einstellungen und aktive Welten
const G={
  srv:{running:false,version:'',active_world:'',players:[]},
  ver:null,packs:{behavior:[],resource:[]},wPacks:{behavior:[],resource:[]},
  propsWorld:null,propsData:{},
  conPaused:false,conTimer:null,conActive:false,conHist:[],conHistIdx:-1,conLines:100,
  srvWasRunning:false,
};

// ═══ API ══════════════════════════════════════════════════
// Sendet einen POST-Request an handler.php und gibt das JSON-Ergebnis zurück
async function api(action,data={},files={}){
  const fd=new FormData();fd.append('action',action);
  for(const[k,v]of Object.entries(data))fd.append(k,v);
  for(const[k,v]of Object.entries(files))fd.append(k,v);
  const r=await fetch('api/handler.php',{method:'POST',body:fd});
  if(!r.ok)throw new Error(`HTTP ${r.status}`);
  return r.json();
}


// ═══ THEME / DARSTELLUNG ═══════════════════════════════════
// Schaltet zwischen Dunkelmodus (Standard) und Hellmodus.
// Die Auswahl wird nur im Browser gespeichert, damit serverseitig nichts geändert werden muss.
function getTheme(){
  try{return localStorage.getItem('mcadmin_theme') || 'dark';}
  catch(e){return 'dark';}
}
function setTheme(theme){
  const t = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  try{localStorage.setItem('mcadmin_theme', t);}catch(e){}
  updateThemeButtons(t);
}
function toggleTheme(){
  setTheme(getTheme() === 'light' ? 'dark' : 'light');
}
function updateThemeButtons(theme=getTheme()){
  const isLight = theme === 'light';
  const topBtn = document.getElementById('theme-toggle');
  if(topBtn){
    topBtn.textContent = isLight ? '☀️' : '🌙';
    topBtn.title = isLight ? 'Hellmodus aktiv — auf Dunkel wechseln' : 'Dunkelmodus aktiv — auf Hell wechseln';
    topBtn.setAttribute('aria-label', topBtn.title);
  }
}

// ═══ TOAST ════════════════════════════════════════════════
// Zeigt eine temporäre Toast-Benachrichtigung (success/error/info/warn)
function toast(msg,type='info',ms=3500){
  const ic={success:'✅',error:'❌',info:'ℹ️',warn:'⚠️'};
  const cls={success:'ts-ok',error:'ts-er',info:'ts-in',warn:'ts-wn'};
  const el=document.createElement('div');
  el.className=`toast ${cls[type]||'ts-in'}`;
  el.innerHTML=`<span>${ic[type]||'•'}</span><span>${e(msg)}</span>`;
  document.getElementById('tc').appendChild(el);
  setTimeout(()=>{el.classList.add('hide');setTimeout(()=>el.remove(),260);},ms);
}

// ═══ NAVIGATION ═══════════════════════════════════════════
// Seitentitel-Mapping für die Navigation
const PT={dashboard:'Übersicht',
  worlds:'Welten',packs:'Packs',stats:'Spieler-Statistiken',whitelist:'Whitelist',settings:'Einstellungen'};
// Wechselt zur angegebenen Seite und lädt deren Daten
function showPage(page,el){
  G.tab=page;
  document.querySelectorAll('.pc2').forEach(p=>p.classList.add('hidden'));
  document.querySelectorAll('.ni').forEach(n=>n.classList.remove('active'));
  document.getElementById('page-'+page).classList.remove('hidden');
  if(el)el.classList.add('active');
  closeSidebar();
  document.getElementById('page-title').textContent=PT[page]||page;
  if(page==='worlds')loadWorlds();
  if(page==='packs'){loadWorldsForPacks();loadAllPacks();}
  if(page==='whitelist')loadWl();
  if(page==='stats')loadStats();
  if(page==='settings')loadSettings();
  if(page==='dashboard')startCon();else stopCon();
}

// ═══ STATUS ═══════════════════════════════════════════════
// Fragt den Server-Status ab und aktualisiert alle Status-Elemente im Dashboard (inkl. Uptime)
async function refreshStatus(){
  try{
    const s=await api('status');G.srv=s;
    const tb=document.getElementById('tb-status');const ds=document.getElementById('d-status');
    if(s.running){tb.className='sb on';tb.innerHTML='<span class="dot"></span> Online';ds.innerHTML='<span class="tg">Online</span>';}
    else{tb.className='sb off';tb.innerHTML='<span class="dot"></span> Offline';ds.innerHTML='<span class="tr">Offline</span>';}
    document.getElementById('d-ver').textContent='v'+(s.version||'?');
    const upEl=document.getElementById('d-uptime');if(upEl)upEl.textContent=s.uptime?'⏱ '+s.uptime:'';
    document.getElementById('d-world').textContent=s.active_world||'keine';
    document.getElementById('d-players').textContent=s.players.length;
    document.getElementById('d-pcnt').textContent=s.players.length+' online';
    document.getElementById('tb-world').textContent=s.active_world?'🌍 '+s.active_world:'';
    renderPlayers(s.players);
    if(s.running&&!G.srvWasRunning&&G.tab==='worlds')loadWorlds();
    G.srvWasRunning=s.running;
  }catch(e){}
}

// Rendert die Online-Spieler-Liste mit Aktions-Buttons (OP, Kick, Whitelist)
function renderPlayers(pl){
  const el=document.getElementById('d-plist');
  if(!pl.length){el.innerHTML='<div class="dim xs2" style="text-align:center;padding:18px">Keine Spieler online</div>';resizeCon();return;}
  el.innerHTML=pl.map(p=>{
    const opBtn=p.is_op
      ?`<button class="btn success xs" onclick="deopP('${e(p.name)}')" title="OP entfernen">⭐ OP</button>`
      :`<button class="btn ghost xs" onclick="opP('${e(p.name)}')" title="Zum OP machen">OP</button>`;
    return`<div class="pc">
      <div class="pav"><svg width="36" height="36" style="image-rendering:pixelated"><use href="#mc-steve"/></svg></div>
      <div style="flex:1;min-width:0"><div class="pn">${e(p.name)}</div><div class="px">${e(p.xuid||'XUID unbekannt')}</div></div>
      <div class="pact">
        ${opBtn}
        ${p.is_whitelisted?`<button class="btn success xs" onclick="wlAdd('${e(p.name)}')" title="Bereits in der Whitelist">📋 WL</button>`:`<button class="btn ghost xs" onclick="wlAdd('${e(p.name)}')" title="Zur Whitelist hinzufügen">📋 WL+</button>`}
        <button class="btn danger xs" onclick="kickP('${e(p.name)}')">🚫 Kick</button>
      </div>
    </div>`;
  }).join('');
  resizeCon();
}

// Führt eine Server-Aktion aus (start/stop/restart) und aktualisiert den Status
async function srvAction(a){
  const l={start:'gestartet',stop:'gestoppt',restart:'neu gestartet'}[a];
  const r=await api('server_'+a);
  toast(r.success?`Server wird ${l}...`:(r.output||'Fehler'),r.success?'success':'error');
  setTimeout(refreshStatus,2500);
}

// ═══ PLAYER ACTIONS ════════════════════════════════════════
// Erteilt einem Spieler OP-Rechte und aktualisiert die Anzeige
async function opP(n){const r=await api('op_player',{name:n});toast(r.output||r.message||(r.success?`${n} ist jetzt OP`:'Fehler'),r.success?'success':'error');if(r.success){setTimeout(refreshStatus,500);if(document.getElementById('wl-tbody'))loadWl();}}
// Entzieht einem Spieler die OP-Rechte und aktualisiert die Anzeige
async function deopP(n){const r=await api('deop_player',{name:n});toast(r.output||r.message||(r.success?`${n} ist kein OP mehr`:'Fehler'),r.success?'success':'error');if(r.success){setTimeout(refreshStatus,500);if(document.getElementById('wl-tbody'))loadWl();}}
// Fragt nach einem Kickgrund und kickt den Spieler vom Server
async function kickP(n){const reason=prompt(`Kickgrund für ${n}:`,'Kicked by admin');if(reason===null)return;const r=await api('kick_player',{name:n,reason});toast(r.success?`${n} gekickt`:'Fehler',r.success?'success':'error');setTimeout(refreshStatus,1500);}
// Fügt einen Online-Spieler direkt zur Whitelist hinzu
async function wlAdd(n){const r=await api('whitelist_add',{name:n});toast(r.message,r.success?'success':'warn');}

// ═══ CONSOLE ══════════════════════════════════════════════
// Passt die Konsolenhöhe dynamisch an das verfügbare Fenster an
function resizeCon(){
  const out=document.getElementById('con-out');if(!out)return;
  const box=out.closest('.console-box');if(!box)return;
  const card=out.closest('.card');if(!card)return;
  const top=out.getBoundingClientRect().top;
  const conIn=box.querySelector('.con-in');
  const conInH=conIn?conIn.getBoundingClientRect().height:42;
  const quickBar=card.querySelector('.cb:last-child');
  const quickH=quickBar?quickBar.getBoundingClientRect().height:52;
  const h=Math.max(200,window.innerHeight-top-conInH-quickH-22);
  out.style.flex='none';
  out.style.height=h+'px';
}
// Startet das Konsolen-Polling und setzt den Log-Bereich zurück
function startCon(){
  stopCon();
  G.conPaused=false;G.conActive=true;
  const pbtn=document.getElementById('con-pbtn');if(pbtn)pbtn.textContent='⏸ Pause';
  const out=document.getElementById('con-out');if(out)out.innerHTML='';
  resizeCon();
  pollCon();
}
// Beendet das Konsolen-Polling und löscht den Timer
function stopCon(){
  G.conActive=false;
  if(G.conTimer){clearTimeout(G.conTimer);G.conTimer=null;}
}
// Wechselt zwischen Pause und Weiter für das Konsolen-Polling
function conPause(){
  G.conPaused=!G.conPaused;
  const b=document.getElementById('con-pbtn');if(b)b.textContent=G.conPaused?'▶ Weiter':'⏸ Pause';
}
// Leert den sichtbaren Konsolen-Ausgabebereich
function conClear(){const o=document.getElementById('con-out');if(o)o.innerHTML='';}
// Scrollt die Konsole ans Ende
function conScroll(){const el=document.getElementById('con-out');if(el)el.scrollTop=el.scrollHeight;}
// Ruft neue Log-Zeilen ab und rendert sie in die Konsole (wiederholt alle 2,5 s)
async function pollCon(){
  G.conTimer=null;
  if(!G.conActive)return;
  if(!G.conPaused){
    try{
      const r=await api('get_log',{lines:G.conLines});
      if(!G.conActive)return;
      const out=document.getElementById('con-out');
      if(out&&r.lines){
        const atB=out.scrollTop+out.clientHeight>=out.scrollHeight-20;
        out.innerHTML='';
        r.lines.forEach(l=>{
          const el=document.createElement('span');
          el.className='cl '+classLog(l);
          el.textContent=l;
          out.appendChild(el);
        });
        if(atB)out.scrollTop=out.scrollHeight;
      }
    }catch(e){}
  }
  if(G.conActive)G.conTimer=setTimeout(pollCon,2500);
}
// Gibt die CSS-Klasse für eine Log-Zeile zurück (join/leave/error/warn/chat/cmd)
function classLog(l){const s=l.toLowerCase();
  if(s.includes('player connected')||s.includes('joined the game'))return'cl-join';
  if(s.includes('player disconnected')||s.includes('left the game'))return'cl-leave';
  if(s.includes('[error]')||s.includes('error:'))return'cl-error';
  if(s.includes('[warn')||s.includes('warning'))return'cl-warn';
  if(s.includes('<')&&s.includes('>'))return'cl-chat';
  if(s.includes('running command')||s.includes('issued server command'))return'cl-cmd';
  return'cl-info';
}
// Füllt das Konsoleneingabefeld mit einem Schnellbefehl und sendet ihn sofort ab
function quickCmd(cmd){document.getElementById('con-inp').value=cmd;conSend();}
// Liest den Konsoleneingabe-Inhalt, speichert ihn im Verlauf und sendet den Befehl
async function conSend(){
  const inp=document.getElementById('con-inp');const cmd=inp.value.trim();if(!cmd)return;
  G.conHist.unshift(cmd);G.conHistIdx=-1;inp.value='';
  const out=document.getElementById('con-out');
  const el=document.createElement('span');el.className='cl cl-cmd';el.textContent='> '+cmd;out.appendChild(el);out.scrollTop=out.scrollHeight;
  const r=await api('console_send',{cmd});
  if(!r.success)toast(r.message||'Befehl konnte nicht gesendet werden','warn');
}
document.addEventListener('DOMContentLoaded',()=>{
  const inp=document.getElementById('con-inp');
  if(inp){
    inp.addEventListener('keydown',ev=>{
      if(ev.key==='ArrowUp'){ev.preventDefault();if(G.conHistIdx<G.conHist.length-1){G.conHistIdx++;inp.value=G.conHist[G.conHistIdx]||'';}}
      if(ev.key==='ArrowDown'){ev.preventDefault();if(G.conHistIdx>0){G.conHistIdx--;inp.value=G.conHist[G.conHistIdx]||'';}else{G.conHistIdx=-1;inp.value='';}}
    });
    inp.addEventListener('input',()=>{G.conHistIdx=-1;});
  }
  startCon();
  window.addEventListener('resize',resizeCon);
});

// ═══ VERSION / UPDATE ══════════════════════════════════════
// Prüft installierte und neueste Server-Version und aktualisiert die Update-Seite
async function checkVer(){
  document.getElementById('v-cur').textContent='...';document.getElementById('v-lat').textContent='...';
  try{
    const[info,inst]=await Promise.all([api('check_version'),api('server_installed')]);
    G.ver=info;
    document.getElementById('v-cur').textContent=info.current||'n/a';
    document.getElementById('v-lat').textContent=info.latest||'n/a';
    const btn=document.getElementById('btn-upd');const ub=document.getElementById('mc-ub');
    if(ub)ub.style.display='';
    if(!inst.installed){btn.disabled=false;btn.textContent=`⬇ Bedrock ${e(info.latest)} installieren`;btn.className='btn success';if(ub)ub.innerHTML=`<div class="ub good" style="margin:0"><div>📦</div><div><strong class="tg">Noch nicht installiert</strong><br><span class="dim xs2">Version ${e(info.latest)} wird von Mojang heruntergeladen.</span></div></div>`;}
    else if(info.update_available){btn.disabled=false;btn.textContent=`⬆ Update auf ${e(info.latest)}`;btn.className='btn warn';if(ub)ub.innerHTML=`<div class="ub" style="margin:0"><div>🔔</div><div><strong>Update verfügbar!</strong><br><span class="dim xs2">Backup wird vor dem Update automatisch erstellt.</span></div></div>`;}
    else{btn.disabled=true;btn.textContent='✓ Aktuell';btn.className='btn ghost';if(ub)ub.innerHTML=`<div class="ub good" style="margin:0"><div>✅</div><div><strong class="tg">Aktuell!</strong> Neueste Version installiert.</div></div>`;}
  }catch(err){toast('Versions-Check fehlgeschlagen','error');}
}
let updTimer=null;
// Fügt einen Schritt-Eintrag in das Update-Log-Panel ein oder aktualisiert ihn
function addUpdLog(step,status,msg){
  const log=document.getElementById('upd-log');
  const ic={running:'<span class="spin">⟳</span>',done:'✅',error:'❌'};
  const co={running:'var(--yellow)',done:'var(--green)',error:'var(--red)'};
  const id='ul-'+step;let el=document.getElementById(id);
  if(!el){el=document.createElement('div');el.id=id;el.style.cssText='display:flex;align-items:center;gap:7px;padding:3px 0';log.appendChild(el);}
  el.innerHTML=`<span style="color:${co[status]||'var(--text2)'}">${ic[status]||'•'}</span><span>${e(msg)}</span>`;
  log.scrollTop=log.scrollHeight;
}
// Fragt den Update-Status ab und aktualisiert das Log (alle 2 s bis abgeschlossen)
async function pollUpd(){
  try{
    const s=await api('update_status');if(!s||s.step==='idle')return;
    addUpdLog(s.step,s.status,s.message);
    if(s.step==='complete'&&s.status==='done'){clearInterval(updTimer);updTimer=null;toast('Update erfolgreich! 🎉','success',5000);document.getElementById('btn-upd').disabled=false;setTimeout(()=>{checkVer();refreshStatus();},3500);}
    else if(s.step==='complete'&&s.status==='warn'){clearInterval(updTimer);updTimer=null;toast('Update installiert – Server bitte manuell starten ⚠️','warn',8000);document.getElementById('btn-upd').disabled=false;setTimeout(()=>{checkVer();refreshStatus();},3500);}
    else if(s.status==='error'){clearInterval(updTimer);updTimer=null;toast('Update fehlgeschlagen: '+s.message,'error',6000);document.getElementById('btn-upd').disabled=false;}
  }catch(e){}
}
// Startet den Minecraft-Server-Update-Prozess nach Bestätigung
async function startUpdate(){
  const ver=G.ver?.latest;if(!ver||ver==='unbekannt'){toast('Keine Version','error');return;}
  if(!confirm(`${ver} installieren?\n1. Server stoppen\n2. Backup erstellen\n3. Download\n4. Neue Version installieren\n5. Welten/Packs/Einstellungen wiederherstellen\n6. Server starten`))return;
  document.getElementById('btn-upd').disabled=true;document.getElementById('upd-log').innerHTML='';
  addUpdLog('init','running','Starte...');
  const r=await api('start_update',{version:ver});
  if(!r.success){toast('Fehler','error');document.getElementById('btn-upd').disabled=false;return;}
  if(updTimer)clearInterval(updTimer);updTimer=setInterval(pollUpd,2000);
  toast('Update läuft...','info',4000);
}

// ═══ BACKUPS ══════════════════════════════════════════════
// Lädt und rendert die Backup-Liste mit Export-, Restore- und Lösch-Buttons
async function loadBk(){
  const el=document.getElementById('bk-list');
  el.innerHTML='<div class="cb dim xs2" style="text-align:center;padding:22px">Lade...</div>';
  const bks=await api('get_backups');
  if(!bks.length){el.innerHTML='<div class="cb dim xs2" style="text-align:center;padding:26px">Keine Backups</div>';return;}
  el.innerHTML=bks.map(b=>`
    <div class="bki">
      <div><svg width="22" height="22" style="image-rendering:pixelated"><use href="#mc-chest"/></svg></div>
      <div style="flex:1;min-width:0"><div class="bkn">${e(b.filename)}</div><div class="bkm">${e(b.date)} · ${e(b.size_human)}</div></div>
      <div class="bkact">
        <a href="api/handler.php?action=download_backup&filename=${encodeURIComponent(b.filename)}" class="btn ghost xs">⬇ Export</a>
        <button class="btn warn xs" onclick="restoreBk('${e(b.filename)}')">↩ Restore</button>
        <button class="btn danger xs" onclick="delBk('${e(b.filename)}')">🗑</button>
      </div>
    </div>`).join('');
}
let bkTimer=null;
// Startet ein asynchrones Backup und zeigt die Fortschrittsanzeige
async function createBackup(){
  const label=document.getElementById('bk-label').value;
  const btn=document.getElementById('btn-bk-create');
  if(btn){btn.disabled=true;btn.innerHTML='⏳ Läuft...';}
  const r=await api('start_backup',{label});
  if(!r.success){
    toast(r.message||'Fehler beim Starten','error');
    if(btn){btn.disabled=false;btn.innerHTML='💾 Backup erstellen';}
    return;
  }
  showBkProgress('Starte Backup...');
  if(bkTimer)clearInterval(bkTimer);
  bkTimer=setInterval(pollBkStatus,1500);
}
// Zeigt die animierte Backup-Fortschrittsanzeige mit einer Statusmeldung
function showBkProgress(msg){
  const el=document.getElementById('bk-progress');if(!el)return;
  el.style.display='';
  el.innerHTML=`<div style="font-size:13px;margin-bottom:7px;color:var(--text)">⏳ ${e(msg)}</div><div style="height:6px;border-radius:3px;overflow:hidden;background:var(--border)"><div style="height:100%;border-radius:3px;background:linear-gradient(90deg,var(--blue,#3b82f6) 0%,#93c5fd 50%,var(--blue,#3b82f6) 100%);background-size:200%;animation:bkslide 1.5s linear infinite"></div></div>`;
}
// Fragt den Backup-Status ab und aktualisiert Fortschrittsanzeige und Button
async function pollBkStatus(){
  try{
    const s=await api('backup_status');
    const el=document.getElementById('bk-progress');
    const btn=document.getElementById('btn-bk-create');
    if(s.status==='done'){
      clearInterval(bkTimer);bkTimer=null;
      if(btn){btn.disabled=false;btn.innerHTML='💾 Backup erstellen';}
      if(el){el.style.display='';el.innerHTML=`<div class="ub good" style="margin:0"><div>✅</div><div>${e(s.message)}</div></div>`;}
      toast(s.message,'success');
      loadBk();
      setTimeout(()=>{if(el)el.style.display='none';},6000);
    }else if(s.status==='error'){
      clearInterval(bkTimer);bkTimer=null;
      if(btn){btn.disabled=false;btn.innerHTML='💾 Backup erstellen';}
      if(el){el.style.display='';el.innerHTML=`<div class="ub warn2" style="margin:0"><div>❌</div><div>${e(s.message||'Backup fehlgeschlagen')}</div></div>`;}
      toast(s.message||'Backup fehlgeschlagen','error');
    }else{
      showBkProgress(s.message||'Komprimiere Daten...');
    }
  }catch(_){}
}
// Stellt ein Backup nach Bestätigung wieder her und aktualisiert den Server-Status
async function restoreBk(f){if(!confirm(`Backup wiederherstellen?\n${f}`))return;toast('Wird wiederhergestellt...','info');const r=await api('restore_backup',{filename:f});toast(r.message,r.success?'success':'error');setTimeout(refreshStatus,3000);}
// Löscht ein Backup nach Bestätigung und aktualisiert die Liste
async function delBk(f){if(!confirm('Backup löschen?\n'+f))return;const r=await api('delete_backup',{filename:f});if(r.success){toast('Gelöscht','success');loadBk();}else toast('Fehler','error');}
// Importiert eine .tar.gz-Backup-Datei per Dateiauswahl oder Drag & Drop
async function importBk(inp){const file=inp.files[0];if(!file)return;toast('Importiere...','info');const r=await api('import_backup',{},{backup:file});toast(r.message,r.success?'success':'error');if(r.success)loadBk();inp.value='';}
// Lädt die Backup-Zeitplan-Einstellungen und befüllt die Formularfelder
async function loadBackupSchedule(){
  const s=await api('get_settings');
  document.getElementById('bk-sched-on').checked=s.backup_schedule_enabled||false;
  document.getElementById('bk-sched-time').value=s.backup_schedule_time||'03:00';
}
// Speichert den Backup-Zeitplan (aktiviert/Zeit) aus dem Formular
async function saveBackupSchedule(){
  const enabled=document.getElementById('bk-sched-on').checked;
  const time=document.getElementById('bk-sched-time').value;
  const r=await api('save_backup_schedule',{enabled:enabled?'true':'false',time});
  toast(r.message||(r.success?'Gespeichert':'Fehler'),r.success?'success':'error');
  if(r.success)loadBackupSchedule();
}

// ═══ WORLDS ═══════════════════════════════════════════════
// Lädt alle Welten und rendert die Welt-Liste mit Aktions-Buttons
async function loadWorlds(){
  const el=document.getElementById('worlds-list');
  el.innerHTML='<div class="dim xs2" style="text-align:center;padding:18px">Lade...</div>';
  const worlds=await api('get_worlds');const active=G.srv.active_world;
  if(!worlds.length){const inst=G.srv&&G.srv.version&&G.srv.version!=='nicht installiert';el.innerHTML=inst?'<div class="dim xs2" style="text-align:center;padding:24px">🌍 Noch keine Welt vorhanden.<br><span style="font-size:.85em">Server starten → erste Welt wird automatisch erstellt.</span></div>':'<div class="dim xs2" style="text-align:center;padding:18px">Keine Welten gefunden</div>';return;}
  el.innerHTML=worlds.map(w=>`
    <div class="wc ${w.name===active?'aw':''}" id="wc-${e(w.name)}">
      <div class="wi ${w.name===active?'wi-active':''}">
        <svg width="24" height="24" style="image-rendering:pixelated"><use href="#mc-grass"/></svg>
      </div>
      <div style="flex:1;min-width:0">
        <div class="wname">${e(w.name)}</div>
        <div class="wmeta">${e(w.size_human)}${w.name===active?' · <span class="badge badge-g">Aktiv</span>':''}${w.has_own_properties?' · <span class="badge badge-b">eigene Config</span>':''}${(w.experiments&&w.experiments.length)?' · <span class="badge badge-y" title="'+e(w.experiments.join(', '))+'">⚗️ Experimente</span>':''}${(w.missing_packs_count>0)?` · <button class="btn danger xs" onclick="toggleMissingPanel('${e(w.name)}')">⚠️ ${w.missing_packs_count} Pack${w.missing_packs_count>1?'s':''} reparieren</button>`:''}</div>
        <div class="wacts">
          ${w.name!==active?`<button class="btn primary xs" onclick="switchW('${e(w.name)}')">▶ Aktivieren</button>`:''}
          <button class="btn ghost xs" onclick="editProps('${e(w.name)}')">⚙️ Einstellungen</button>
          <button class="btn ghost xs" onclick="openRenameModal('${e(w.name)}')">✏️ Umbenennen</button>
          ${w.name!==active?`<button class="btn danger xs" onclick="delWorld('${e(w.name)}')">🗑 Löschen</button>`:''}
        </div>
      </div>
      ${w.missing_packs_count>0?`<div class="miss-panel hidden" id="mpp-${e(w.name)}"></div>`:''}
    </div>`).join('');
  if(active)editProps(active);
}
// Öffnet/schließt das Detailpanel für fehlende Packs einer Welt
async function toggleMissingPanel(worldName){
  const panel=document.getElementById('mpp-'+worldName);
  if(!panel)return;
  if(!panel.classList.contains('hidden')){panel.classList.add('hidden');return;}
  panel.classList.remove('hidden');
  panel.innerHTML='<div class="dim xs2" style="padding:6px 0"><span class="spin">⟳</span> Lade...</div>';
  try{
    const data=await api('get_world_packs',{world:worldName});
    const missing=[...(data.behavior_missing||[]).map(p=>({...p,type:'Behavior'})),
                   ...(data.resource_missing||[]).map(p=>({...p,type:'Resource'}))];
    if(!missing.length){
      panel.innerHTML='<div class="dim xs2" style="padding:6px 0">✅ Keine fehlenden Packs mehr.</div>';
      return;
    }
    panel.innerHTML=`<div>
      <div style="font-weight:600;font-size:13px;margin-bottom:8px">Fehlende Packs:</div>
      ${missing.map(p=>`<div class="xs2" style="margin-bottom:5px">
        <span class="badge badge-r">${e(p.type)}</span>
        <code style="font-size:11px">${e(p.uuid)}</code> · v${e(p.version)}
      </div>`).join('')}
      <div class="uz" style="margin-top:10px" onclick="document.getElementById('mpp-up-${e(worldName)}').click()">
        <div class="ui">📦</div>
        <div>Fehlendes Pack hochladen</div>
        <div class="xs2 dim" style="margin-top:3px">(.mcpack, .mcaddon oder .zip)</div>
        <input type="file" id="mpp-up-${e(worldName)}" accept=".mcpack,.mcaddon,.zip"
               onchange="supplyMissingPack('${e(worldName)}',this)" style="display:none">
      </div>
      <div id="mpp-st-${e(worldName)}"></div>
    </div>`;
  }catch(err){
    panel.innerHTML='<div class="dim xs2" style="padding:6px 0">❌ Fehler beim Laden.</div>';
  }
}
// Lädt ein fehlendes Pack hoch, installiert es und repariert die Welt-Referenz
async function supplyMissingPack(worldName,inp){
  const f=inp.files[0];if(!f)return;
  const st=document.getElementById('mpp-st-'+worldName);
  st.innerHTML='<div class="dim xs2" style="margin-top:8px"><span class="spin">⟳</span> Installiere...</div>';
  try{
    const r=await api('supply_missing_pack',{world:worldName},{pack:f});
    toast(r.message||(r.success?'Installiert':'Fehler'),r.success?'success':'error');
    if(r.success)loadWorlds();
    else st.innerHTML=`<div class="xs2" style="margin-top:8px;color:var(--red)">${e(r.message)}</div>`;
  }catch(err){
    st.innerHTML='<div class="xs2" style="margin-top:8px;color:var(--red)">❌ Upload fehlgeschlagen</div>';
  }
  inp.value='';
}
// Wechselt zur gewählten Welt nach Bestätigung und bietet Server-Neustart an
async function switchW(name){
  if(!confirm(`Zu "${name}" wechseln?\nAktuelle Einstellungen werden gespeichert.`))return;
  const r=await api('switch_world',{world:name});toast(r.message,r.success?'success':'error');
  if(r.success){await refreshStatus();loadWorlds();if(confirm('Server jetzt neu starten?'))srvAction('restart');}
}
// Erstellt eine neue Welt anhand der Formulareingaben (Name, Spielmodus, Schwierigkeit, Seed)
async function createWorld(){
  const name=document.getElementById('cw-name').value.trim();if(!name){toast('Bitte Weltname eingeben','warn');return;}
  const r=await api('create_world',{name,gamemode:document.getElementById('cw-gamemode').value,difficulty:document.getElementById('cw-diff').value,seed:document.getElementById('cw-seed').value});
  toast(r.message,r.success?'success':'error');
  if(r.success){closeModal('modal-create-world');document.getElementById('cw-name').value='';document.getElementById('cw-seed').value='';loadWorlds();}
}
// Löscht eine Welt nach doppelter Bestätigung
async function delWorld(name){
  if(!confirm(`Welt "${name}" UNWIDERRUFLICH löschen?`))return;
  if(!confirm(`Wirklich? Alle Daten gehen verloren!`))return;
  const r=await api('delete_world',{world:name});toast(r.message,r.success?'success':'error');if(r.success)loadWorlds();
}
// Öffnet das Umbenennen-Modal und befüllt es mit dem aktuellen Weltnamen
function openRenameModal(name){document.getElementById('rw-old').value=name;document.getElementById('rw-old-disp').value=name;document.getElementById('rw-new').value=name;openModal('modal-rename-world');}
// Sendet die Umbenennen-Anfrage und aktualisiert Status und Weltliste
async function renameWorld(){
  const old=document.getElementById('rw-old').value;const nw=document.getElementById('rw-new').value.trim();
  if(!nw){toast('Bitte neuen Namen eingeben','warn');return;}
  const r=await api('rename_world',{world:old,new_name:nw});toast(r.message,r.success?'success':'error');
  if(r.success){closeModal('modal-rename-world');await refreshStatus();loadWorlds();}
}

// ═══ PROPS EDITOR ═════════════════════════════════════════
// Schema-Definition der bekannten server.properties-Felder mit Typ und Optionen
const SCHEMA=[
  {S:'Allgemein'},
  {k:'server-name',l:'Server Name',t:'text',d:'Anzeigename im Netzwerk'},
  {k:'gamemode',l:'Spielmodus',t:'sel',o:['survival','creative','adventure']},
  {k:'difficulty',l:'Schwierigkeit',t:'sel',o:['peaceful','easy','normal','hard']},
  {k:'max-players',l:'Max. Spieler',t:'num',min:1,max:30},
  {k:'server-port',l:'IPv4 Port',t:'num',min:1,max:65535},
  {k:'server-portv6',l:'IPv6 Port',t:'num',min:1,max:65535},
  {k:'level-seed',l:'Welt Seed',t:'text',d:'Leer = zufällig'},
  {S:'Gameplay'},
  {k:'allow-cheats',l:'Cheats erlauben',t:'bool'},
  {k:'white-list',l:'Whitelist aktiv',t:'bool'},
  {k:'online-mode',l:'Xbox-Login erforderlich',t:'bool'},
  {k:'texturepack-required',l:'Texturepack erzwingen',t:'bool'},
  {k:'default-player-permission-level',l:'Standard Berechtigung',t:'sel',o:['visitor','member','operator']},
  {k:'player-idle-timeout',l:'AFK-Timeout (Min)',t:'num',min:0,d:'0 = deaktiviert'},
  {S:'Performance'},
  {k:'view-distance',l:'Sichtweite (Chunks)',t:'num',min:5,max:32},
  {k:'tick-distance',l:'Tick-Distanz',t:'num',min:4,max:12},
  {k:'max-threads',l:'Max. Threads',t:'num',min:0,d:'0 = automatisch'},
  {S:'Netzwerk & Sicherheit'},
  {k:'content-log-file-enabled',l:'Content-Log',t:'bool'},
  {k:'compression-threshold',l:'Kompressions-Schwelle',t:'num',min:0},
  {k:'server-authoritative-movement',l:'Bewegungs-Auth.',t:'sel',o:['client-auth','server-auth','server-auth-with-rewind']},
  {k:'server-authoritative-block-breaking',l:'Block-Abbauen Auth.',t:'bool'},
  {k:'correct-player-movement',l:'Bewegungskorrektur',t:'bool'},
];
// Lädt und zeigt den Properties-Editor für die ausgewählte Welt
async function editProps(worldName){
  document.querySelectorAll('.wc').forEach(c=>c.classList.remove('sel'));
  const wc=document.getElementById('wc-'+worldName);if(wc)wc.classList.add('sel');
  G.propsWorld=worldName;
  document.getElementById('props-lbl').textContent=worldName;
  document.getElementById('props-lbl').className='badge badge-g';
  document.getElementById('btn-save-props').disabled=false;
  document.getElementById('props-body').innerHTML='<div class="dim xs2" style="text-align:center;padding:20px">Lade...</div>';
  const r=await api('get_properties',{world:worldName});
  G.propsData={...r.properties};renderPropsEditor(r.properties);
}
// Rendert den Properties-Editor mit Sektionen und unbekannten Keys als Textfelder
function renderPropsEditor(props){
  let html='';let so=false;const knownKeys=SCHEMA.filter(d=>d.k).map(d=>d.k);
  for(const def of SCHEMA){
    if(def.S!==undefined){if(so)html+='</div></div>';html+=`<div class="ps"><div class="psh">${e(def.S)}</div><div class="pg">`;so=true;continue;}
    const val=props[def.k]??'';
    html+=`<div class="prow"><div class="pk">${e(def.k)}</div>${renderPI(def,val)}${def.d?`<div class="pdesc">${e(def.d)}</div>`:''}</div>`;
  }
  if(so)html+='</div></div>';
  const unk=Object.keys(props).filter(k=>!knownKeys.includes(k));
  if(unk.length){html+=`<div class="ps"><div class="psh">Weitere Einstellungen</div><div class="pg">`;for(const k of unk)html+=`<div class="prow"><div class="pk">${e(k)}</div><input class="pinp" type="text" data-key="${e(k)}" value="${e(props[k]??'')}" onchange="propsChg(this)"></div>`;html+='</div></div>';}
  document.getElementById('props-body').innerHTML=html;
}
// Rendert ein einzelnes Properties-Eingabefeld (bool/select/num/text) anhand der Schema-Definition
function renderPI(def,val){
  const a=`class="pinp" data-key="${e(def.k)}" onchange="propsChg(this)"`;
  if(def.t==='bool')return`<select ${a}><option value="true" ${val==='true'?'selected':''}>✓ Ja</option><option value="false" ${val!=='true'?'selected':''}>✗ Nein</option></select>`;
  if(def.t==='sel')return`<select ${a}>${def.o.map(o=>`<option value="${e(o)}" ${val===o?'selected':''}>${e(o)}</option>`).join('')}</select>`;
  if(def.t==='num')return`<input ${a} type="number" value="${e(val)}" ${def.min!==undefined?'min="'+def.min+'"':''} ${def.max!==undefined?'max="'+def.max+'"':''}>`;
  return`<input ${a} type="text" value="${e(val)}">`;
}
// Aktualisiert den Properties-Puffer bei Änderung eines Eingabefelds
function propsChg(el){G.propsData[el.dataset.key]=el.value;}
// Speichert alle Properties-Änderungen für die aktive Welt
async function saveProps(){
  if(!G.propsWorld){toast('Keine Welt gewählt','error');return;}
  document.querySelectorAll('.pinp').forEach(el=>{if(el.dataset.key)G.propsData[el.dataset.key]=el.value;});
  const r=await api('save_properties',{world:G.propsWorld,properties:JSON.stringify(G.propsData)});
  toast(r.message||(r.success?'Gespeichert':'Fehler'),r.success?'success':'error');
  if(r.success)loadWorlds();
}

// ═══ PACKS ════════════════════════════════════════════════
// Befüllt die Welt-Auswahlliste im Pack-Tab und wählt die aktive Welt aus
async function loadWorldsForPacks(){
  // Status aktuell halten damit active_world stimmt
  await refreshStatus();
  const sel=document.getElementById('pk-world');const worlds=await api('get_worlds');
  sel.innerHTML='<option value="">-- Welt wählen --</option>'+worlds.map(w=>`<option value="${e(w.name)}" ${w.name===G.srv.active_world?'selected':''}>${e(w.name)}${w.missing_packs_count>0?' ⚠️':''}</option>`).join('');
  if(G.srv.active_world)loadWPacks();
}
// Lädt alle installierten Behavior- und Resource-Packs und rendert sie
async function loadAllPacks(){G.packs=await api('get_packs');renderPacks();}
// Lädt die aktiven Packs der gewählten Welt (inkl. fehlende Packs) und rendert sie
async function loadWPacks(){const w=document.getElementById('pk-world').value;if(!w)return;G.wPacks=await api('get_world_packs',{world:w});renderPacks();}
// Rendert die Pack-Listen: nur Packs der gewählten Welt anzeigen + fehlende Packs
function renderPacks(){
  const world=document.getElementById('pk-world').value;
  ['resource','behavior'].forEach(t=>{
    const allPacks=G.packs[t]||[];
    const active=G.wPacks[t]||[];
    const missing=G.wPacks[t+'_missing']||[];
    const el=document.getElementById((t==='resource'?'res':'beh')+'-list');

    // Wenn Welt gewählt: nur Packs dieser Welt anzeigen
    const packs=world
      ? allPacks.filter(p=>(p.used_by_worlds||[]).includes(world)||(p.imported_by_worlds||[]).includes(world))
      : allPacks;

    const subtypeBadge=s=>({script:'<span class="badge badge-o">Script</span>',data:'<span class="badge badge-d">Behavior</span>',resources:'<span class="badge badge-b">Resource</span>'}[s]||'');
    const icon=p=>p.subtype==='script'?'📜':(t==='resource'?'🎨':'⚙️');

    let html='';
    if(packs.length){
      html+=packs.map(p=>{
        const en=active.some(a=>(typeof a==='string'?a:a.pack_id)===p.uuid);
        return`<div class="pkc"><div class="pki">${icon(p)}</div><div style="flex:1;min-width:0"><div class="pkn">${e(p.name)}</div><div class="pkd">${e(p.description||'—')}</div><div class="pkv">v${e(p.version)} ${subtypeBadge(p.subtype)}</div></div><label class="tgl"><input type="checkbox" ${en?'checked':''} ${!world?'disabled':''} onchange="togglePk('${e(world)}','${e(p.uuid)}','${t}',this.checked)"><span class="tsl"></span></label>${p.user_pack?`<button class="icon-btn" title="Pack löschen" onclick="deletePack('${e(p.uuid)}','${t}','${e(p.name)}')">🗑</button>`:''}</div>`;
      }).join('');
    }
    // Fehlende Packs (UUID vorhanden, aber nicht installiert)
    if(missing.length){
      html+=`<div style="margin-top:8px;padding:4px 2px;font-size:11px;color:var(--text2)">Fehlende Packs — nicht auf diesem Server installiert:</div>`;
      html+=missing.map(mp=>`<div class="pkc pk-missing"><div class="pki">❓</div><div style="flex:1;min-width:0"><div class="pkn" style="color:var(--red)">${e(mp.uuid.substring(0,18))}…</div><div class="pkv">v${e(mp.version)} · Nicht installiert</div></div><span class="badge badge-r" style="flex-shrink:0">Fehlt</span></div>`).join('');
    }
    if(!html){
      html=`<div class="dim xs2" style="text-align:center;padding:18px">${world?'Keine Packs für diese Welt':'Keine Packs installiert'}</div>`;
    }
    el.innerHTML=html;
  });
}
// Aktiviert oder deaktiviert ein Pack für eine Welt und lädt die Pack-Liste neu
async function togglePk(w,u,t,en){const r=await api('toggle_pack',{world:w,uuid:u,type:t,enable:en?'1':'0'});if(r.success){toast(en?'Aktiviert':'Deaktiviert','success');await loadWPacks();}else{toast('Fehler','error');await loadWPacks();}}
// Löscht ein selbst installiertes Pack nach Bestätigung und aktualisiert die Listen
async function deletePack(uuid,type,name){if(!confirm(`Pack "${name}" wirklich löschen?\nEs wird aus allen Welten entfernt und vom Server gelöscht.`))return;const r=await api('delete_pack',{uuid,type});toast(r.message||(r.success?'Pack gelöscht':'Fehler'),r.success?'success':'error');if(r.success){await loadAllPacks();await loadWPacks();}}
// Wechselt zwischen Resource- und Behavior-Pack-Tab
function switchPkTab(tab,btn){const c=btn.closest('.card');c.querySelectorAll('.tb').forEach(b=>b.classList.remove('active'));c.querySelectorAll('.tp').forEach(p=>p.classList.remove('active'));btn.classList.add('active');document.getElementById('pt-'+(tab==='resource'?'res':'beh')).classList.add('active');}
// Lädt eine Pack-Datei hoch und installiert sie auf dem Server
async function uploadPack(inp){const f=inp.files[0];if(!f)return;toast('Installiere Pack...','info');const r=await api('upload_pack',{},{pack:f});toast(r.message||(r.success?'Pack installiert':'Fehler'),r.success?'success':'error');if(r.success)loadAllPacks();inp.value='';}
// Lädt eine .mcworld-Datei hoch und importiert sie als neue Welt
async function uploadWorld(inp){const f=inp.files[0];if(!f)return;toast('Importiere Welt...','info');try{const r=await api('upload_world',{},{world:f});toast(r.message||(r.success?'Welt importiert':'Fehler'),r.success?'success':'error');if(r.success)loadWorlds();}catch(err){toast('Upload fehlgeschlagen: '+err.message,'error');}inp.value='';}

// ═══ STATS ════════════════════════════════════════════════
// Rendert ein horizontales Balkendiagramm für die Top-10 Spieler nach Spielzeit
function renderStatsChart(players){
  const top=players.slice(0,10);
  if(!top.length)return'';
  const max=top[0].playtime_seconds||1;
  const medals=['🥇','🥈','🥉'];
  return'<div style="padding:14px 16px 4px">'+top.map((p,i)=>{
    const pct=Math.round(p.playtime_seconds/max*100);
    return`<div style="display:flex;align-items:center;gap:10px;margin-bottom:7px">
      <span style="min-width:130px;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${medals[i]||(i+1)+'.'} ${e(p.name)}</span>
      <div style="flex:1;background:var(--border);border-radius:4px;height:9px">
        <div style="width:${pct}%;background:var(--accent);height:100%;border-radius:4px;transition:width .5s"></div>
      </div>
      <span style="font-size:11px;color:var(--dim);min-width:55px;text-align:right">${e(p.playtime_human)}</span>
    </div>`;
  }).join('')+'</div>';
}
// Lädt Spieler-Statistiken und rendert Balkendiagramm + Rangliste mit Spielzeit und Sessions
async function loadStats(){
  const el=document.getElementById('stats-body');
  el.innerHTML='<div class="cb dim xs2" style="text-align:center;padding:26px"><span class="spin">⟳</span> Analysiere...</div>';
  try{
    const stats=await api('get_player_stats');
    if(!Array.isArray(stats)||!stats.length){el.innerHTML='<div class="cb dim xs2" style="text-align:center;padding:26px">Keine Spieler-Daten im Log gefunden.</div>';return;}
    const maxPt=Math.max(...stats.map(s=>Math.max(0,s.playtime_seconds)),1);
    el.innerHTML=renderStatsChart(stats)+`<div class="tw"><table>
    <thead><tr><th>#</th><th>Spieler</th><th>Spielzeit</th><th style="width:120px">Anteil</th><th>Sessions</th><th>Kicks</th><th>Zuletzt</th><th>Erstes Login</th></tr></thead>
    <tbody>${stats.map((s,i)=>{
      const pct=Math.round((Math.max(0,s.playtime_seconds)/maxPt)*100);
      const rc=i===0?'r1':i===1?'r2':i===2?'r3':'rn';
      const m=i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1);
      return`<tr><td><span class="rank ${rc}">${m}</span></td><td><div class="fx ac g6"><div class="pav" style="width:28px;height:28px"><svg width="28" height="28" style="image-rendering:pixelated"><use href="#mc-steve"/></svg></div><div><div style="font-weight:600">${e(s.name)}</div>${s.online?'<span class="badge badge-g" style="font-size:10px">Online</span>':'<span class="xs2 dim">Offline</span>'}</div></div></td><td><strong>${e(s.playtime_human)}</strong></td><td><div class="fx ac g6"><div class="bar-wrap"><div class="bar" style="width:${pct}%"></div></div><span class="xs2 dim">${pct}%</span></div></td><td>${s.sessions}</td><td>${s.kicks>0?`<span class="tr">${s.kicks}</span>`:'—'}</td><td class="xs2 dim">${e(s.last_seen_human)}</td><td class="xs2 dim">${e(s.first_seen_human)}</td></tr>`;
    }).join('')}</tbody></table></div>
  <div class="cb dim xs2" style="border-top:1px solid var(--border);padding:8px 13px">${stats.length} Spieler · Basierend auf Server-Log</div>`;
  }catch(err){
    el.innerHTML='<div class="cb dim xs2" style="text-align:center;padding:26px">❌ Statistiken konnten nicht geladen werden.</div>';
  }
}

// ═══ WHITELIST ════════════════════════════════════════════
// Lädt die Whitelist und rendert die Tabelle mit OP- und Entfernen-Buttons
async function loadWl(){
  const list=await api('get_whitelist');const tb=document.getElementById('wl-tbody');
  if(!list.length){tb.innerHTML='<tr><td colspan="3" class="dim xs2" style="text-align:center">Whitelist leer</td></tr>';return;}
  tb.innerHTML=list.map(p=>{
    const hasXuid=!!p.xuid;
    const opBtn=p.is_op
      ?`<button class="btn success xs" onclick="deopP('${e(p.name)}')" title="OP entfernen">⭐ OP</button>`
      :`<button class="btn ghost xs" onclick="opP('${e(p.name)}')" title="${hasXuid?'Zum OP machen':'Spieler muss zuerst beitreten'}"${hasXuid?'':' disabled'}>OP</button>`;
    return `<tr><td><strong>${e(p.name)}</strong><br><span class="dim xs2">${e(p.xuid||'—')}</span></td><td>${opBtn}</td><td><button class="btn danger xs" onclick="wlRemove('${e(p.name)}')">✕</button></td></tr>`;
  }).join('');
}
// Fügt einen neuen Spieler per Namenseingabe zur Whitelist hinzu
async function wlAdd2(){const n=document.getElementById('wl-name').value.trim();if(!n)return;const r=await api('whitelist_add',{name:n});toast(r.message,r.success?'success':'warn');if(r.success){document.getElementById('wl-name').value='';loadWl();}}
// Entfernt einen Spieler nach Bestätigung aus der Whitelist
async function wlRemove(n){if(!confirm(`${n} von Whitelist entfernen?`))return;const r=await api('whitelist_remove',{name:n});toast(r.message||(r.success?'Entfernt':'Fehler'),r.success?'success':'error');if(r.success)loadWl();}

// ═══ EINSTELLUNGEN ════════════════════════════════════════
// Lädt Panel-Einstellungen und befüllt alle Tabs; zeigt Updates-Tab als Standard
async function loadSettings(){
  const s=await api('get_settings');
  document.getElementById('dc-webhook').value=s.discord_webhook||'';
  const updOn=document.getElementById('upd-check-on');
  const updTime=document.getElementById('upd-check-time');
  if(updOn)updOn.checked=s.update_check_enabled||false;
  if(updTime)updTime.value=s.update_check_time||'04:00';
  const events=s.discord_events||{};
  document.querySelectorAll('.dc-evt').forEach(cb=>{cb.checked=events[cb.dataset.event]||false;});
  checkVer();
  checkPanelUpdate();
}
// Wechselt zwischen den Haupt-Tabs der Einstellungen und lädt Tab-spezifische Daten
function switchSettingsTab(tab,btn){
  document.getElementById('settings-tabs').querySelectorAll('.tb').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('#page-settings>.stp').forEach(p=>p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('set-'+tab).classList.add('active');
  if(tab==='updates'){checkVer();checkPanelUpdate();}
  if(tab==='backups'){loadBk();loadBackupSchedule();}
  if(tab==='schedules'){loadRestartSchedule();loadSettings();}
}
// Lädt den Auto-Restart-Zeitplan aus den gespeicherten Einstellungen
async function loadRestartSchedule(){
  const s=await api('get_settings');
  document.getElementById('restart-sched-on').checked=s.restart_schedule_enabled||false;
  document.getElementById('restart-sched-time').value=s.restart_schedule_time||'06:00';
}
// Speichert den Auto-Restart-Zeitplan
async function saveRestartSchedule(){
  const enabled=document.getElementById('restart-sched-on').checked;
  const time=document.getElementById('restart-sched-time').value;
  const r=await api('save_restart_schedule',{enabled:enabled?'true':'false',time});
  toast(r.message||(r.success?'Gespeichert':'Fehler'),r.success?'success':'error');
}
// Prüft ob ein Panel-Update verfügbar ist und zeigt den Update-Button bei Bedarf
async function checkPanelUpdate(force){
  const cont=document.getElementById('panel-upd-cont');
  const ub=document.getElementById('panel-ub');
  const pCur=document.getElementById('p-cur');
  const pLat=document.getElementById('p-lat');
  if(ub){ub.style.display='none';ub.innerHTML='';}
  if(pCur)pCur.textContent='...';
  if(pLat)pLat.textContent='...';
  try{
    const r=await api('check_panel_update',force?{force:1}:{});
    if(pCur)pCur.textContent=r.current||'?';
    if(pLat)pLat.textContent=r.latest||'?';
    let ubHtml='';
    let contHtml='';
    if(!r.has_update_script){
      ubHtml=`<div class="ub warn2" style="margin:0"><div>⚠️</div><div>Update-Skript fehlt. Einmalig über die Shell ausführen:<br><code style="font-size:11px;word-break:break-all">curl -fsSL https://raw.githubusercontent.com/Ronny-1979/mcadmin/main/install.sh | sudo bash -s -- --update</code></div></div>`;
    }else if(r.update_available){
      ubHtml=`<div class="ub" style="margin:0"><div>🔔</div><div><strong>Update verfügbar!</strong> Aktuelle Konfiguration und Passwörter bleiben erhalten.</div></div>`;
      contHtml=`<button class="btn warn" id="btn-panel-upd" onclick="startPanelUpdate()" style="margin-top:4px">⬆ Panel jetzt aktualisieren</button>`;
    }else{
      ubHtml=`<div class="ub good" style="margin:0"><div>✅</div><div><strong class="tg">Aktuell!</strong> Panel ist auf dem neuesten Stand.</div></div>`;
    }
    contHtml+=`<div id="panel-upd-log"></div>`;
    if(ub&&ubHtml){ub.innerHTML=ubHtml;ub.style.display='';}
    if(cont)cont.innerHTML=contHtml;
  }catch(err){if(cont)cont.innerHTML='<div class="dim xs2">Prüfung fehlgeschlagen</div>';}
}
let panelUpdTimer=null;
// Startet das Panel-Update nach Bestätigung und pollt den Fortschritt
async function startPanelUpdate(){
  if(!confirm('Panel jetzt aktualisieren?\n\nDie Seite lädt danach automatisch neu. Der Minecraft-Server läuft weiter.'))return;
  const btn=document.getElementById('btn-panel-upd');if(btn)btn.disabled=true;
  const r=await api('start_panel_update');
  if(!r.success){toast(r.message||'Fehler','error',7000);if(btn)btn.disabled=false;return;}
  toast('Panel-Update gestartet...','info');
  if(panelUpdTimer)clearInterval(panelUpdTimer);
  panelUpdTimer=setInterval(pollPanelUpd,2000);
}
// Fragt den Panel-Update-Status ab und zeigt Ergebnis oder Fehler-Log an
async function pollPanelUpd(){
  const s=await api('panel_update_status');
  const log=document.getElementById('panel-upd-log');
  if(log&&s.message)log.innerHTML=`<div class="dim xs2" style="font-style:italic;margin-top:8px">${e(s.message)}</div>`;
  if(s.step==='complete'&&s.status==='done'){
    clearInterval(panelUpdTimer);panelUpdTimer=null;
    toast('Panel aktualisiert! Seite wird neu geladen...','success',4000);
    setTimeout(()=>location.reload(),3000);
  }else if(s.status==='error'){
    clearInterval(panelUpdTimer);panelUpdTimer=null;
    const btn=document.getElementById('btn-panel-upd');if(btn)btn.disabled=false;
    // Vollständigen Log laden und anzeigen
    try{
      const logR=await api('get_panel_update_log');
      const logEl=document.getElementById('panel-upd-log');
      if(logEl&&logR.lines&&logR.lines.length){
        logEl.innerHTML='<pre style="font-size:11px;background:var(--bg);border:1px solid var(--border);padding:10px;border-radius:6px;max-height:300px;overflow-y:auto;margin-top:8px;white-space:pre-wrap;word-break:break-all">'+e(logR.lines.join('\n'))+'</pre>';
      }
    }catch(_){}
    toast('Update fehlgeschlagen — Log unten angezeigt','error',8000);
  }
}

// Speichert die automatische Update-Prüfung (Minecraft + Panel)
async function saveUpdateCheckSchedule(){
  const enabled=document.getElementById('upd-check-on').checked;
  const time=document.getElementById('upd-check-time').value||'04:00';
  const r=await api('save_update_check_schedule',{enabled:enabled?'true':'false',time});
  toast(r.message||(r.success?'Gespeichert':'Fehler'),r.success?'success':'error');
}
// Führt eine manuelle Update-Prüfung aus und sendet bei neuem Fund Discord-Hinweis
async function runUpdateCheckNow(){
  toast('Prüfe Minecraft- und Panel-Updates...','info');
  const r=await api('run_update_check_now');
  if(!r.success){toast(r.message||'Prüfung fehlgeschlagen','error');return;}
  const mc=r.minecraft||{};
  const pa=r.panel||{};
  const found=[];
  if(mc.update_available)found.push(`Minecraft ${mc.current} → ${mc.latest}`);
  if(pa.update_available)found.push(`Panel ${pa.current} → ${pa.latest}`);
  toast(found.length?('Update verfügbar: '+found.join(' · ')):'Alles aktuell',found.length?'warn':'success',7000);
}

// Speichert Discord-Webhook-URL und Event-Einstellungen
async function saveDc(){
  const webhook=document.getElementById('dc-webhook').value.trim();
  const events={};
  document.querySelectorAll('.dc-evt').forEach(cb=>{events[cb.dataset.event]=cb.checked;});
  const r=await api('save_discord',{webhook,events:JSON.stringify(events)});
  toast(r.message,r.success?'success':'error');
}
// Sendet eine Test-Nachricht an den eingetragenen Discord-Webhook
async function testDiscord(){
  const webhook=document.getElementById('dc-webhook').value.trim();
  if(!webhook){toast('Bitte zuerst Webhook URL eingeben','warn');return;}
  toast('Sende Test-Nachricht...','info');
  const r=await api('test_discord',{webhook});
  toast(r.message,r.success?'success':'error');
}
// Ändert das Admin-Passwort nach Prüfung von altem Passwort und Bestätigung
async function changePw(){
  const old=document.getElementById('pw-old').value;
  const nw=document.getElementById('pw-new').value;
  const cf=document.getElementById('pw-confirm').value;
  const r=await api('change_password',{old_password:old,new_password:nw,confirm_password:cf});
  toast(r.message,r.success?'success':'error');
  if(r.success){document.getElementById('pw-old').value='';document.getElementById('pw-new').value='';document.getElementById('pw-confirm').value='';}
  else{document.getElementById('pw-new').value='';document.getElementById('pw-confirm').value='';}
}
// Ändert den Admin-Benutzernamen nach Passwort-Bestätigung
async function changeUser(){
  const user=document.getElementById('user-new').value.trim();
  const pw=document.getElementById('user-pw').value;
  const r=await api('change_username',{username:user,password:pw});
  toast(r.message,r.success?'success':'error');
  if(r.success){document.getElementById('user-pw').value='';setTimeout(()=>location.reload(),1500);}
}
// Wechselt den aktiven Tab im Einstellungen-Panel
function switchSetTab(tab,btn){
  const c=btn.closest('.card');
  c.querySelectorAll('.tb').forEach(b=>b.classList.remove('active'));
  c.querySelectorAll('.tp').forEach(p=>p.classList.remove('active'));
  btn.classList.add('active');document.getElementById('set-tab-'+tab).classList.add('active');
}

// ═══ SIDEBAR ══════════════════════════════════════════════
// Öffnet oder schließt die Seitennavigation auf mobilen Geräten
function toggleSidebar(){
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
}
// Schließt die Seitennavigation
function closeSidebar(){
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
}

// ═══ MODALS ═══════════════════════════════════════════════
// Öffnet ein Modal-Fenster anhand der Element-ID
function openModal(id){document.getElementById(id).classList.remove('hidden');}
// Schließt ein Modal-Fenster anhand der Element-ID
function closeModal(id){document.getElementById(id).classList.add('hidden');}
document.addEventListener('keydown',ev=>{if(ev.key==='Escape')document.querySelectorAll('.modal-bg:not(.hidden)').forEach(m=>m.classList.add('hidden'));});
document.addEventListener('DOMContentLoaded',()=>updateThemeButtons());
document.addEventListener('click',ev=>{if(ev.target.classList.contains('modal-bg'))ev.target.classList.add('hidden');});

// ═══ DRAG & DROP ══════════════════════════════════════════
// Richtet Drag-&-Drop auf einer Drop-Zone ein und delegiert an ein File-Input-Element
function setupDrop(zId,iId,fn){
  const z=document.getElementById(zId);if(!z)return;
  z.addEventListener('dragover',ev=>{ev.preventDefault();z.classList.add('dv');});
  z.addEventListener('dragleave',()=>z.classList.remove('dv'));
  z.addEventListener('drop',ev=>{ev.preventDefault();z.classList.remove('dv');const i=document.getElementById(iId);const dt=new DataTransfer();dt.items.add(ev.dataTransfer.files[0]);i.files=dt.files;fn(i);});
}

// ═══ UTIL ═════════════════════════════════════════════════
// Maskiert einen String für sichere HTML-Ausgabe (XSS-Schutz)
function e(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}

// ═══ INIT ═════════════════════════════════════════════════
(async function(){
  setTheme(getTheme());
  await refreshStatus();
  setInterval(refreshStatus,10000);
  setupDrop('bk-drop','bk-imp',importBk);
  setupDrop('pk-drop','pk-file',uploadPack);
  setupDrop('wld-drop','wld-file',uploadWorld);
})();
