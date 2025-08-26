// v3.8 — OAuth sign-in (required if CONFIG.OAUTH_APPID), Admin debug, CSV export,
// guarded add (no add by map click unless New), ghost pin, Sales & Guide modals,
// quick filters + theme (if present), reliable Cancel UX.

import esriConfig    from "https://js.arcgis.com/4.29/@arcgis/core/config.js";
import Map           from "https://js.arcgis.com/4.29/@arcgis/core/Map.js";
import MapView       from "https://js.arcgis.com/4.29/@arcgis/core/views/MapView.js";
import FeatureLayer  from "https://js.arcgis.com/4.29/@arcgis/core/layers/FeatureLayer.js";
import GraphicsLayer from "https://js.arcgis.com/4.29/@arcgis/core/layers/GraphicsLayer.js";
import Graphic       from "https://js.arcgis.com/4.29/@arcgis/core/Graphic.js";
import Search        from "https://js.arcgis.com/4.29/@arcgis/core/widgets/Search.js";
import OAuthInfo     from "https://js.arcgis.com/4.29/@arcgis/core/identity/OAuthInfo.js";
import esriId        from "https://js.arcgis.com/4.29/@arcgis/core/identity/IdentityManager.js";

/* ------------------ Config ------------------ */
// Put your ArcGIS OAuth App ID here to REQUIRE sign-in
const CONFIG = {
  LAYER_URL:   "https://services3.arcgis.com/DAf01WuIltSLujAv/arcgis/rest/services/Garage_Sales/FeatureServer/0",
  PORTAL_URL:  "https://www.arcgis.com",
  OAUTH_APPID: null,                     // <-- PASTE YOUR APP ID HERE
  CENTER:     [-97.323, 27.876],
  ZOOM:       13
};

// Require sign-in for edits (buttons disabled until signed in)
const REQUIRE_SIGN_IN = true;

// Optional ArcGIS API key for Esri basemaps; leave null to use OSM
const ARCGIS_API_KEY = null;

// Layer field names
const FIELDS = { address: "Address", description: "Description", start: "Date_1", end: "EndDate" };

/* ------------------ Tiny helpers ------------------ */
const $ = (sel) => document.querySelector(sel);
function toast(msg){
  const el = document.createElement("div");
  el.className = "toast glass";
  el.innerHTML = `<span class="toast-text">${msg}</span>`;
  document.body.appendChild(el);
  setTimeout(()=> el.remove(), 2200);
}
function setStatus(t){ const el=$("#status"); if(el) el.textContent=t; }

function toEpochMaybe(v){
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const d1 = new Date(v); if (!isNaN(d1)) return d1.getTime();
  const m = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m){ const d = new Date(+m[3], +m[1]-1, +m[2]); if (!isNaN(d)) return d.getTime(); }
  return null;
}
function fromEpoch(ms){
  if (!ms) return "";
  const d = (typeof ms === "number") ? new Date(ms) : new Date(String(ms));
  if (isNaN(d)) return "";
  const M = String(d.getMonth()+1).padStart(2,"0");
  const D = String(d.getDate()).padStart(2,"0");
  const Y = d.getFullYear();
  return `${Y}-${M}-${D}`;
}
function fmtYMD(ms){ const s=fromEpoch(ms); if(!s) return ""; const [y,m,d]=s.split("-"); return `${y}-${m}-${d}`; }
function cleanInt(v,min,max){ const n=parseInt(v,10); if(isNaN(n)) return null; return Math.max(min,Math.min(max,n)); }
function composeDescription(){
  const fmt=(h,m,ap)=>`${h}:${String(m).padStart(2,"0")} ${ap}`;
  const sH=cleanInt($("#timeStartHour")?.value,1,12)??9;
  const sM=cleanInt($("#timeStartMin")?.value,0,59)??0;
  const sAP=$("#timeStartAmPm")?.value ?? "AM";
  const eH=cleanInt($("#timeEndHour")?.value,1,12)??2;
  const eM=cleanInt($("#timeEndMin")?.value,0,59)??0;
  const eAP=$("#timeEndAmPm")?.value ?? "PM";
  const details=$("#details")?.value?.trim() ?? "";
  const time=`${fmt(sH,sM,sAP)} - ${fmt(eH,eM,eAP)}`;
  return details ? `${time}: ${details}` : time;
}
function syncDesc(){ if($("#chkCompose")?.checked) $("#descriptionRaw").value = composeDescription(); }

