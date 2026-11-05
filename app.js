(function(){
"use strict";
const SB_URL="https://anwobosqhxzefyddyiju.supabase.co";
const SB_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFud29ib3NxaHh6ZWZ5ZGR5aWp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4Mzk5MDIsImV4cCI6MjEwOTQxNTkwMn0.zTTyySxAoOGBZwFNYj05rGfl2OsJqUkR0gt8a5ITA14";
const HDR={apikey:SB_KEY,Authorization:"Bearer "+SB_KEY,"Content-Type":"application/json"};
const SITE="https://netsecdan1.github.io/nyc-board/";
const TRIP_SIZE=6;
const HOTEL=[40.7594,-73.9829];

let DAYS=[],IDEAS=[],BOOKINGS=[],DAYMAP={};
const HEX={mon:"#ee352e",tue:"#00933c",wed:"#ff6319",thu:"#b933ad"};
const COLORS={mon:"var(--mon)",tue:"var(--tue)",wed:"var(--wed)",thu:"var(--thu)",any:"var(--muted)"};
const KINDS={do:"Do",see:"See",eat:"Eat",shop:"Shop"};
const STATUS={planned:"In the plan",maybe:"Maybe",nofit:"Won't fit"};
const SUGGEST=[
 ["See the Rockefeller tree lit up","see"],["Eat a real NY bagel","eat"],["Grab a NY pizza slice","eat"],["See a Broadway show","do"],
 ["Go ice skating","do"],["See the Statue of Liberty","see"],["Go up the Empire State Building","see"],["Shop Fifth Avenue","shop"],
 ["Knockoff bags on Canal St","shop"],["Dim sum in Chinatown","eat"],["Hot chocolate somewhere cozy","eat"],["Horse carriage in Central Park","do"]];

const S={day:"mon",sort:"top",dumpF:"top",kind:"do",me:null,code:null,organizer:null,
  travelers:{},votes:[],ideas:[],dumps:[],bookings:{},loaded:false,err:null,pending:{},active:null,lastSig:"",joinKey:null};
const $=id=>document.getElementById(id);
const el=(tag,attrs,...kids)=>{const e=document.createElement(tag);if(attrs)for(const[k,v]of Object.entries(attrs)){if(v==null||v===false)continue;if(k==="class")e.className=v;else if(k==="text")e.textContent=v;else if(k.startsWith("on"))e.addEventListener(k.slice(2),v);else e.setAttribute(k,v===true?"":v)}for(const k of kids)if(k!=null)e.append(k);return e};
const mapUrl=q=>"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(q);
const store={get(k){try{return JSON.parse(localStorage.getItem(k))}catch(_){return null}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(_){}},del(k){try{localStorage.removeItem(k)}catch(_){}}};
const isHotel=ll=>ll&&Math.abs(ll[0]-HOTEL[0])<1e-4&&Math.abs(ll[1]-HOTEL[1])<1e-4;
const reduced=()=>window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- api ---------- */
async function rpc(fn,args){
  const r=await fetch(SB_URL+"/rest/v1/rpc/"+fn,{method:"POST",headers:HDR,body:JSON.stringify(args)});
  if(!r.ok){let m="";try{m=(await r.json()).message||""}catch(_){};const e=new Error(m||("HTTP "+r.status));e.code=m;throw e}
  const txt=await r.text();return txt?JSON.parse(txt):null;
}
function applyBoard(b){
  const c=b.content||{};DAYS=c.days||[];IDEAS=c.ideas||[];BOOKINGS=c.bookings||[];DAYMAP=Object.fromEntries(DAYS.map(d=>[d.id,d]));
  if(!DAYMAP[S.day]&&DAYS[0])S.day=DAYS[0].id;
  S.organizer=(b.organizer||"").toLowerCase();
  S.travelers=Object.fromEntries((b.travelers||[]).map(t=>[t.id,t.name]));
  S.votes=b.votes||[];S.ideas=(b.ideas||[]).map(x=>({id:"u-"+x.id,raw:x.id,t:x.title,n:x.note,d:x.day,c:x.cost,by:x.traveler_id}));
  S.dumps=b.dumps||[];S.bookings=Object.fromEntries((b.bookings||[]).map(x=>[x.item_id,x]));
  S.loaded=true;S.err=null;
  if(S.me&&!S.travelers[S.me.id]){S.me=null;store.del("nyc-me")}
}
let loading=false;
async function loadAll(force){
  if(!S.code||loading)return;loading=true;let changed=false;
  try{const b=await rpc("get_board",{code:S.code});const sig=JSON.stringify(b);
    if(force||sig!==S.lastSig){S.lastSig=sig;applyBoard(b);changed=true}
    const wasErr=!!S.err;S.err=null;if(wasErr)changed=true;showApp(true)}
  catch(e){if(/bad_code|expired/.test(e.code||"")){S.code=null;S.me=null;store.del("nyc-code");store.del("nyc-me");showApp(false,errText(e));loading=false;return}
    S.err="Can't reach the family board right now. Showing the last thing we loaded.";changed=true}
  finally{loading=false}
  if(changed&&S.loaded&&S.code)renderAll();
}
function showApp(on,msg){
  $("lockForm").hidden=on;$("app").hidden=!on;$("secnav").hidden=!on;
  if(!on){$("lMsg").textContent=msg||"";$("lBtn").disabled=false}
  if(on)setTimeout(()=>MAP.resize(),50);
}
function errText(e){
  const m=(e&&e.code)||"";
  if(/bad_code/.test(m))return"That code doesn't match. Check the text you were sent.";
  if(/expired/.test(m))return"This trip board has closed.";
  if(/too_many_people/.test(m))return"The trip is full. Ask Colton to add you.";
  if(/bad_name/.test(m))return"Names need 1–30 characters.";
  if(/too_many/.test(m))return"The board is full. Remove something old first.";
  if(/not_organizer/.test(m))return"Only the organizer can set that.";
  return"Couldn't save that. Check your connection and try again.";
}

/* ---------- derived ---------- */
function pickOf(tid,idea){const pk=S.pending[tid+"|"+idea];if(pk!==undefined)return pk==="__none"?undefined:pk;const v=S.votes.find(v=>v.traveler_id===tid&&v.idea_id===idea);return v&&v.pick!=="none"?v.pick:undefined}
function tally(idea){let yes=0,no=0,yesWho=[];for(const tid of Object.keys(S.travelers)){const p=pickOf(tid,idea);if(p==="in"){yes++;yesWho.push(tid)}else if(p==="skip")no++}return{yes,no,yesWho}}
function voterCount(){const ids=new Set();S.votes.forEach(v=>{if(v.pick!=="none"&&!v.idea_id.startsWith("d-"))ids.add(v.traveler_id)});return ids.size}
function isPicked(idea){const{yes,no}=tally(idea);return yes>0&&yes>no&&yes>=Math.max(1,Math.ceil(voterCount()/2))}
const nameOf=tid=>S.travelers[tid]||"Someone";
const initials=tid=>nameOf(tid).split(/\s+/).slice(0,2).map(s=>s[0]).join("").toUpperCase();
const allIdeas=()=>IDEAS.concat(S.ideas);
const amOrganizer=()=>!!(S.me&&S.organizer&&S.me.name.toLowerCase()===S.organizer);
function numbered(day){let n=0;return day.stops.map(s=>{if(!s.ll)return{s,n:null};if(isHotel(s.ll))return{s,n:"H"};n++;return{s,n}})}

/* ---------- actions ---------- */
async function vote(idea,val){
  if(!S.me)return askJoin();
  const cur=pickOf(S.me.id,idea);const next=cur===val?null:val;
  const key=S.me.id+"|"+idea;S.pending[key]=next===null?"__none":next;
  renderAll();
  try{await rpc("cast_vote",{code:S.code,traveler:S.me.id,idea,choice:next});
    const v=S.votes.find(v=>v.traveler_id===S.me.id&&v.idea_id===idea);if(v)v.pick=next||"none";else S.votes.push({traveler_id:S.me.id,idea_id:idea,pick:next||"none"});}
  catch(e){flash(errText(e))}
  finally{delete S.pending[key];renderAll()}
}
async function addDump(body,kind){
  const r=await rpc("add_dump",{code:S.code,traveler:S.me.id,body:body.slice(0,200),kind});
  if(r)S.dumps.push(r);renderDumps();renderTracker();
}
function flash(msg){S.err=msg;setStatus();setTimeout(()=>{if(S.err===msg){S.err=null;setStatus()}},5000)}
let toastT;function toast(msg){const t=$("toast");t.textContent=msg;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{t.hidden=true},2600)}
function askJoin(){const b=$("joinBox");b.scrollIntoView({behavior:"smooth",block:"center"});const n=$("jName");if(n)setTimeout(()=>n.focus(),300)}
async function shareInvite(){
  const url=SITE+"#"+encodeURIComponent(S.code);
  const text="Our NYC trip board. Tap the link, type your first name, then add everything you want to do:";
  if(navigator.share){try{await navigator.share({title:"NYC Christmas '26",text,url});return}catch(e){if(e&&e.name==="AbortError")return}}
  try{await navigator.clipboard.writeText(text+" "+url);toast("Invite link copied. Paste it in your group text.")}
  catch(_){prompt("Copy this link:",url)}
}

/* ---------- map ---------- */
const MAP={m:null,tiles:null,layer:null,markers:[],dayId:null,
  ok(){return !!window.L&&!!$("map")},
  init(){
    if(this.m||!this.ok())return;
    this.m=L.map("map",{zoomControl:true,scrollWheelZoom:false,tap:true,attributionControl:true}).setView(HOTEL,13);
    this.setTiles();
    if(window.matchMedia)matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change",()=>this.setTiles());
    this.layer=L.layerGroup().addTo(this.m);
  },
  setTiles(){
    const dark=window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches;
    if(this.tiles)this.tiles.remove();
    this.tiles=L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/"+(dark?"dark_all":"voyager")+"/{z}/{x}/{y}{r}.png",
      {maxZoom:19,subdomains:"abcd",attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'}).addTo(this.m);
  },
  resize(){if(this.m)this.m.invalidateSize()},
  draw(day,refit){
    if(!this.ok())return;this.init();
    const col=HEX[day.id]||"#555";this.layer.clearLayers();this.markers=[];if(this.altLayer)this.altLayer.clearLayers();
    const pts=[];let prev=null,transit=false;
    numbered(day).forEach(({s,n},idx)=>{
      if(s.tr&&!s.ll){transit=true;return}
      if(!s.ll)return;
      if(prev){
        const seg=[prev,s.ll];const isT=transit;
        L.polyline(seg,isT?{color:col,weight:3,opacity:.55,dashArray:"1 9",lineCap:"round",className:"route-transit"}:{color:col,weight:4,opacity:.95,dashArray:"2 10",lineCap:"round",className:"route-walk"}).addTo(this.layer);
      }
      transit=!!s.tr;prev=Object.assign([s.ll[0],s.ll[1]],{tr:!!s.tr});
      pts.push(s.ll);
      const hotel=n==="H";
      const icon=L.divIcon({className:"",iconSize:hotel?[30,30]:[28,28],iconAnchor:hotel?[15,15]:[14,14],
        html:'<div class="pin'+(hotel?" pin-h":"")+(s.tr?" pin-t":"")+'" style="--c:'+col+'">'+(hotel?"H":n)+"</div>"});
      const mk=L.marker(s.ll,{icon,zIndexOffset:hotel?-100:idx,keyboard:true,title:s.h}).addTo(this.layer);
      mk.bindTooltip((hotel?"Hotel · ":n+". ")+s.t+" "+s.h.replace(/^Bite \d · /,""),{direction:"top",offset:[0,-14]});
      mk.on("click",()=>setActive(idx,true));
      this.markers[idx]=mk;
    });
    allIdeas().filter(i=>i.d===day.id&&i.ll&&isPicked(i.id)).forEach(i=>{
      const icon=L.divIcon({className:"",iconSize:[26,26],iconAnchor:[13,13],html:'<div class="pin pin-pick" style="--c:'+col+'">★</div>'});
      L.marker(i.ll,{icon,zIndexOffset:500,title:i.t}).addTo(this.layer).bindTooltip("Family pick · "+i.t,{direction:"top",offset:[0,-12]});
    });
    if((refit||this.dayId!==day.id)&&pts.length){this.m.fitBounds(L.latLngBounds(pts).pad(.12),{animate:!reduced(),maxZoom:16})}
    this.dayId=day.id;
    if(S.active!=null)this.focus(S.active,false);
  },
  showAlts(stop,alts){
    if(!this.m)return;if(this.altLayer)this.altLayer.clearLayers();else this.altLayer=L.layerGroup().addTo(this.m);
    if(!stop||!alts)return;const col=HEX[S.day]||"#555";const pts=[stop.ll];
    alts.filter(a=>a.ll).forEach(a=>{pts.push(a.ll);
      const icon=L.divIcon({className:"",iconSize:[24,24],iconAnchor:[12,12],html:'<div class="pin pin-alt" style="--c:'+col+'">L</div>'});
      L.marker(a.ll,{icon,zIndexOffset:400,title:a.t}).addTo(this.altLayer).bindTooltip("Local pick · "+a.t+" ("+(a.c||"")+")",{direction:"top",offset:[0,-12]});
      L.polyline([stop.ll,a.ll],{color:col,weight:2,opacity:.5,dashArray:"4 6"}).addTo(this.altLayer);});
    this.m.closeTooltip&&this.layer.eachLayer(l=>l.closeTooltip&&l.closeTooltip());
    if(pts.length>1)this.m.fitBounds(L.latLngBounds(pts).pad(.25),{animate:!reduced(),maxZoom:15});
  },
  focus(idx,fly){
    const mk=this.markers[idx];if(!mk)return;
    document.querySelectorAll(".pin.on").forEach(p=>p.classList.remove("on"));
    const p=mk.getElement()&&mk.getElement().querySelector(".pin");if(p)p.classList.add("on");
    if(fly)this.m.flyTo(mk.getLatLng(),Math.max(this.m.getZoom(),16),{duration:reduced()?0:.6});
    mk.openTooltip();
  }
};
function setActive(idx,fromMap){
  S.active=idx;
  document.querySelectorAll(".stop.on").forEach(x=>x.classList.remove("on"));
  const li=document.querySelector('.stop[data-i="'+idx+'"]');if(li){li.classList.add("on");if(fromMap)li.scrollIntoView({behavior:reduced()?"auto":"smooth",block:"nearest"})}
  if(!fromMap&&window.innerWidth<900){const mb=document.querySelector(".mapbox");const r=mb.getBoundingClientRect();if(r.top<56||r.bottom>window.innerHeight)mb.scrollIntoView({behavior:reduced()?"auto":"smooth",block:"start"})}
  MAP.focus(idx,!fromMap);
}
function routeLink(day){
  const pts=day.stops.filter(s=>s.ll).map(s=>s.ll.join(","));
  const uniq=pts.filter((p,i)=>p!==pts[i-1]);if(uniq.length<2)return null;
  const way=uniq.slice(1,-1).slice(0,8);
  return "https://www.google.com/maps/dir/?api=1&origin="+uniq[0]+"&destination="+uniq[uniq.length-1]+(way.length?"&waypoints="+encodeURIComponent(way.join("|")):"");
}

/* ---------- render ---------- */
function altsBox(alts,onOpen){
  const d=el("details",{class:"alts"},el("summary",{},el("span",{class:"alttag",text:"Local picks"}),el("span",{text:alts.length===1?"1 cheaper or local option":alts.length+" cheaper or local options"})));
  const ul=el("ul",{});
  alts.forEach(a=>ul.append(el("li",{},el("div",{class:"althead"},el("b",{text:a.t}),el("span",{class:"tag",text:a.c||""})),el("p",{text:a.n}),a.q?el("a",{class:"maplink",href:mapUrl(a.q),target:"_blank",rel:"noopener",onclick:e=>e.stopPropagation(),text:"Directions"}):null)));
  d.append(ul);
  d.addEventListener("click",e=>e.stopPropagation());
  if(onOpen)d.addEventListener("toggle",()=>onOpen(d.open));
  return d;
}
function renderJoin(){
  const key=S.me?("me:"+S.me.id+":"+(S.me.name)):"join";
  if(key===S.joinKey)return;S.joinKey=key;
  const box=$("joinBox");box.replaceChildren();
  if(S.me){
    box.append(el("div",{class:"mebar"},
      el("span",{class:"av",text:initials(S.me.id)}),
      el("span",{class:"mename"},"You're in as ",el("b",{text:S.me.name}),amOrganizer()?el("span",{class:"orgtag",text:"Organizer"}):null),
      el("button",{type:"button",class:"ghost",onclick:shareInvite,text:"Invite family"}),
      el("button",{type:"button",class:"linkbtn",onclick:()=>{S.me=null;store.del("nyc-me");renderAll()},text:"Not you?"})));
    return;
  }
  const f=el("form",{class:"join",id:"joinForm"},
    el("h3",{text:"Who's this?"}),
    el("p",{text:"Type your first name once and this phone will remember you. Use the same name on every device."}),
    el("label",{for:"jName"},"Your first name",el("input",{id:"jName",maxlength:"30",autocomplete:"given-name",required:true,placeholder:"e.g. Mom"})),
    el("div",{class:"dumprow"},el("button",{class:"primary",type:"submit",id:"jBtn",text:"Join the trip"}),el("span",{class:"formmsg",id:"jMsg","aria-live":"polite"})));
  f.addEventListener("submit",async e=>{
    e.preventDefault();const name=$("jName").value.trim();
    if(!name){$("jMsg").textContent="Add your name first.";return}
    $("jBtn").disabled=true;$("jMsg").textContent="Joining…";
    try{const t=await rpc("join_trip",{code:S.code,traveler_name:name});S.me={id:t.id,name:t.name};S.travelers[t.id]=t.name;store.set("nyc-me",S.me);renderAll();loadAll(true);
      toast("Welcome, "+t.name+". Start with the brain dump.");setTimeout(()=>$("dumpH").scrollIntoView({behavior:reduced()?"auto":"smooth",block:"start"}),400)}
    catch(err){$("jMsg").textContent=errText(err);$("jBtn").disabled=false}
  });
  box.append(f);
}
function setStatus(){
  const s=$("status"),t=$("statusText");
  if(S.err){s.hidden=false;s.className="status warn";t.textContent=S.err;return}
  s.hidden=true;
}
function renderTracker(){
  const box=$("tracker");box.replaceChildren();
  const ids=Object.keys(S.travelers);
  const counts={};S.dumps.forEach(d=>counts[d.traveler_id]=(counts[d.traveler_id]||0)+1);
  ids.forEach(id=>{const n=counts[id]||0;box.append(el("span",{class:"who-chip"+(n?" has":"")},el("span",{class:"av sm",text:initials(id)}),el("span",{text:nameOf(id)}),el("b",{text:n?String(n):"0"})))});
  const waiting=Math.max(0,TRIP_SIZE-ids.length);
  if(waiting)box.append(el("button",{type:"button",class:"who-chip wait",onclick:()=>S.me?shareInvite():askJoin()},el("span",{text:waiting+(waiting===1?" more to join":" more to join")}),el("b",{text:S.me?"Invite":"+"})));
}
function renderSuggest(){
  const box=$("suggest");box.replaceChildren();
  const have=new Set(S.dumps.map(d=>d.body.trim().toLowerCase()));
  const left=SUGGEST.filter(([t])=>!have.has(t.toLowerCase()));
  if(!left.length){box.hidden=true;return}
  box.hidden=false;
  box.append(el("div",{class:"eyebrow",text:"Quick add · tap any that you want"}));
  const row=el("div",{class:"sugrow"});
  const shown=S.sugAll?left:left.slice(0,6);
  shown.forEach(([t,k])=>row.append(el("button",{type:"button",class:"sug k-"+k,onclick:async ev=>{
    if(!S.me)return askJoin();const b=ev.currentTarget;b.disabled=true;
    try{await addDump(t,k);toast("Added: "+t);renderSuggest()}catch(e){b.disabled=false;flash(errText(e))}}},el("span",{class:"plus","aria-hidden":"true",text:"+"}),t)));
  if(left.length>shown.length)row.append(el("button",{type:"button",class:"sug more",onclick:()=>{S.sugAll=true;renderSuggest()},text:"Show "+(left.length-shown.length)+" more"}));
  box.append(row);
}
function renderDumps(){
  const box=$("dumps");box.replaceChildren();
  let list=S.dumps.map(d=>({d,tl:tally("d-"+d.id)}));
  if(S.dumpF==="top")list.sort((a,b)=>b.tl.yes-a.tl.yes||new Date(b.d.created_at)-new Date(a.d.created_at));
  else if(S.dumpF==="new")list.reverse();
  else list=list.filter(x=>S.me&&x.d.traveler_id===S.me.id).reverse();
  $("dumpCount").textContent=S.dumps.length?S.dumps.length+(S.dumps.length===1?" idea":" ideas"):"";
  if(!list.length){box.append(el("div",{class:"empty",text:S.dumpF==="mine"?(S.me?"You haven't added anything yet. Tap a quick add above or type your own.":"Join above to add yours."):"Nothing here yet. Add the first thing you're dying to do."}));return}
  const org=amOrganizer();
  for(const{d,tl}of list){
    const own=S.me&&d.traveler_id===S.me.id;
    const others=tl.yesWho.filter(x=>x!==d.traveler_id);
    const mine=S.me&&pickOf(S.me.id,"d-"+d.id)==="in";
    const by=el("div",{class:"by"},el("span",{class:"ktag k-"+(KINDS[d.kind]?d.kind:"do"),text:KINDS[d.kind]||"Do"}),el("span",{text:nameOf(d.traveler_id)+(others.length?" · also "+others.map(nameOf).join(", "):"")}));
    if(d.status&&STATUS[d.status])by.append(el("span",{class:"st st-"+d.status,text:STATUS[d.status]}));
    if(own)by.append(el("button",{type:"button",class:"linkbtn",onclick:async()=>{try{await rpc("hide_dump",{code:S.code,traveler:S.me.id,dump:d.id});S.dumps=S.dumps.filter(x=>x.id!==d.id);renderDumps();renderTracker();renderSuggest()}catch(e){flash(errText(e))}},text:"Remove"}));
    const art=el("article",{class:"dump"+(d.status==="nofit"?" dim":"")},el("p",{text:d.body}),
      own?el("span",{class:"who",text:others.length?others.length+" also want this":""}):el("button",{type:"button",class:"metoo","aria-pressed":String(!!mine),onclick:()=>vote("d-"+d.id,"in"),text:mine?"Me too ✓":"Me too"+(others.length?" · "+others.length:"")}),by);
    if(org){
      const seg=el("div",{class:"orgseg",role:"group","aria-label":"Organizer status"});
      [["planned","Planned"],["maybe","Maybe"],["nofit","Won't fit"],["new","Clear"]].forEach(([v,l])=>seg.append(el("button",{type:"button","aria-pressed":String((d.status||"new")===v&&v!=="new"),onclick:async()=>{const old=d.status;d.status=v;renderDumps();try{await rpc("set_dump_status",{code:S.code,traveler:S.me.id,dump:d.id,new_status:v})}catch(e){d.status=old;renderDumps();flash(errText(e))}},text:l})));
      art.append(seg);
    }
    box.append(art);
  }
}
function renderTabs(){
  const t=$("tabs");t.replaceChildren();
  for(const d of DAYS)t.append(el("button",{type:"button",role:"tab",class:"tab","aria-selected":String(S.day===d.id),"aria-controls":"day",id:"tab-"+d.id,style:"--daycol:"+COLORS[d.id],onclick:()=>{if(S.day===d.id)return;S.day=d.id;S.active=null;store.set("nyc-day",d.id);renderTabs();renderDay(true)}},el("span",{class:"bullet b-"+d.id,"aria-hidden":"true",text:d.b}),el("span",{class:"tabname",text:d.name.split(" ")[0]}),el("span",{class:"tabdate",text:d.name.replace(/^\w+ /,"")})));
}
function renderDay(refit){
  const d=DAYMAP[S.day];if(!d)return;const box=$("day");
  $("plan").style.setProperty("--daycol",COLORS[d.id]);box.setAttribute("aria-labelledby","tab-"+d.id);box.replaceChildren();
  const rl=routeLink(d);
  box.append(el("div",{class:"dayhead"},el("div",{class:"eyebrow",text:d.name}),el("h3",{text:d.title}),
    el("div",{class:"dayacts"},el("span",{class:"who",text:"Tap any stop to see it on the map above"}),rl?el("a",{class:"maplink",href:rl,target:"_blank",rel:"noopener",text:"Open today's route in Google Maps"}):null)));
  if(d.note)box.append(el("div",{class:"note",text:d.note}));
  const ol=el("ol",{class:"stops"});
  numbered(d).forEach(({s,n},idx)=>{
    const body=el("div",{class:"sbody"},el("h4",{},s.crawl?el("span",{class:"crawl",text:"Crawl"}):null,s.crawl?" ":null,s.h),el("p",{text:s.p}));
    if(s.tags||s.q){const tg=el("div",{class:"tags"});(s.tags||[]).forEach(x=>tg.append(el("span",{class:"tag"+(x==="Book ahead"?" book":""),text:x})));if(s.q)tg.append(el("a",{class:"maplink",href:mapUrl(s.q),target:"_blank",rel:"noopener",onclick:e=>e.stopPropagation(),text:"Directions"}));body.append(tg)}
    if(s.alts&&s.alts.length)body.append(altsBox(s.alts,open=>{if(open){setActive(idx,false);MAP.showAlts(s,s.alts)}else MAP.showAlts(null)}));
    const li=el("li",{class:"stop"+(s.tr?" transit":"")+(S.active===idx?" on":""),"data-i":String(idx),tabindex:s.ll?"0":null,role:s.ll?"button":null,"aria-label":s.ll?s.t+" "+s.h+", show on map":null},
      el("div",{class:"time",text:s.t}),el("div",{class:"node"+(n==="H"?" h":""),"aria-hidden":"true",text:n==null?"":String(n)}),body);
    if(s.ll){li.addEventListener("click",()=>setActive(idx,false));li.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setActive(idx,false)}})}
    ol.append(li);
  });
  box.append(ol);
  const picks=allIdeas().filter(i=>i.d===d.id&&isPicked(i.id));
  const pk=el("div",{class:"picks"},el("h4",{text:"Family picks for this day"}));
  if(picks.length){const c=el("div",{class:"chips"});picks.forEach(i=>c.append(el("span",{class:"chip",text:"★ "+i.t})));pk.append(c)}
  else pk.append(el("div",{class:"who",text:"Nothing voted in yet. Extras the group wants will appear here and on the map."}));
  box.append(pk);
  MAP.draw(d,refit);
}
function renderIdeas(){
  const box=$("ideas");box.replaceChildren();
  let list=allIdeas().map(i=>({i,tl:tally(i.id)}));
  const order=["mon","tue","wed","thu","any"];
  if(S.sort==="top")list.sort((a,b)=>(b.tl.yes-b.tl.no)-(a.tl.yes-a.tl.no)||b.tl.yes-a.tl.yes);
  else if(S.sort==="day")list.sort((a,b)=>order.indexOf(a.i.d)-order.indexOf(b.i.d));
  else list=list.filter(x=>!S.me||!pickOf(S.me.id,x.i.id));
  if(!list.length){box.append(el("div",{class:"empty",text:"You've voted on everything. Nice."}));return}
  for(const{i,tl}of list){
    const day=DAYMAP[i.d];const mine=S.me?pickOf(S.me.id,i.id):undefined;const total=tl.yes+tl.no;
    const meta=el("div",{class:"tags"},el("span",{class:"tag",text:day?day.name.split(" ")[0]:"Any day"}),el("span",{class:"tag",text:i.c||"Free"}));
    if(isPicked(i.id))meta.append(el("span",{class:"tag",style:"border-color:var(--yes);color:var(--yes)",text:"Voted in"}));
    const body=el("div",{class:"ibody"},el("h4",{text:i.t}),i.n?el("p",{text:i.n}):null,meta);
    if(i.alts&&i.alts.length)body.append(altsBox(i.alts));
    if(i.by){const w=el("div",{class:"who",text:"Suggested by "+nameOf(i.by)});if(S.me&&i.by===S.me.id)w.append(" · ",el("button",{type:"button",class:"del",onclick:async()=>{try{await rpc("hide_idea",{code:S.code,traveler:S.me.id,idea:i.raw});S.ideas=S.ideas.filter(x=>x.id!==i.id);renderAll()}catch(e){flash(errText(e))}},text:"Remove"}));body.append(w)}
    const yesNames=tl.yesWho.map(nameOf);
    box.append(el("article",{class:"idea"},el("span",{class:"bullet "+(day?"b-"+i.d:"b-any"),"aria-hidden":"true",text:day?day.b:"★"}),body,
      el("div",{class:"vrow"},
        el("button",{type:"button",class:"vbtn in","aria-pressed":String(mine==="in"),onclick:()=>vote(i.id,"in")},"I'm in"),
        el("button",{type:"button",class:"vbtn skip","aria-pressed":String(mine==="skip"),onclick:()=>vote(i.id,"skip")},"Skip"),
        el("div",{class:"tally"},el("span",{class:"bar","aria-hidden":"true"},el("i",{style:"width:"+(total?Math.round(tl.yes/total*100):0)+"%"})),el("span",{text:tl.yes+" in · "+tl.no+" skip"}))),
      yesNames.length?el("div",{class:"who",style:"grid-column:1/-1",text:"In: "+yesNames.join(", ")}):null));
  }
}
function renderChecks(){
  const ul=$("checks");ul.replaceChildren();let done=0;
  for(const b of BOOKINGS){
    const st=S.bookings[b.id];const isDone=!!(st&&st.done);if(isDone)done++;
    const cb=el("input",{type:"checkbox",id:"bk-"+b.id,onchange:async e=>{if(!S.me){e.target.checked=isDone;return askJoin()}const v=e.target.checked;S.bookings[b.id]={item_id:b.id,done:v,traveler_id:S.me.id};renderChecks();try{await rpc("set_booking",{code:S.code,traveler:S.me.id,item:b.id,is_done:v})}catch(err){flash(errText(err));loadAll(true)}}});
    cb.checked=isDone;
    ul.append(el("li",{class:isDone?"done":null},cb,el("label",{for:"bk-"+b.id},el("span",{text:b.t}),el("small",{text:isDone&&st.traveler_id?"Booked by "+nameOf(st.traveler_id):b.n}))));
  }
  $("bookCount").textContent=BOOKINGS.length?done+" of "+BOOKINGS.length+" done":"";
}
function renderAll(){renderJoin();setStatus();renderTracker();renderSuggest();renderDumps();renderTabs();renderDay(false);renderIdeas();renderChecks()}

