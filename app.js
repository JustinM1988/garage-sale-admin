// v3.6 — Admin Debug panel (password 123456), enhanced logging, OSM fallback,
// ghost pin in New mode, guarded add, cancel UX, sales modal close-once.

import esriConfig   from "https://js.arcgis.com/4.29/@arcgis/core/config.js";
import Map          from "https://js.arcgis.com/4.29/@arcgis/core/Map.js";
import MapView      from "https://js.arcgis.com/4.29/@arcgis/core/views/MapView.js";
import FeatureLayer from "https://js.arcgis.com/4.29/@arcgis/core/layers/FeatureLayer.js";
import GraphicsLayer from "https://js.arcgis.com/4.29/@arcgis/core/layers/GraphicsLayer.js";
import Graphic      from "https://js.arcgis.com/4.29/@arcgis/core/Graphic.js";
import Search       from "https://js.arcgis.com/4.29/@arcgis/core/widgets/Search.js";
import OAuthInfo    from "https://js.arcgis.com/4.29/@arcgis/core/identity/OAuthInfo.js";
import esriId       from "https://js.arcgis.com/4.29/@arcgis/core/identity/IdentityManager.js";

// ------------------ Config ------------------
const CONFIG = {
  LAYER_URL:   "https://services3.arcgis.com/DAf01WuIltSLujAv/arcgis/rest/services/Garage_Sales/FeatureServer/0",
  PORTAL_URL:  "https://www.arcgis.com",
  OAUTH_APPID: null,           // set your AGOL OAuth appId to require login; keep null for public
  CENTER:     [-97.323, 27.876],
  ZOOM:       13
};
// ArcGIS basemap key (optional). Leave null to use OSM (no key needed).
const ARCGIS_API_KEY = null;

// layer field names
const FIELDS = { address: "Address", description: "Description", start: "Date_1", end: "EndDate" };

// ------------------ Helpers ------------------
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