function houseSvg(fill="#ff4aa2", stroke="#fff"){
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>
    <circle cx='32' cy='32' r='24' fill='${fill}'/>
    <path d='M16 32 L32 20 L48 32' fill='none' stroke='${stroke}' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/>
    <rect x='22' y='32' width='20' height='14' rx='2' fill='none' stroke='${stroke}' stroke-width='3'/>
    <rect x='30' y='36' width='6' height='10' rx='1.5' fill='${stroke}'/>
  </svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}
function sqlTs(d){ // TIMESTAMP 'YYYY-MM-DD HH:MM:SS'
  const pad=(n)=> String(n).padStart(2,"0");
  const s = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return `TIMESTAMP '${s}'`;
}

/* ------------------ Admin Debug ------------------ */
const ADMIN_PASSWORD = "123456";
let dbg = null, debugEnabled=false, debugPaused=false, debugVerbose=false;

function ensureDebugPanel(){
  if (dbg) return dbg;
  const wrap = document.createElement("div");
  wrap.className = "debug-panel glass";
  wrap.style.display = "none";
  wrap.innerHTML = `
    <div class="debug-header">
      <div class="debug-title">Admin Debug</div>
      <div class="debug-controls">
        <span id="dbgBasemap" class="debug-badge">basemap: —</span>
        <span id="dbgFilter" class="debug-badge">filter: all</span>
        <button id="dbgPause" class="debug-btn">Pause</button>
        <button id="dbgVerbose" class="debug-btn">Verbose: Off</button>
        <button id="dbgExport" class="debug-btn">Export CSV</button>
        <button id="dbgArchive" class="debug-btn" title="Delete older than…">Archive…</button>
        <button id="dbgClear" class="debug-btn">Clear</button>
        <button id="dbgCopy" class="debug-btn">Copy</button>
        <button id="dbgClose" class="debug-btn">Close</button>
      </div>
    </div>
    <div id="dbgBody" class="debug-body"></div>
    <div id="dbgFooter" class="debug-footer"></div>
  `;
  document.body.appendChild(wrap);

  // Drag by header
  const header = wrap.querySelector(".debug-header");
  let drag=false, sx=0, sy=0, ox=0, oy=0;
  header.addEventListener("mousedown",(e)=>{ drag=true; sx=e.clientX; sy=e.clientY; const r=wrap.getBoundingClientRect(); ox=r.left; oy=r.top; e.preventDefault(); });
  window.addEventListener("mousemove",(e)=>{ if(!drag) return; const dx=e.clientX-sx, dy=e.clientY-sy; wrap.style.left=(ox+dx)+"px"; wrap.style.top=(oy+dy)+"px"; wrap.style.right="auto"; });
  window.addEventListener("mouseup",()=> drag=false);

  // Controls
  wrap.querySelector("#dbgPause").onclick = ()=>{ debugPaused=!debugPaused; wrap.querySelector("#dbgPause").textContent = debugPaused?"Resume":"Pause"; log(`[debug] ${debugPaused?"paused":"resumed"}`); };
  wrap.querySelector("#dbgVerbose").onclick = ()=>{ debugVerbose=!debugVerbose; wrap.querySelector("#dbgVerbose").textContent=`Verbose: ${debugVerbose?"On":"Off"}`; log(`[debug] verbose ${debugVerbose?"enabled":"disabled"}`); };
  wrap.querySelector("#dbgClear").onclick = ()=>{ wrap.querySelector("#dbgBody").innerHTML=""; };
  wrap.querySelector("#dbgCopy").onclick  = ()=>{
    const text = [...wrap.querySelectorAll(".debug-row")].map(d=>d.textContent).join("\n");
    navigator.clipboard?.writeText(text); toast("Debug copied");
  };
  wrap.querySelector("#dbgClose").onclick = ()=>{ wrap.style.display="none"; debugEnabled=false; };

  // Admin tools
  wrap.querySelector("#dbgExport").onclick = exportCSV;
  wrap.querySelector("#dbgArchive").onclick = archiveDialog;

  // Error pipes
  window.addEventListener("error",(e)=> log(`JS Error: ${e.message}`, "err"));
  window.addEventListener("unhandledrejection",(e)=> log(`Unhandled: ${e.reason}`, "err"));

  dbg = {
    wrap,
    log,
    footer:(t)=> wrap.querySelector("#dbgFooter").textContent = t,
    setBasemap:(t)=> wrap.querySelector("#dbgBasemap").textContent = `basemap: ${t}`,
    setFilterBadge:(t)=> wrap.querySelector("#dbgFilter").textContent = `filter: ${t}`
  };
  return dbg;

  function log(msg, level="info"){
    if (!debugEnabled || debugPaused) return;
    const body = wrap.querySelector("#dbgBody");
    const row = document.createElement("div");
    row.className = "debug-row";
    const bullet = level==="err" ? "✖" : level==="warn" ? "⚠" : "•";
    row.textContent = `${bullet} ${msg}`;
    body.appendChild(row);
    body.scrollTop = body.scrollHeight;
  }
}
function openAdmin(){
  ensureDebugPanel();
  if (debugEnabled){ dbg.wrap.style.display="block"; return; }
  const pass = prompt("Enter admin password:");
  if (pass !== ADMIN_PASSWORD){ toast("Wrong password"); return; }
  debugEnabled = true;
  dbg.wrap.style.display = "block";
  log(`Admin debug opened`);
}
function log(msg, level){ ensureDebugPanel(); dbg.log(msg, level); }
function setBasemapBadge(t){ ensureDebugPanel(); dbg.setBasemap(t); }
function setFilterBadge(t){ ensureDebugPanel(); dbg.setFilterBadge(t); }
function updateFooter(){
  if (!view) return;
  const c=view.center;
  const info=`center: ${c.longitude.toFixed(5)}, ${c.latitude.toFixed(5)}  |  zoom: ${view.zoom}  |  scale: ${Math.round(view.scale).toLocaleString()}  |  features: ${_featureCount}`;
  dbg?.footer(info);
}

