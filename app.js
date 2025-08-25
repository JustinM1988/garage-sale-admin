// v3.5 — debug overlay + OSM fallback + ghost pin + guarded add + height self-fix

import esriConfig   from "https://js.arcgis.com/4.29/@arcgis/core/config.js";
import Map          from "https://js.arcgis.com/4.29/@arcgis/core/Map.js";
import MapView      from "https://js.arcgis.com/4.29/@arcgis/core/views/MapView.js";
import FeatureLayer from "https://js.arcgis.com/4.29/@arcgis/core/layers/FeatureLayer.js";
import GraphicsLayer from "https://js.arcgis.com/4.29/@arcgis/core/layers/GraphicsLayer.js";
import Graphic      from "https://js.arcgis.com/4.29/@arcgis/core/Graphic.js";
import Search       from "https://js.arcgis.com/4.29/@arcgis/core/widgets/Search.js";
import OAuthInfo    from "https://js.arcgis.com/4.29/@arcgis/core/identity/OAuthInfo.js";
import esriId       from "https://js.arcgis.com/4.29/@arcgis/core/identity/IdentityManager.js";

const DEBUG = true;

// ---------- Config ----------
const CONFIG = {
  LAYER_URL: "https://services3.arcgis.com/DAf01WuIltSLujAv/arcgis/rest/services/Garage_Sales/FeatureServer/0",
  PORTAL_URL: "https://www.arcgis.com",
  OAUTH_APPID: null,
  CENTER: [-97.323, 27.876],
  ZOOM: 13
};
// Put an ArcGIS API key here only if you want ArcGIS basemaps.
// Leave null to use OSM (no key required, reduces failure points).
const ARCGIS_API_KEY = null;

const FIELDS = { address: "Address", description: "Description", start: "Date_1", end: "EndDate" };