/* ---------- forms & nav ---------- */
$("kinds").addEventListener("click",e=>{const b=e.target.closest("button[data-k]");if(!b)return;S.kind=b.dataset.k;for(const x of $("kinds").children)x.setAttribute("aria-pressed",String(x===b))});
$("dumpSeg").addEventListener("click",e=>{const b=e.target.closest("button[data-f]");if(!b)return;S.dumpF=b.dataset.f;for(const x of $("dumpSeg").children)x.setAttribute("aria-pressed",String(x===b));renderDumps()});
$("sortSeg").addEventListener("click",e=>{const b=e.target.closest("button[data-sort]");if(!b)return;S.sort=b.dataset.sort;for(const x of $("sortSeg").children)x.setAttribute("aria-pressed",String(x===b));renderIdeas()});
$("dumpForm").addEventListener("submit",async e=>{
  e.preventDefault();const msg=$("dMsg");if(!S.me){msg.textContent="Join at the top first.";return askJoin()}
  const body=$("dText").value.trim();if(!body){msg.textContent="Type something first.";return}
  $("dBtn").disabled=true;msg.textContent="Adding…";
  try{await addDump(body,S.kind);$("dText").value="";msg.textContent="";toast("Added. Keep them coming.");renderSuggest()}
  catch(err){msg.textContent=errText(err)}finally{$("dBtn").disabled=false}
});
$("addForm").addEventListener("submit",async e=>{
  e.preventDefault();const msg=$("fMsg");if(!S.me){msg.textContent="Join at the top first.";return askJoin()}
  const title=$("fTitle").value.trim();if(!title){msg.textContent="Give it a name first.";return}
  $("fBtn").disabled=true;msg.textContent="Adding…";
  try{await rpc("add_idea",{code:S.code,traveler:S.me.id,title:title.slice(0,80),note:$("fNote").value.trim().slice(0,240),day:$("fDay").value,cost:$("fCost").value});$("fTitle").value="";$("fNote").value="";msg.textContent="";toast("Added to the vote.");loadAll(true)}
  catch(err){msg.textContent=errText(err)}finally{$("fBtn").disabled=false}
});
$("secnav").addEventListener("click",e=>{const b=e.target.closest("button[data-to]");if(!b)return;$(b.dataset.to).scrollIntoView({behavior:reduced()?"auto":"smooth",block:"start"})});
if("IntersectionObserver" in window){
  const io=new IntersectionObserver(es=>{es.forEach(en=>{if(en.isIntersecting){document.querySelectorAll("#secnav button").forEach(b=>b.setAttribute("aria-current",String(b.dataset.to===en.target.id)))}})},{rootMargin:"-45% 0px -50% 0px"});
  ["dump","plan","vote","book","tips"].forEach(id=>{const s=$(id);if(s)io.observe(s)});
}
window.addEventListener("resize",()=>MAP.resize());

/* ---------- boot ---------- */
function countdown(){const days=Math.ceil((new Date("2026-12-14T00:00:00-05:00")-new Date())/864e5);const c=$("countdown");if(c)c.textContent=days>1?days+" days":days===1?"1 day":days>-4?"We're here":"Trip done"}
const savedDay=store.get("nyc-day");if(savedDay)S.day=savedDay;
S.me=store.get("nyc-me");
const hashCode=decodeURIComponent((location.hash||"").slice(1)).trim();
if(hashCode){S.code=hashCode;store.set("nyc-code",hashCode);try{history.replaceState(null,"",location.pathname)}catch(_){}}
else S.code=store.get("nyc-code");
$("lockForm").addEventListener("submit",async e=>{e.preventDefault();const c=$("lCode").value.trim();if(!c){$("lMsg").textContent="Type the code from your text.";return}
  $("lBtn").disabled=true;$("lMsg").textContent="Checking…";S.code=c;store.set("nyc-code",c);await loadAll(true)});
countdown();
if(S.code)loadAll(true);else showApp(false);
setInterval(()=>{if(document.visibilityState==="visible"&&S.code)loadAll()},10000);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")loadAll()});
})();