/* ------------------ App state ------------------ */
let map, view, layer, editLayer, ghostLayer, ghostGraphic, search;
let selectedFeature=null, objectIdField="OBJECTID";
let signedIn=false, inNewMode=false, _featureCount=0;

/* ------------------ Init ------------------ */
async function init(){
  // Header controls (they’re optional—safe if HTML doesn’t have them)
  $("#btnAdmin")?.addEventListener("click", openAdmin);
  $("#btnTheme")?.addEventListener("click", cycleTheme);
  $("#selFilter")?.addEventListener("change", (e)=> applyQuickFilter(e.target.value));
  $("#btnSales") ?.addEventListener("click", showSalesList);
  $("#btnGuide") ?.addEventListener("click", showGuide);

  log(`app v3.8 starting`);
  log(`UA: ${navigator.userAgent}`);

  // Basemap (OSM fallback)
  if (ARCGIS_API_KEY){ esriConfig.apiKey = ARCGIS_API_KEY; map = new Map({ basemap:"arcgis-dark-gray" }); setBasemapBadge("arcgis-dark-gray"); }
  else { map = new Map({ basemap:"osm" }); setBasemapBadge("osm"); log(`basemap: OSM (no key)`); }

  // View
  view = new MapView({ container:"map", map, center: CONFIG.CENTER, zoom: CONFIG.ZOOM });
  view.when(
    ()=>{ log("MapView ready"); updateFooter(); },
    (err)=>{ log(`MapView failed: ${err?.message||err}`, "err"); toast("Map failed to initialize."); }
  );

  // Layer
  layer = new FeatureLayer({ url: CONFIG.LAYER_URL, outFields:["*"], popupEnabled:false });
  layer.renderer = { type:"simple", symbol:{ type:"picture-marker", url: houseSvg("#ff4aa2","#ffffff"), width:"24px", height:"24px", yoffset:8 } };
  map.add(layer);

  try{
    await layer.load();
    objectIdField = layer.objectIdField;
    log(`layer loaded, OID field: ${objectIdField}`);
    _featureCount = await layer.queryFeatureCount({ where:"1=1" }); updateFooter();

    view.whenLayerView(layer).then((lv)=>{
      log(`layerview created`);
      lv.watch("updating",(u)=> log(`layerview updating: ${u}`));
    }).catch(e=> log(`whenLayerView error: ${e?.message||e}`, "err"));
  }catch(e){ log(`layer load error: ${e?.message||e}`, "err"); }

  // Editing helper layers
  editLayer  = new GraphicsLayer(); map.add(editLayer);
  ghostLayer = new GraphicsLayer(); map.add(ghostLayer);

  // Search widget
  search = new Search({ view }); view.ui.add(search, "top-right");
  search.on("select-result", (e)=> log(`select-result: ${e.result?.name || "(no name)"}`));

  // OAuth (sign-in/out + gating)
  wireAuth();

  // Ghost pin while in New mode (throttled unless verbose)
  let lastMove=0;
  view.on("pointer-move", (e)=>{
    if (!inNewMode) return;
    const now = performance.now(); if (!debugVerbose && now-lastMove<250) return; lastMove = now;
    const mp = view.toMap({ x:e.x, y:e.y }); if (!mp) return;
    if (!ghostGraphic){
      ghostGraphic = new Graphic({
        geometry: mp,
        symbol: { type:"simple-marker", size:14, color:[60,240,212,0.9], outline:{ color:[12,26,44,1], width:1 } }
      });
      ghostLayer.add(ghostGraphic);
    } else {
      ghostGraphic.geometry = mp;
    }
  });

  // Guarded click: select existing unless in New; only place when in New
  view.on("click", async (ev)=>{
    if (!inNewMode){
      const ht = await view.hitTest(ev);
      const g = ht.results.find(r=> r.graphic?.layer === layer)?.graphic;
      if (g){ loadForEdit(g); }
      else { toast("Click New to add a sale."); }
      return;
    }
    finalizePlacement(ev.mapPoint);
  });

  // Live footer
  let lastT=0;
  view.watch(["center","zoom","scale"], ()=>{
    const now = performance.now(); if (now-lastT<400) return; lastT=now;
    updateFooter();
  });

  // Form → description composer
  ["timeStartHour","timeStartMin","timeStartAmPm","timeEndHour","timeEndMin","timeEndAmPm","details","chkCompose"]
    .forEach(id=> $("#"+id)?.addEventListener("input", syncDesc));
  syncDesc();

  // Buttons
  $("#btnSave")  ?.addEventListener("click", onSave);
  $("#btnNew")   ?.addEventListener("click", enterAddMode);
  $("#btnCancel")?.addEventListener("click", cancelEditing);
  $("#btnDelete")?.addEventListener("click", onDelete);

  setStatus("Click a sale to edit, or click New to add a sale.");
}