// Custom icon
function houseSvg(fill="#ff4aa2", stroke="#fff"){
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>
    <circle cx='32' cy='32' r='24' fill='${fill}'/>
    <path d='M16 32 L32 20 L48 32' fill='none' stroke='${stroke}' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/>
    <rect x='22' y='32' width='20' height='14' rx='2' fill='none' stroke='${stroke}' stroke-width='3'/>
    <rect x='30' y='36' width='6' height='10' rx='1.5' fill='${stroke}'/>
  </svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

// ------------------ Admin Debug panel ------------------
const ADMIN_PASSWORD = "123456";
let dbg = null, debugEnabled = false, debugPaused = false, debugVerbose = false;

function createDebugPanel(){
  if (dbg) return dbg;
  const wrap = document.createElement("div");
  wrap.className = "debug-panel glass";
  wrap.innerHTML = `
    <div class="debug-header">
      <div class="debug-title">Admin Debug</div>
      <div class="debug-controls">
        <span id="dbgBasemap" class="debug-badge">basemap: —</span>
        <button id="dbgPause" class="debug-btn">Pause</button>
        <button id="dbgVerbose" class="debug-btn">Verbose: Off</button>
        <button id="dbgClear" class="debug-btn">Clear</button>
        <button id="dbgCopy" class="debug-btn">Copy</button>
        <button id="dbgClose" class="debug-btn">Close</button>
      </div>
    </div>
    <div id="dbgBody" class="debug-body"></div>
    <div id="dbgFooter" class="debug-footer"></div>
  `;
  document.body.appendChild(wrap);

  // drag by header
  const header = wrap.querySelector(".debug-header");
  let drag=false, sx=0, sy=0, ox=0, oy=0;
  header.addEventListener("mousedown", (e)=>{ drag=true; sx=e.clientX; sy=e.clientY; const r=wrap.getBoundingClientRect(); ox=r.left; oy=r.top; e.preventDefault(); });
  window.addEventListener("mousemove",(e)=>{ if(!drag) return; const dx=e.clientX-sx, dy=e.clientY-sy; wrap.style.left=(ox+dx)+"px"; wrap.style.top=(oy+dy)+"px"; wrap.style.right="auto"; });
  window.addEventListener("mouseup", ()=> drag=false);

  // controls
  wrap.querySelector("#dbgPause").onclick = ()=>{
    debugPaused = !debugPaused;
    wrap.querySelector("#dbgPause").textContent = debugPaused ? "Resume" : "Pause";
    log(`[debug] ${debugPaused ? "paused" : "resumed"}`);
  };
  wrap.querySelector("#dbgVerbose").onclick = ()=>{
    debugVerbose = !debugVerbose;
    wrap.querySelector("#dbgVerbose").textContent = `Verbose: ${debugVerbose ? "On" : "Off"}`;
    log(`[debug] verbose ${debugVerbose ? "enabled" : "disabled"}`);
  };
  wrap.querySelector("#dbgClear").onclick = ()=>{ wrap.querySelector("#dbgBody").innerHTML=""; };
  wrap.querySelector("#dbgCopy").onclick = ()=>{
    const text = [...wrap.querySelectorAll(".debug-row")].map(d=>d.textContent).join("\n");
    navigator.clipboard?.writeText(text);
    toast("Debug copied");
  };
  wrap.querySelector("#dbgClose").onclick = ()=>{ wrap.style.display="none"; debugEnabled=false; };

  // error pipes
  window.addEventListener("error",(e)=> log(`JS Error: ${e.message}`, "err"));
  window.addEventListener("unhandledrejection",(e)=> log(`Unhandled: ${e.reason}`, "err"));

  dbg = { wrap, log, footer:updateFooter, setBasemap };
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
  function updateFooter(info){
    if (!debugEnabled) return;
    wrap.querySelector("#dbgFooter").textContent = info;
  }
  function setBasemap(txt){
    wrap.querySelector("#dbgBasemap").textContent = `basemap: ${txt}`;
  }
}
function openAdmin(){
  if (debugEnabled){ dbg?.wrap && (dbg.wrap.style.display="block"); return; }
  const pass = prompt("Enter admin password:");
  if (pass !== ADMIN_PASSWORD){ toast("Wrong password"); return; }
  createDebugPanel();
  debugEnabled = true;
  dbg.wrap.style.display = "block";
  log(`Admin debug opened (verbose ${debugVerbose ? "on" : "off"})`);
}
function log(msg, level){ createDebugPanel(); dbg.log(msg, level); }
function updateFooter(){ if (!view) return; const c=view.center; const info=`center: ${c.longitude.toFixed(5)}, ${c.latitude.toFixed(5)}  |  zoom: ${view.zoom}  |  scale: ${Math.round(view.scale).toLocaleString()}  |  features: ${_featureCount}`; dbg?.footer(info); }
function setBasemapBadge(txt){ dbg?.setBasemap(txt); }

// ------------------ App state ------------------
let map, view, layer, editLayer, ghostLayer, ghostGraphic, search;
let selectedFeature=null, objectIdField="OBJECTID";
let signedIn=false, inNewMode=false, _featureCount=0;

function closeAllModals(){ document.querySelectorAll(".modal-backdrop").forEach(n=>n.remove()); }

// ------------------ Init ------------------
async function init(){
  // Wire Admin button
  $("#btnAdmin")?.addEventListener("click", openAdmin);

  log(`app v3.6 starting`);
  log(`UA: ${navigator.userAgent}`);

  const mapDiv = document.getElementById("map");
  if (!mapDiv){ log(`#map not found in DOM`, "err"); return; }

  // Self-fix height if needed
  const h = mapDiv.offsetHeight, w = mapDiv.offsetWidth;
  log(`map div size: ${w} x ${h}px`);
  if (h < 200){ mapDiv.style.minHeight="520px"; mapDiv.style.height="60vh"; log(`map div too short; applied height fix`, "warn"); }

  // Optional OAuth
  if (CONFIG.OAUTH_APPID){
    try{
      const info = new OAuthInfo({ appId: CONFIG.OAUTH_APPID, portalUrl: CONFIG.PORTAL_URL, popup:true });
      esriId.registerOAuthInfos([info]);
      await esriId.checkSignInStatus(`${CONFIG.PORTAL_URL}/sharing`);
      signedIn=true; log(`OAuth signed in`);
    }catch{ log(`OAuth not signed in`); }
  }

  // Basemap
  if (ARCGIS_API_KEY){ esriConfig.apiKey = ARCGIS_API_KEY; map = new Map({ basemap:"arcgis-dark-gray" }); setBasemapBadge("arcgis-dark-gray"); }
  else { map = new Map({ basemap:"osm" }); setBasemapBadge("osm"); log(`basemap: OSM (no key)`); }

  view = new MapView({ container:"map", map, center: CONFIG.CENTER, zoom: CONFIG.ZOOM });
  view.when(
    () => { log("MapView ready"); updateFooter(); },
    (err) => { log(`MapView failed: ${err?.message||err}`, "err"); toast("Map failed to initialize."); }
  );

  // Feature layer
  layer = new FeatureLayer({ url: CONFIG.LAYER_URL, outFields:["*"], popupEnabled:false });
  layer.renderer = { type:"simple", symbol:{ type:"picture-marker", url:houseSvg("#ff4aa2","#ffffff"), width:"24px", height:"24px", yoffset:8 } };
  map.add(layer);

  try{
    await layer.load();
    objectIdField = layer.objectIdField;
    log(`layer loaded, OID field: ${objectIdField}`);
    _featureCount = await layer.queryFeatureCount({ where:"1=1" });
    log(`feature count: ${_featureCount}`);
    updateFooter();

    view.whenLayerView(layer).then(lv=>{
      log(`layerview created`);
      lv.watch("updating", (u)=> log(`layerview updating: ${u}`));
    }).catch(err=> log(`whenLayerView error: ${err?.message||err}`, "err"));
  }catch(e){ log(`layer load error: ${e?.message||e}`, "err"); }

  // Layers used while editing
  editLayer  = new GraphicsLayer(); map.add(editLayer);
  ghostLayer = new GraphicsLayer(); map.add(ghostLayer);

  // Search widget + diagnostics
  search = new Search({ view });
  view.ui.add(search, "top-right");
  search.on("search-complete", (e)=> log(`search-complete: ${e.numResults} providers`));
  search.on("select-result", (e)=> log(`select-result: ${e.result?.name||"(no name)"}`));
  search.on("search-clear", ()=> log(`search cleared`));
  search.on("search-error", (e)=> log(`search-error: ${e.error?.message||e}`, "err"));

  // Ghost pin follows the mouse in New mode (throttled)
  let lastMoveT=0;
  view.on("pointer-move", (e)=>{
    if (!inNewMode) return;
    const now = performance.now(); if (!debugVerbose && now-lastMoveT<250) return; lastMoveT=now;
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
    if (debugVerbose) log(`pointer ${mp.longitude.toFixed(5)}, ${mp.latitude.toFixed(5)}`);
  });

  // Map click: select vs place
  view.on("click", async (ev)=>{
    const p = ev.mapPoint;
    if (!inNewMode){
      const ht = await view.hitTest(ev);
      const g = ht.results.find(r=> r.graphic?.layer === layer)?.graphic;
      if (g){ log(`select ${g.attributes?.[objectIdField] ?? "?"}`); loadForEdit(g); }
      else { log(`click on map (no feature)`); }
      return;
    }
    log(`place at ${p.longitude.toFixed(5)}, ${p.latitude.toFixed(5)}`);
    finalizePlacement(p);
  });

  // View telemetry (throttled)
  let lastT=0;
  view.watch(["center","zoom","scale"], ()=>{
    const now = performance.now(); if (now-lastT<400) return; lastT=now;
    updateFooter();
    if (debugVerbose) log(`view: zoom=${view.zoom} scale=${Math.round(view.scale)}`);
  });

  // Online/offline
  window.addEventListener("online", ()=> log("network: online"));
  window.addEventListener("offline",()=> log("network: offline"));

  // UI events
  $("#btnSave")  ?.addEventListener("click", onSave);
  $("#btnNew")   ?.addEventListener("click", enterAddMode);
  $("#btnCancel")?.addEventListener("click", cancelEditing);
  $("#btnDelete")?.addEventListener("click", onDelete);
  $("#btnSales") ?.addEventListener("click", showSalesList);
  $("#btnGuide") ?.addEventListener("click", showGuide);

  $("#btnSignIn") ?.addEventListener("click", async ()=>{
    if (!CONFIG.OAUTH_APPID){ toast("Sign-in not required."); return; }
    try{ await esriId.getCredential(`${CONFIG.PORTAL_URL}/sharing`); signedIn=true; toast("Signed in."); updateAuthUI(); log("OAuth: signed in"); }
    catch(_){} // cancelled
  });
  $("#btnSignOut")?.addEventListener("click", ()=>{
    esriId.destroyCredentials(); signedIn=false; toast("Signed out."); updateAuthUI(); log("OAuth: signed out");
  });

  ["timeStartHour","timeStartMin","timeStartAmPm","timeEndHour","timeEndMin","timeEndAmPm","details","chkCompose"]
    .forEach(id=> $("#"+id)?.addEventListener("input", syncDesc));
  syncDesc();

  updateAuthUI();
  setStatus("Click a sale to edit, or click New to add a sale.");
}

// ------------------ Auth UI ------------------
function updateAuthUI(){
  const inUse = !!CONFIG.OAUTH_APPID;
  const signInBtn = $("#btnSignIn"), signOutBtn = $("#btnSignOut");
  if (!inUse){ signInBtn && (signInBtn.style.display="none"); signOutBtn && (signOutBtn.style.display="none"); return; }
  if (signedIn){ signInBtn && (signInBtn.style.display="none"); signOutBtn && (signOutBtn.style.display="inline-block"); }
  else { signInBtn && (signInBtn.style.display="inline-block"); signOutBtn && (signOutBtn.style.display="none"); }
}

// ------------------ Add / Edit flow ------------------
function enterAddMode(){
  inNewMode = true;
  $("#btnCancel") && ($("#btnCancel").style.display="inline-block");
  $("#modeChip") && ($("#modeChip").style.display="inline-block");
  editLayer.removeAll(); ghostLayer.removeAll(); ghostGraphic=null;
  setStatus("Add mode — move the cursor and click to place the sale.");
  log("mode: New");
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
  log("mode: cancel");
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
  log(`edit OID=${a[objectIdField]}`);
}
function parseTimeFromDescription(text){
  const m = text.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*[-–]\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return;
  $("#timeStartHour").value = m[1]; $("#timeStartMin").value = m[2]; $("#timeStartAmPm").value = m[3].toUpperCase();
  $("#timeEndHour").value   = m[4]; $("#timeEndMin").value   = m[5]; $("#timeEndAmPm").value   = m[6].toUpperCase();
  syncDesc();
}

// ------------------ Save / Delete ------------------
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
  if (CONFIG.OAUTH_APPID && !signedIn) { toast("Sign in to save."); return; }
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
    log(`applyEdits ok (oid=${oid})`);
    const q = await layer.queryFeatures({ objectIds:[oid], returnGeometry:true, outFields:["*"] });
    if (q.features.length) loadForEdit(q.features[0]);

    _featureCount = await layer.queryFeatureCount({ where:"1=1" });
    updateFooter();

    toast(selectedFeature ? "Sale updated." : "Sale added.");
    inNewMode=false; $("#btnCancel")?.style && ($("#btnCancel").style.display="none");
    $("#modeChip")?.style && ($("#modeChip").style.display="none");
  }catch(e){ console.error(e); log(`applyEdits error: ${e?.message||e}`, "err"); toast("Save failed (permissions or network)."); }
}
async function onDelete(){
  if (CONFIG.OAUTH_APPID && !signedIn) { toast("Sign in to delete."); return; }
  if (!selectedFeature) return toast("Select a sale first.");
  try{
    const r = await layer.applyEdits({ deleteFeatures: [{ objectId: selectedFeature.attributes[layer.objectIdField] }] });
    if (r.deleteFeatureResults?.[0]?.error) throw r.deleteFeatureResults[0].error;
    log(`delete ok (oid=${selectedFeature.attributes[layer.objectIdField]})`);
    editLayer.removeAll(); selectedFeature=null;
    $("#address").value = ""; $("#descriptionRaw").value=""; $("#dateStart").value=""; $("#dateEnd").value="";
    _featureCount = await layer.queryFeatureCount({ where:"1=1" });
    updateFooter();
    toast("Deleted.");
  }catch(e){ console.error(e); log(`delete error: ${e?.message||e}`, "err"); toast("Delete failed."); }
}