// ---------- tiny helpers ----------
const $ = (sel) => document.querySelector(sel);
function toast(msg){
  const n=document.createElement("div");
  n.className="toast glass";
  n.innerHTML=`<span class="toast-text">${msg}</span>`;
  document.body.appendChild(n);
  setTimeout(()=>n.remove(),2200);
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

// ---------- debug overlay ----------
function makeDebug(){
  if (!DEBUG) return null;
  const box = document.createElement("div");
  box.style.cssText = `
    position: fixed; top: 8px; left: 8px; z-index: 3000;
    max-width: 44vw; padding: 8px 10px; font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
    background: rgba(0,0,0,.65); color: #e6fffa; border:1px solid rgba(255,255,255,.2); border-radius:8px;
    box-shadow: 0 6px 16px rgba(0,0,0,.4);
  `;
  box.innerHTML = `<div style="font-weight:700;margin-bottom:4px;">Debug</div><div id="dbglog"></div>`;
  document.body.appendChild(box);
  const logEl = box.querySelector("#dbglog");
  const log = (msg, level="")=>{
    const c = level==="err" ? "#ff8c8c" : level==="warn" ? "#ffe08c" : "#b8f3ff";
    const row = document.createElement("div");
    row.innerHTML = `<span style="color:${c}">•</span> ${msg}`;
    logEl.appendChild(row);
  };
  window.addEventListener("error", (e)=> log(`JS Error: ${e.message}`, "err"));
  window.addEventListener("unhandledrejection", (e)=> log(`Unhandled: ${e.reason}`, "err"));
  return { log, box };
}

let DBG = null;

// ---------- app state ----------
let map, view, layer, editLayer, ghostLayer, ghostGraphic, search;
let selectedFeature=null, objectIdField="OBJECTID";
let signedIn=false, inNewMode=false;

function closeAllModals(){ document.querySelectorAll(".modal-backdrop").forEach(n=>n.remove()); }

// ---------- init ----------
async function init(){
  DBG = makeDebug();
  DBG?.log(`app v3.5 starting`);
  DBG?.log(`UA: ${navigator.userAgent.split(")")[0]})`);
  const mapDiv = document.getElementById("map");
  if (!mapDiv){ DBG?.log(`#map not found in DOM (index.html mismatch)`, "err"); return; }

  // Map container size check + self-fix
  const checkSize = ()=>{
    const h = mapDiv.offsetHeight, w = mapDiv.offsetWidth;
    DBG?.log(`map div size: ${w} x ${h}px`);
    if (h < 200){
      DBG?.log(`map div too short (<200px). Applying height self-fix.`, "warn");
      mapDiv.style.minHeight = "520px";
      mapDiv.style.height = "60vh";
    }
  };
  checkSize();

  // Optional OAuth
  if (CONFIG.OAUTH_APPID){
    try{
      const info = new OAuthInfo({ appId: CONFIG.OAUTH_APPID, portalUrl: CONFIG.PORTAL_URL, popup:true });
      esriId.registerOAuthInfos([info]);
      await esriId.checkSignInStatus(`${CONFIG.PORTAL_URL}/sharing`);
      signedIn=true; DBG?.log(`OAuth signed in`);
    }catch{ DBG?.log(`OAuth not signed in`); }
  }

  // Basemap selection
  if (ARCGIS_API_KEY){
    esriConfig.apiKey = ARCGIS_API_KEY;
    map = new Map({ basemap: "arcgis-dark-gray" });
    DBG?.log(`basemap: arcgis-dark-gray (with key)`);
  } else {
    map = new Map({ basemap: "osm" });
    DBG?.log(`basemap: OSM (no key)`);
  }

  view = new MapView({ container: "map", map, center: CONFIG.CENTER, zoom: CONFIG.ZOOM });

  view.when(
    () => DBG?.log("MapView ready"),
    (err) => { DBG?.log(`MapView failed: ${err?.message||err}`, "err"); toast("Map failed to initialize."); }
  );

  // Feature layer
  layer = new FeatureLayer({ url: CONFIG.LAYER_URL, outFields: ["*"], popupEnabled:false });
  layer.renderer = {
    type:"simple",
    symbol: { type:"picture-marker", url: houseSvg("#ff4aa2","#ffffff"), width:"24px", height:"24px", yoffset:8 }
  };
  map.add(layer);

  try{
    await layer.load();
    objectIdField = layer.objectIdField;
    DBG?.log(`layer loaded, OID field: ${objectIdField}`);
    // Watch the layer view for errors/updates
    view.whenLayerView(layer).then(lv=>{
      DBG?.log(`layerview created`);
      lv.watch("updating", (u)=> DBG?.log(`layerview updating: ${u}`));
    }).catch(err=>{
      DBG?.log(`whenLayerView error: ${err?.message||err}`, "err");
    });
  }catch(e){
    DBG?.log(`layer load error: ${e?.message||e}`, "err");
  }

  // Layers for editing
  editLayer  = new GraphicsLayer(); map.add(editLayer);
  ghostLayer = new GraphicsLayer(); map.add(ghostLayer);

  // Search
  search = new Search({ view }); view.ui.add(search, "top-right");

  // Ghost pin follows mouse in New mode
  view.on("pointer-move", (e)=>{
    if (!inNewMode) return;
    const mp = view.toMap({ x:e.x, y:e.y }); if (!mp) return;
    if (!ghostGraphic){
      ghostGraphic = new Graphic({
        geometry: mp,
        symbol: { type: "simple-marker", size: 14, color: [60,240,212,0.9], outline: { color:[12,26,44,1], width:1 } }
      });
      ghostLayer.add(ghostGraphic);
    } else {
      ghostGraphic.geometry = mp;
    }
  });

  // Guarded click: select when not in New; place when in New
  view.on("click", async (ev)=>{
    if (!inNewMode){
      const ht = await view.hitTest(ev);
      const g = ht.results.find(r=> r.graphic?.layer === layer)?.graphic;
      if (g) loadForEdit(g);
      return;
    }
    finalizePlacement(ev.mapPoint);
  });

  // UI events
  $("#btnSave")  ?.addEventListener("click", onSave);
  $("#btnNew")   ?.addEventListener("click", enterAddMode);
  $("#btnCancel")?.addEventListener("click", cancelEditing);
  $("#btnDelete")?.addEventListener("click", onDelete);
  $("#btnSales") ?.addEventListener("click", showSalesList);
  $("#btnGuide") ?.addEventListener("click", showGuide);

  $("#btnSignIn") ?.addEventListener("click", async ()=>{
    if (!CONFIG.OAUTH_APPID){ toast("Sign-in not required."); return; }
    try{ await esriId.getCredential(`${CONFIG.PORTAL_URL}/sharing`); signedIn=true; toast("Signed in."); updateAuthUI(); }
    catch(_){} // cancelled
  });
  $("#btnSignOut")?.addEventListener("click", ()=>{
    esriId.destroyCredentials(); signedIn=false; toast("Signed out."); updateAuthUI();
  });

  ["timeStartHour","timeStartMin","timeStartAmPm","timeEndHour","timeEndMin","timeEndAmPm","details","chkCompose"]
    .forEach(id=> $("#"+id)?.addEventListener("input", syncDesc));
  syncDesc();

  updateAuthUI();

  // Status + coordinate chip
  view.watch("center", ()=>{
    const c=view.center;
    const el=$("#coords"); if (!el) return;
    el.textContent=`Lon: ${c.longitude.toFixed(5)} • Lat: ${c.latitude.toFixed(5)}`;
  });

  setStatus("Click a sale to edit, or click New to add a sale.");

  // Re-check map size after a moment (handles CSS loading late)
  setTimeout(checkSize, 1200);
}

// ---------- auth UI ----------
function updateAuthUI(){
  const inUse = !!CONFIG.OAUTH_APPID;
  const signInBtn = $("#btnSignIn"), signOutBtn = $("#btnSignOut");
  if (!inUse){ signInBtn && (signInBtn.style.display="none"); signOutBtn && (signOutBtn.style.display="none"); return; }
  if (signedIn){ signInBtn && (signInBtn.style.display="none"); signOutBtn && (signOutBtn.style.display="inline-block"); }
  else { signInBtn && (signInBtn.style.display="inline-block"); signOutBtn && (signOutBtn.style.display="none"); }
}

// ---------- add/edit flow ----------
function enterAddMode(){
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

// ---------- save/delete ----------
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
    const q = await layer.queryFeatures({ objectIds:[oid], returnGeometry:true, outFields:["*"] });
    if (q.features.length) loadForEdit(q.features[0]);

    toast(selectedFeature ? "Sale updated." : "Sale added.");
    inNewMode=false; $("#btnCancel") && ($("#btnCancel").style.display="none"); $("#modeChip") && ($("#modeChip").style.display="none");
  }catch(e){ console.error(e); toast("Save failed (permissions or network)."); }
}
async function onDelete(){
  if (CONFIG.OAUTH_APPID && !signedIn) { toast("Sign in to delete."); return; }
  if (!selectedFeature) return toast("Select a sale first.");
  try{
    const r = await layer.applyEdits({ deleteFeatures: [{ objectId: selectedFeature.attributes[layer.objectIdField] }] });
    if (r.deleteFeatureResults?.[0]?.error) throw r.deleteFeatureResults[0].error;
    editLayer.removeAll(); selectedFeature=null;
    $("#address").value = ""; $("#descriptionRaw").value=""; $("#dateStart").value=""; $("#dateEnd").value="";
    toast("Deleted.");
  }catch(e){ console.error(e); toast("Delete failed."); }
}

// ---------- Sales list + Guide ----------
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
      const oid=+btn.dataset.oid; const f=rows.find(r=>r.oid===oid)?.feature;
      closeAllModals(); if (f){ loadForEdit(f); view.goTo(f.geometry).catch(()=>{}); }
    });
  });
  body.querySelectorAll(".btn-del").forEach(btn=>{
    btn.addEventListener("click", async (e)=>{
      e.preventDefault(); e.stopPropagation();
      const oid=+btn.dataset.oid; const f=rows.find(r=>r.oid===oid)?.feature;
      closeAllModals(); if (f){ selectedFeature=f; await onDelete(); }
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
  wrap.querySelector(".btn").onclick = ()=> closeAllModals();
  document.body.appendChild(wrap);
}

init();