/* ------------------ Auth wiring ------------------ */
function wireAuth(){
  // Always show Sign in button so it’s obvious (even if appId not set)
  $("#btnSignIn")?.style && ($("#btnSignIn").style.display = "inline-block");
  $("#btnSignOut")?.style && ($("#btnSignOut").style.display = "none");

  if (!CONFIG.OAUTH_APPID){
    $("#btnSignIn")?.addEventListener("click", ()=> toast("Configure OAuth appId to enable ArcGIS sign-in."));
    disableEditingUI(true);
    return;
  }

  const info = new OAuthInfo({ appId: CONFIG.OAUTH_APPID, portalUrl: CONFIG.PORTAL_URL, popup:true });
  esriId.registerOAuthInfos([info]);

  // Try to auto-detect session
  esriId.checkSignInStatus(`${CONFIG.PORTAL_URL}/sharing`).then(()=>{
    signedIn = true; updateAuthUI();
  }).catch(()=>{ signedIn = false; updateAuthUI(); });

  $("#btnSignIn")?.addEventListener("click", async ()=>{
    try{
      await esriId.getCredential(`${CONFIG.PORTAL_URL}/sharing`);
      signedIn = true; updateAuthUI(); toast("Signed in.");
    }catch(_){}
  });
  $("#btnSignOut")?.addEventListener("click", ()=>{
    esriId.destroyCredentials();
    signedIn=false; updateAuthUI(); toast("Signed out.");
  });
}
function updateAuthUI(){
  if ($("#btnSignIn") && $("#btnSignOut")){
    $("#btnSignIn").style.display = signedIn ? "none" : "inline-block";
    $("#btnSignOut").style.display = signedIn ? "inline-block" : "none";
  }
  disableEditingUI(REQUIRE_SIGN_IN && !signedIn);
}
function disableEditingUI(disable){
  ["btnNew","btnSave","btnDelete"].forEach(id=>{
    const b=$("#"+id); if (!b) return;
    b.disabled = !!disable;
    b.title = disable ? "Sign in to edit" : "";
  });
}

