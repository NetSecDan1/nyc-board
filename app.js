(function(){
"use strict";
const SB_URL="https://anwobosqhxzefyddyiju.supabase.co";
const SB_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFud29ib3NxaHh6ZWZ5ZGR5aWp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4Mzk5MDIsImV4cCI6MjEwOTQxNTkwMn0.zTTyySxAoOGBZwFNYj05rGfl2OsJqUkR0gt8a5ITA14";
const HDR={apikey:SB_KEY,Authorization:"Bearer "+SB_KEY,"Content-Type":"application/json"};

let DAYS=[],IDEAS=[],BOOKINGS=[];
let DAYMAP={};
const COLORS={mon:"var(--mon)",tue:"var(--tue)",wed:"var(--wed)",thu:"var(--thu)",any:"var(--muted)"};
const KINDS={do:"Do",see:"See",eat:"Eat",shop:"Shop"};

const S={day:"mon",sort:"top",dumpF:"top",kind:"do",me:null,code:null,
  travelers:{},votes:[],ideas:[],dumps:[],bookings:{},loaded:false,err:null,pending:{}};
const $=id=>document.getElementById(id);
const el=(tag,attrs,...kids)=>{const e=document.createElement(tag);if(attrs)for(const[k,v]of Object.entries(attrs)){if(v==null||v===false)continue;if(k==="class")e.className=v;else if(k==="text")e.textContent=v;else if(k.startsWith("on"))e.addEventListener(k.slice(2),v);else e.setAttribute(k,v===true?"":v)}for(const k of kids)if(k!=null)e.append(k);return e};
const mapUrl=q=>"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(q);
const store={get(k){try{return JSON.parse(localStorage.getItem(k))}catch(_){return null}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(_){}},del(k){try{localStorage.removeItem(k)}catch(_){}}};

/* ---------- api ---------- */
async function rpc(fn,args){
  const r=await fetch(SB_URL+"/rest/v1/rpc/"+fn,{method:"POST",headers:HDR,body:JSON.stringify(args)});
  if(!r.ok){let m="";try{m=(await r.json()).message||""}catch(_){};const e=new Error(m||("HTTP "+r.status));e.code=m;throw e}
  const txt=await r.text();return txt?JSON.parse(txt):null;
}
function applyBoard(b){
  const c=b.content||{};DAYS=c.days||[];IDEAS=c.ideas||[];BOOKINGS=c.bookings||[];DAYMAP=Object.fromEntries(DAYS.map(d=>[d.id,d]));
  if(!DAYMAP[S.day]&&DAYS[0])S.day=DAYS[0].id;
  S.travelers=Object.fromEntries((b.travelers||[]).map(t=>[t.id,t.name]));
  S.votes=b.votes||[];S.ideas=(b.ideas||[]).map(x=>({id:"u-"+x.id,raw:x.id,t:x.title,n:x.note,d:x.day,c:x.cost,by:x.traveler_id}));
  S.dumps=b.dumps||[];S.bookings=Object.fromEntries((b.bookings||[]).map(x=>[x.item_id,x]));
  S.loaded=true;S.err=null;
  if(S.me&&!S.travelers[S.me.id]){S.me=null;store.del("nyc-me")}
}
let loading=false;
async function loadAll(){
  if(!S.code||loading)return;loading=true;
  try{applyBoard(await rpc("get_board",{code:S.code}));showApp(true)}
  catch(e){if(/bad_code|expired/.test(e.code||"")){S.code=null;S.me=null;store.del("nyc-code");store.del("nyc-me");showApp(false,errText(e))}else S.err="Can't reach the family board right now. Showing the last thing we loaded."}
  finally{loading=false}
  if(S.loaded&&S.code)renderAll();
}
function showApp(on,msg){
  $("lockForm").hidden=on;$("app").hidden=!on;
  if(!on){$("lMsg").textContent=msg||"";$("lBtn").disabled=false}
}
function errText(e){
  const m=(e&&e.code)||"";
  if(/bad_code/.test(m))return"That code doesn't match. Check the text you were sent.";
  if(/expired/.test(m))return"This trip board has closed.";
  if(/too_many_people/.test(m))return"The trip is full. Ask the organizer to add you.";
  if(/bad_name/.test(m))return"Names need 1–30 characters.";
  if(/too_many/.test(m))return"The board is full. Remove something old first.";
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
function flash(msg){S.err=msg;setStatus();setTimeout(()=>{if(S.err===msg){S.err=null;setStatus()}},5000)}
function askJoin(){const b=$("joinBox");b.scrollIntoView({behavior:"smooth",block:"center"});const n=$("jName");if(n)n.focus()}

/* ---------- render ---------- */
function renderJoin(){
  const box=$("joinBox");box.replaceChildren();
  if(S.me){
    box.append(el("div",{class:"me"},el("span",{class:"av",text:initials(S.me.id)}),el("span",{},"You're in as ",el("b",{text:S.me.name})),el("button",{type:"button",class:"linkbtn",onclick:()=>{S.me=null;store.del("nyc-me");renderAll()},text:"Not you?"})));
    return;
  }
  const f=el("form",{class:"join",id:"joinForm"},
    el("h3",{text:"Who's this?"}),
    el("p",{text:"Type your first name once and this phone will remember you. Use the same name on every device."}),
    el("label",{for:"jName"},"Your name",el("input",{id:"jName",maxlength:"30",autocomplete:"given-name",required:true,placeholder:"e.g. Aunt Linda"})),
    el("div",{class:"dumprow"},el("button",{class:"primary",type:"submit",id:"jBtn",text:"Join the trip"}),el("span",{class:"formmsg",id:"jMsg","aria-live":"polite"})));
  f.addEventListener("submit",async e=>{
    e.preventDefault();const name=$("jName").value.trim(),code=S.code;
    if(!name){$("jMsg").textContent="Add your name first.";return}
    $("jBtn").disabled=true;$("jMsg").textContent="Joining…";
    try{const t=await rpc("join_trip",{code,traveler_name:name});S.me={id:t.id,name:t.name};S.code=code;S.travelers[t.id]=t.name;store.set("nyc-me",S.me);renderAll();loadAll()}
    catch(err){$("jMsg").textContent=errText(err);$("jBtn").disabled=false}
  });
  box.append(f);
}
function setStatus(){
  const s=$("status"),t=$("statusText");t.replaceChildren();
  if(S.err){s.className="status warn";t.textContent=S.err;return}
  if(!S.loaded){s.className="status";t.textContent="Loading the family board…";return}
  const ids=Object.keys(S.travelers);s.className="status live";
  const ppl=el("div",{class:"people"});ids.forEach(u=>ppl.append(el("span",{class:"av",title:nameOf(u),text:initials(u)})));
  t.append(el("div",{text:ids.length?ids.length+(ids.length===1?" person has":" people have")+" joined: "+ids.map(nameOf).join(", ")+".":"Nobody has joined yet. Be the first."}),ids.length?ppl:null);
}
function renderDumps(){
  const box=$("dumps");box.replaceChildren();
  let list=S.dumps.map(d=>({d,tl:tally("d-"+d.id)}));
  if(S.dumpF==="top")list.sort((a,b)=>b.tl.yes-a.tl.yes||new Date(b.d.created_at)-new Date(a.d.created_at));
  else if(S.dumpF==="new")list.reverse();
  else list=list.filter(x=>S.me&&x.d.traveler_id===S.me.id).reverse();
  if(!list.length){box.append(el("div",{class:"empty",text:S.dumpF==="mine"?(S.me?"You haven't added anything yet.":"Join above to add yours."):"Nothing here yet. Add the first thing you're dying to do."}));return}
  for(const{d,tl}of list){
    const own=S.me&&d.traveler_id===S.me.id;
    const others=tl.yesWho.filter(x=>x!==d.traveler_id);
    const mine=S.me&&pickOf(S.me.id,"d-"+d.id)==="in";
    const by=el("div",{class:"by"},el("span",{class:"ktag k-"+(KINDS[d.kind]?d.kind:"do"),text:KINDS[d.kind]||"Do"}),el("span",{text:nameOf(d.traveler_id)+(others.length?" · also "+others.map(nameOf).join(", "):"")}));
    if(own)by.append(el("button",{type:"button",class:"linkbtn",onclick:async()=>{try{await rpc("hide_dump",{code:S.code,traveler:S.me.id,dump:d.id});S.dumps=S.dumps.filter(x=>x.id!==d.id);renderAll()}catch(e){flash(errText(e))}},text:"Remove"}));
    box.append(el("article",{class:"dump"},el("p",{text:d.body}),
      own?el("span",{class:"who",text:others.length?others.length+" also want this":""}):el("button",{type:"button",class:"metoo","aria-pressed":String(!!mine),onclick:()=>vote("d-"+d.id,"in"),text:mine?"Me too ✓":"Me too"+(others.length?" · "+others.length:"")}),by));
  }
}
function renderTabs(){
  const t=$("tabs");t.replaceChildren();
  for(const d of DAYS)t.append(el("button",{type:"button",role:"tab",class:"tab","aria-selected":String(S.day===d.id),"aria-controls":"day",id:"tab-"+d.id,onclick:()=>{S.day=d.id;store.set("nyc-day",d.id);renderTabs();renderDay()}},el("span",{class:"bullet b-"+d.id,"aria-hidden":"true",text:d.b}),el("span",{text:d.name.replace(/^\w+ /,"")})));
}
function renderDay(){
  const d=DAYMAP[S.day],box=$("day");box.style.setProperty("--daycol",COLORS[d.id]);box.setAttribute("aria-labelledby","tab-"+d.id);box.replaceChildren();
  box.style.display="grid";box.style.gap="12px";
  box.append(el("div",{class:"dayhead"},el("div",{class:"eyebrow",text:d.name}),el("h3",{text:d.title})));
  if(d.note)box.append(el("div",{class:"note",text:d.note}));
  const ol=el("ol",{class:"stops"});
  for(const s of d.stops){
    const body=el("div",{class:"sbody"},el("h4",{},s.crawl?el("span",{class:"crawl",text:"Crawl"}):null,s.crawl?" ":null,s.h),el("p",{text:s.p}));
    if(s.tags||s.q){const tg=el("div",{class:"tags"});(s.tags||[]).forEach(x=>tg.append(el("span",{class:"tag"+(x==="Book ahead"?" book":""),text:x})));if(s.q)tg.append(el("a",{class:"maplink",href:mapUrl(s.q),target:"_blank",rel:"noopener",text:"Map"}));body.append(tg)}
    ol.append(el("li",{class:"stop"+(s.tr?" transit":"")},el("div",{class:"time",text:s.t}),el("div",{class:"node","aria-hidden":"true"}),body));
  }
  box.append(ol);
  const picks=allIdeas().filter(i=>i.d===d.id&&isPicked(i.id));
  const pk=el("div",{class:"picks"},el("h4",{text:"Family picks for this day"}));
  if(picks.length){const c=el("div",{class:"chips"});picks.forEach(i=>c.append(el("span",{class:"chip",text:i.t})));pk.append(c)}
  else pk.append(el("div",{class:"who",text:"Nothing voted in yet. Extras the group wants will appear here."}));
  box.append(pk);
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
  const ul=$("checks");ul.replaceChildren();
  for(const b of BOOKINGS){
    const st=S.bookings[b.id];const done=!!(st&&st.done);
    const cb=el("input",{type:"checkbox",id:"bk-"+b.id,onchange:async e=>{if(!S.me){e.target.checked=done;return askJoin()}const v=e.target.checked;S.bookings[b.id]={item_id:b.id,done:v,traveler_id:S.me.id};renderChecks();try{await rpc("set_booking",{code:S.code,traveler:S.me.id,item:b.id,is_done:v})}catch(err){flash(errText(err));loadAll()}}});
    cb.checked=done;
    ul.append(el("li",{class:done?"done":null},cb,el("label",{for:"bk-"+b.id},el("span",{text:b.t}),el("small",{text:done&&st.traveler_id?"Booked by "+nameOf(st.traveler_id):b.n}))));
  }
}
function renderAll(){renderJoin();setStatus();renderDumps();renderTabs();renderDay();renderIdeas();renderChecks()}

/* ---------- forms ---------- */
$("kinds").addEventListener("click",e=>{const b=e.target.closest("button[data-k]");if(!b)return;S.kind=b.dataset.k;for(const x of $("kinds").children)x.setAttribute("aria-pressed",String(x===b))});
$("dumpSeg").addEventListener("click",e=>{const b=e.target.closest("button[data-f]");if(!b)return;S.dumpF=b.dataset.f;for(const x of $("dumpSeg").children)x.setAttribute("aria-pressed",String(x===b));renderDumps()});
$("sortSeg").addEventListener("click",e=>{const b=e.target.closest("button[data-sort]");if(!b)return;S.sort=b.dataset.sort;for(const x of $("sortSeg").children)x.setAttribute("aria-pressed",String(x===b));renderIdeas()});
$("dumpForm").addEventListener("submit",async e=>{
  e.preventDefault();const msg=$("dMsg");if(!S.me){msg.textContent="Join at the top first.";return askJoin()}
  const body=$("dText").value.trim();if(!body){msg.textContent="Type something first.";return}
  $("dBtn").disabled=true;msg.textContent="Adding…";
  try{const r=await rpc("add_dump",{code:S.code,traveler:S.me.id,body:body.slice(0,200),kind:S.kind});if(r)S.dumps.push(r);$("dText").value="";msg.textContent="Added. Keep them coming.";renderDumps()}
  catch(err){msg.textContent=errText(err)}finally{$("dBtn").disabled=false}
});
$("addForm").addEventListener("submit",async e=>{
  e.preventDefault();const msg=$("fMsg");if(!S.me){msg.textContent="Join at the top first.";return askJoin()}
  const title=$("fTitle").value.trim();if(!title){msg.textContent="Give it a name first.";return}
  $("fBtn").disabled=true;msg.textContent="Adding…";
  try{await rpc("add_idea",{code:S.code,traveler:S.me.id,title:title.slice(0,80),note:$("fNote").value.trim().slice(0,240),day:$("fDay").value,cost:$("fCost").value});$("fTitle").value="";$("fNote").value="";msg.textContent="Added to the vote.";loadAll()}
  catch(err){msg.textContent=errText(err)}finally{$("fBtn").disabled=false}
});

/* ---------- boot ---------- */
function countdown(){const days=Math.ceil((new Date("2026-12-14T00:00:00-05:00")-new Date())/864e5);{const c=$("countdown");if(c)c.textContent=days>1?days+" days":days===1?"1 day":days>-4?"We're here":"Trip done"}}
const savedDay=store.get("nyc-day");if(savedDay)S.day=savedDay;
S.me=store.get("nyc-me");
const hashCode=decodeURIComponent((location.hash||"").slice(1)).trim();
if(hashCode){S.code=hashCode;store.set("nyc-code",hashCode);try{history.replaceState(null,"",location.pathname)}catch(_){}}
else S.code=store.get("nyc-code");
$("lockForm").addEventListener("submit",async e=>{e.preventDefault();const c=$("lCode").value.trim();if(!c){$("lMsg").textContent="Type the code from your text.";return}
  $("lBtn").disabled=true;$("lMsg").textContent="Checking…";S.code=c;store.set("nyc-code",c);await loadAll()});
countdown();
if(S.code)loadAll();else showApp(false);
setInterval(()=>{if(document.visibilityState==="visible"&&S.code)loadAll()},10000);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")loadAll()});
})();