// ------------------ Sales list + Guide ------------------
async function showSalesList(){
  const q = await layer.queryFeatures({ where:"1=1", outFields:["*"], orderByFields:[FIELDS.start+" DESC"], returnGeometry:true, num:200 });
  const rows = q.features.map(f=>{ const a=f.attributes; return {
    oid:a[layer.objectIdField],
    title:a[FIELDS.address]||"(no address)",
    sub:[fmtYMD(a[FIELDS.start]), fmtYMD(a[FIELDS.end])].filter(Boolean).join(" → "),
    feature:f
  }; });

  const body = document.createElement("div");
  body.className="list";
  body.innerHTML = rows.length ? rows.map(r=>`
    <div class="list-row" data-oid="${r.oid}">
      <div class="meta"><span class="title">${r.title.replace(/</g,"&lt;")}</span><span>${r.sub}</span></div>
      <div class="row-actions">
        <button type="button" class="btn btn-secondary btn-edit" data-oid="${r.oid}">Edit</button>
        <button type="button" class="btn btn-danger btn-del" data-oid="${r.oid}">Delete</button>
      </div>
    </div>`).join("") : "<p>No sales found.</p>";

  const wrap = document.createElement("div");
  wrap.className="modal-backdrop";
  wrap.innerHTML = `<div class="modal glass">
    <div class="modal-header"><div class="modal-title">Garage Sales</div><button type="button" class="modal-close" aria-label="Close">×</button></div>
    <div class="modal-body"></div>
    <div class="modal-actions"><button type="button" class="btn">Close</button></div>
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
      const oid = +btn.dataset.oid; const f = rows.find(r=> r.oid===oid)?.feature;
      closeAllModals(); if (f){ loadForEdit(f); view.goTo(f.geometry).catch(()=>{}); }
    });
  });
  body.querySelectorAll(".btn-del").forEach(btn=>{
    btn.addEventListener("click", async (e)=>{
      e.preventDefault(); e.stopPropagation();
      const oid = +btn.dataset.oid; const f = rows.find(r=> r.oid===oid)?.feature;
      closeAllModals(); if (f){ selectedFeature = f; await onDelete(); }
    });
  });
}

async function showGuide(){
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
  wrap.querySelector(".btn").onclick        = ()=> closeAllModals();
  document.body.appendChild(wrap);
}

// boot
init();