/* ------------------ Quick filter (optional UI) ------------------ */
function applyQuickFilter(kind){
  const now = new Date();
  let start = null, end = null, label = "all";
  if (kind==="weekend"){
    // next Saturday 00:00 to Sunday 23:59:59
    const d = new Date(now);
    const dow = d.getDay();
    const add = (6 - dow + 7) % 7;
    const sat = new Date(d.getFullYear(), d.getMonth(), d.getDate()+add, 0,0,0);
    const sun = new Date(sat.getFullYear(), sat.getMonth(), sat.getDate()+1, 23,59,59);
    start = sat; end = sun; label = "weekend";
  } else if (kind==="next14"){
    start = now; end = new Date(now.getFullYear(), now.getMonth(), now.getDate()+14, 23,59,59); label = "next14";
  } else if (kind==="past"){
    start = null; end = now; label = "past";
  }

  let where="1=1";
  if (label==="weekend" || label==="next14"){
    const ts1 = sqlTs(start), ts2 = sqlTs(end);
    where = `(${FIELDS.start} <= ${ts2}) AND (${FIELDS.end} IS NULL OR ${FIELDS.end} >= ${ts1})`;
  } else if (label==="past"){
    const ts = sqlTs(end);
    where = `${FIELDS.end} < ${ts}`;
  }
  layer.definitionExpression = where;
  setFilterBadge(label);
  log(`filter applied: ${label}`);
}

/* ------------------ Theme toggle (optional UI) ------------------ */
function cycleTheme(){
  const order = ["dark","dim","light"];
  const cur = document.documentElement.getAttribute("data-theme") || "dark";
  const idx = order.indexOf(cur);
  const next = order[(idx+1)%order.length];
  document.documentElement.setAttribute("data-theme", next);
  toast(`Theme: ${next}`);
}

/* ------------------ Add / Edit flow ------------------ */
function enterAddMode(){
  if (REQUIRE_SIGN_IN && !signedIn) { toast("Sign in to add."); return; }
  inNewMode = true;
  $("#btnCancel") && ($("#btnCancel").style.display="inline-block");
  $("#modeChip") && ($("#modeChip").style.display="inline-block");
  editLayer.removeAll(); ghostLayer.removeAll(); ghostGraphic=null;
  setStatus("Add mode — move the cursor and click to place the sale.");
}
function finalizePlacement(mp){
  if (!mp) return;
  placePoint(mp.longitude, mp.latitude);
  ghostLayer.removeAll(); ghostGraphic=null;
  $("#address")?.focus();
  setStatus("Point placed — fill the form and Save, or Cancel.");
}
function cancelEditing(){
  inNewMode = false;
  selectedFeature = null;
  $("#btnCancel") && ($("#btnCancel").style.display="none");
  $("#modeChip") && ($("#modeChip").style.display="none");
  ghostLayer.removeAll(); ghostGraphic=null;
  editLayer.removeAll();
  $("#address").value = ""; $("#descriptionRaw").value=""; $("#dateStart").value=""; $("#dateEnd").value="";
  setStatus("Exited editing. Click a sale to edit, or click New to add.");
}
function placePoint(lon, lat){
  editLayer.removeAll();
  editLayer.add(new Graphic({
    geometry:{ type:"point", longitude:lon, latitude:lat },
    symbol:{ type:"picture-marker", url: houseSvg("#3cf0d4","#0b1118"), width:"32px", height:"32px" }
  }));
}
function loadForEdit(g){
  selectedFeature = g; inNewMode = false;
  $("#btnCancel") && ($("#btnCancel").style.display="inline-block");
  $("#modeChip") && ($("#modeChip").style.display="none");
  const a = g.attributes || {};
  $("#address").value        = a[FIELDS.address]     ?? "";
  $("#descriptionRaw").value = a[FIELDS.description] ?? "";
  $("#dateStart").value      = fmtYMD(a[FIELDS.start]) || "";
  $("#dateEnd").value        = fmtYMD(a[FIELDS.end])   || "";
  parseTimeFromDescription($("#descriptionRaw").value || "");
  placePoint(g.geometry.longitude, g.geometry.latitude);
  const label = [a[FIELDS.address], fmtYMD(a[FIELDS.start])].filter(Boolean).join(" — ");
  setStatus(`Editing: ${label}. Use Cancel to exit without saving.`);
}
function parseTimeFromDescription(text){
  const m = text.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*[-–]\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return;
  $("#timeStartHour").value = m[1]; $("#timeStartMin").value = m[2]; $("#timeStartAmPm").value = m[3].toUpperCase();
  $("#timeEndHour").value   = m[4]; $("#timeEndMin").value   = m[5]; $("#timeEndAmPm").value   = m[6].toUpperCase();
  syncDesc();
}

/* ------------------ Save / Delete ------------------ */
function attributesFromForm(){
  syncDesc();
  return {
    [FIELDS.address]: $("#address").value.trim() || null,
    [FIELDS.description]: $("#descriptionRaw").value.trim() || null,
    [FIELDS.start]: toEpochMaybe($("#dateStart").value),
    [FIELDS.end]: toEpochMaybe($("#dateEnd").value)
  };
}
async function onSave(){
  if (REQUIRE_SIGN_IN && !signedIn) { toast("Sign in to save."); return; }
  if (editLayer.graphics.length === 0) return toast("Click New, then click the map to place a point.");

  const geom  = editLayer.graphics.getItemAt(0).geometry;
  const attrs = attributesFromForm();
  if (!attrs[FIELDS.address])     return toast("Address is required.");
  if (!attrs[FIELDS.description]) return toast("Description is required.");
  if (!attrs[FIELDS.start])       return toast("Start date is required.");

  let edits;
  if (selectedFeature){
    attrs[layer.objectIdField] = selectedFeature.attributes[layer.objectIdField];
    edits = { updateFeatures: [{ attributes: attrs, geometry: geom }] };
  } else {
    edits = { addFeatures:    [{ attributes: attrs, geometry: geom }] };
  }

  try{
    const result = await layer.applyEdits(edits);
    const r = (result.addFeatureResults?.[0] || result.updateFeatureResults?.[0]);
    if (r?.error) throw r.error;

    const oid = r.objectId || (selectedFeature?.attributes?.[layer.objectIdField]);
    const q = await layer.queryFeatures({ objectIds:[oid], returnGeometry:true, outFields:["*"] });
    if (q.features.length) loadForEdit(q.features[0]);

    _featureCount = await layer.queryFeatureCount({ where:"1=1" }); updateFooter();
    toast(selectedFeature ? "Sale updated." : "Sale added.");
    inNewMode=false; $("#btnCancel")?.style && ($("#btnCancel").style.display="none");
    $("#modeChip")?.style && ($("#modeChip").style.display="none");
  }catch(e){ console.error(e); toast("Save failed (permissions or network)."); }
}
async function onDelete(){
  if (REQUIRE_SIGN_IN && !signedIn) { toast("Sign in to delete."); return; }
  if (!selectedFeature) return toast("Select a sale first.");
  try{
    const r = await layer.applyEdits({ deleteFeatures: [{ objectId: selectedFeature.attributes[layer.objectIdField] }] });
    if (r.deleteFeatureResults?.[0]?.error) throw r.deleteFeatureResults[0].error;
    editLayer.removeAll(); selectedFeature=null;
    $("#address").value = ""; $("#descriptionRaw").value=""; $("#dateStart").value=""; $("#dateEnd").value="";
    _featureCount = await layer.queryFeatureCount({ where:"1=1" }); updateFooter();
    toast("Deleted.");
  }catch(e){ console.error(e); toast("Delete failed."); }
}

/* ------------------ Sales list + Guide ------------------ */
async function showSalesList(){
  try{
    const q = await layer.queryFeatures({
      where: layer.definitionExpression || "1=1",
      outFields: ["*"],
      orderByFields: [FIELDS.start + " DESC"],
      returnGeometry: true,
      num: 200
    });
    const rows = q.features.map(f=>{
      const a=f.attributes;
      const title=a[FIELDS.address]||"(no address)";
      const sub=[fmtYMD(a[FIELDS.start]), fmtYMD(a[FIELDS.end])].filter(Boolean).join(" → ");
      return { oid:a[layer.objectIdField], title, sub, feature:f };
    });

    const body = document.createElement("div");
    body.className="list";
    body.innerHTML = rows.length ? rows.map(r=>`
      <div class="list-row" data-oid="${r.oid}">
        <div class="meta">
          <span class="title">${r.title.replace(/</g,"&lt;")}</span>
          <span>${r.sub}</span>
        </div>
        <div class="row-actions">
          <button type="button" class="btn btn-secondary btn-edit" data-oid="${r.oid}">Edit</button>
          <button type="button" class="btn btn-danger btn-del" data-oid="${r.oid}">Delete</button>
        </div>
      </div>`).join("") : "<p>No sales found.</p>";

    const wrap = document.createElement("div");
    wrap.className="modal-backdrop";
    wrap.innerHTML = `<div class="modal glass">
      <div class="modal-header">
        <div class="modal-title">Garage Sales</div>
        <button type="button" class="modal-close" aria-label="Close">×</button>
      </div>
      <div class="modal-body"></div>
      <div class="modal-actions">
        <button type="button" class="btn">Close</button>
      </div>
    </div>`;
    wrap.querySelector(".modal-body").appendChild(body);
    document.body.appendChild(wrap);

    const closeModal = () => wrap.remove();
    wrap.querySelector(".modal-close").addEventListener("click", closeModal);
    wrap.querySelector(".modal-actions .btn").addEventListener("click", closeModal);
    const esc = (e)=>{ if(e.key==="Escape"){ closeModal(); window.removeEventListener("keydown",esc);} };
    window.addEventListener("keydown", esc);

    body.querySelectorAll(".btn-edit").forEach(btn=>{
      btn.addEventListener("click",(e)=>{
        e.preventDefault(); e.stopPropagation();
        const oid = +btn.dataset.oid;
        const f = rows.find(r=> r.oid===oid)?.feature;
        closeModal();
        if (f){ loadForEdit(f); view.goTo(f.geometry).catch(()=>{}); }
      });
    });

    body.querySelectorAll(".btn-del").forEach(btn=>{
      btn.addEventListener("click", async (e)=>{
        e.preventDefault(); e.stopPropagation();
        const oid = +btn.dataset.oid;
        const f = rows.find(r=> r.oid===oid)?.feature;
        closeModal();
        if (f){ selectedFeature = f; await onDelete(); }
      });
    });
  }catch(e){ console.error(e); toast("Couldn’t load list."); }
}

function showGuide(){
  const wrap = document.createElement("div"); wrap.className="modal-backdrop";
  wrap.innerHTML = `<div class="modal glass">
    <div class="modal-header"><div class="modal-title">Quick Guide</div><button class="modal-close" aria-label="Close">×</button></div>
    <div class="modal-body">
      <ol style="line-height:1.7;">
        <li><strong>Add a sale:</strong> click <em>New</em>. A ghost pin follows your cursor — click to place. Fill the form, then <em>Save</em>. Use <em>Cancel</em> to exit.</li>
        <li><strong>Edit a sale:</strong> click a point on the map or open <em>Sales</em> → <em>Edit</em>.</li>
        <li><strong>Delete:</strong> select a sale, then <em>Delete</em>.</li>
        <li><strong>Description:</strong> auto-composed from time + details; uncheck to type your own.</li>
      </ol>
    </div>
    <div class="modal-actions"><button class="btn">Got it</button></div></div>`;
  wrap.querySelector(".modal-close").onclick = ()=> wrap.remove();
  wrap.querySelector(".btn").onclick = ()=> wrap.remove();
  document.body.appendChild(wrap);
}

/* ------------------ Admin tools ------------------ */
async function exportCSV(){
  try{
    const q = await layer.queryFeatures({
      where: layer.definitionExpression || "1=1",
      outFields: [FIELDS.address, FIELDS.description, FIELDS.start, FIELDS.end, layer.objectIdField],
      returnGeometry: false
    });
    const rows = q.features.map(f=>{
      const a=f.attributes;
      return [
        a[layer.objectIdField],
        (a[FIELDS.address]||"").replaceAll('"','""'),
        (a[FIELDS.description]||"").replaceAll('"','""'),
        fmtYMD(a[FIELDS.start]),
        fmtYMD(a[FIELDS.end])
      ];
    });
    const header = ["OBJECTID","Address","Description","StartDate","EndDate"];
    const csv = [header, ...rows].map(r=> r.map(c=> `"${c??""}"`).join(",")).join("\n");
    const blob = new Blob([csv], {type:"text/csv;charset=utf-8;"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "garage_sales.csv"; a.click();
    URL.revokeObjectURL(url);
    toast("CSV exported");
  }catch(e){ console.error(e); toast("Export failed."); }
}

async function archiveDialog(){
  if (REQUIRE_SIGN_IN && !signedIn) { toast("Sign in required."); return; }
  const s = prompt("Archive (delete) sales ended more than N days ago.\nEnter N (e.g., 30):");
  const days = parseInt(s,10);
  if (!Number.isFinite(days) || days <= 0) return;
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
  const where = `${FIELDS.end} < ${sqlTs(cutoff)}`;
  try{
    const ids = await layer.queryObjectIds({ where });
    if (!ids || !ids.length){ toast("No records to archive."); return; }
    const ok = confirm(`Delete ${ids.length} record(s) ended before ${cutoff.toDateString()}?`);
    if (!ok) return;
    const r = await layer.applyEdits({ deleteFeatures: ids.map(oid=>({ objectId: oid })) });
    const failed = (r.deleteFeatureResults||[]).filter(x=>x.error);
    if (failed.length) throw new Error(`${failed.length} failed`);
    toast(`Archived ${ids.length} record(s).`);
    _featureCount = await layer.queryFeatureCount({ where:"1=1" }); updateFooter();
  }catch(e){ console.error(e); toast("Archive failed."); }
}

/* ------------------ Boot ------------------ */
init();
