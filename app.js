// v3.1 — cancel button, brighter edit marker, custom renderer, wider AM/PM, new splash key
const CONFIG = {
  LAYER_URL: "https://services3.arcgis.com/DAf01WuIltSLujAv/arcgis/rest/services/Garage_Sales/FeatureServer/0",
  PORTAL_URL: "https://www.arcgis.com",
  OAUTH_APPID: null, // set to your AGOL OAuth appId to require sign‑in
  CENTER: [-97.323, 27.876],
  ZOOM: 13
};

const FIELDS = { address: "Address", description: "Description", start: "Date_1", end: "EndDate" };

import Map from "https://js.arcgis.com/4.29/@arcgis/core/Map.js";
import MapView from "https://js.arcgis.com/4.29/@arcgis/core/views/MapView.js";
import FeatureLayer from "https://js.arcgis.com/4.29/@arcgis/core/layers/FeatureLayer.js";
import GraphicsLayer from "https://js.arcgis.com/4.29/@arcgis/core/layers/GraphicsLayer.js";
import Graphic from "https://js.arcgis.com/4.29/@arcgis/core/Graphic.js";
import Search from "https://js.arcgis.com/4.29/@arcgis/core/widgets/Search.js";
import OAuthInfo from "https://js.arcgis.com/4.29/@arcgis/core/identity/OAuthInfo.js";
import esriId from "https://js.arcgis.com/4.29/@arcgis/core/identity/IdentityManager.js";

const $ = (sel) => document.querySelector(sel);
function toast(msg){ const n=document.getElementById("toastTpl").content.cloneNode(true).firstElementChild; n.querySelector(".toast-text").textContent=msg; document.body.appendChild(n); setTimeout(()=>n.remove(),2400);}

function openModal({title, html, actions=[{label:"Close"}]}){
  return new Promise((resolve)=>{
    const tpl = document.getElementById("modalTpl").content.cloneNode(true);
    const root = tpl.querySelector(".modal-backdrop");
    tpl.querySelector(".modal-title").textContent = title || "";
    const body = tpl.querySelector(".modal-body"); body.innerHTML = html || "";
    const acts = tpl.querySelector(".modal-actions"); acts.innerHTML = "";
    actions.forEach((a,i)=>{ const b=document.createElement("button"); b.className="btn"+(a.variant?" "+a.variant:""); b.textContent=a.label||"OK"; b.addEventListener("click",()=>{root.remove(); resolve(a.value ?? i);}); acts.appendChild(b); });
    tpl.querySelector(".modal-close").addEventListener("click",()=>{root.remove(); resolve(null);});
    document.body.appendChild(root);
  });
}

function toEpoch(s){ if(!s) return null; const d=new Date(s); return isNaN(d)?null:d.getTime();}
function fromEpoch(ms){ if(!ms) return ""; const d=new Date(ms); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function cleanInt(v,min,max){ const n=parseInt(v,10); if(isNaN(n)) return null; return Math.max(min,Math.min(max,n)); }
function composeDescription(){
  const fmt=(h,m,ap)=>`${h}:${String(m).padStart(2,"0")} ${ap}`;
  const sH=cleanInt($("#timeStartHour").value,1,12)??9;
  const sM=cleanInt($("#timeStartMin").value,0,59)??0;
  const sAP=$("#timeStartAmPm").value;
  const eH=cleanInt($("#timeEndHour").value,1,12)??2;
  const eM=cleanInt($("#timeEndMin").value,0,59)??0;
  const eAP=$("#timeEndAmPm").value;
  const details=$("#details").value?.trim() ?? "";
  const time=`${fmt(sH,sM,sAP)} - ${fmt(eH,eM,eAP)}`;
  return details ? `${time}: ${details}` : time;
}
function syncDesc(){ if($("#chkCompose").checked) $("#descriptionRaw").value = composeDescription(); }

let map, view, layer, editLayer, search, selectedFeature=null, objectIdField="OBJECTID", signedIn=false, inNewMode=false;

async function init(){
  if (CONFIG.OAUTH_APPID){
    const info = new OAuthInfo({ appId: CONFIG.OAUTH_APPID, portalUrl: CONFIG.PORTAL_URL, popup:true });
    esriId.registerOAuthInfos([info]);
  }

  map = new Map({ basemap: "arcgis-dark-gray" });
  view = new MapView({ container:"map", map, center: CONFIG.CENTER, zoom: CONFIG.ZOOM });

  layer = new FeatureLayer({ url: CONFIG.LAYER_URL, outFields: ["*"], popupEnabled:false });
  // Unique-ish renderer for all sales
  layer.renderer = {
    type:"simple",
    symbol: {
      type:"simple-marker",
      style:"diamond",
      color:[255,140,0,0.95], /* orange */
      size:10,
      outline:{ color:[255,255,255,0.6], width:0.6 }
    }
  };
  map.add(layer);

  editLayer = new GraphicsLayer(); map.add(editLayer);
  search = new Search({ view }); view.ui.add(search, "top-right");

  await layer.load(); objectIdField = layer.objectIdField;

  view.on("click", async (ev)=>{
    if (!inNewMode) {
      const ht = await view.hitTest(ev);
      const g = ht.results.find(r=> r.graphic?.layer === layer)?.graphic;
      if (g){ loadForEdit(g); return; }
    }
    // Normal or new mode: place point
    placePoint(ev.mapPoint.longitude, ev.mapPoint.latitude);
    selectedFeature=null;
    showCancel(true);
    setStatus("New sale — point placed. Fill the form and Save, or Cancel.");
    inNewMode=true;
  });

  $("#btnSave").addEventListener("click", onSave);
  $("#btnNew").addEventListener("click", ()=>{ clearForm(); inNewMode=true; showCancel(true); setStatus("New sale — click the map to place a point."); });
  $("#btnCancel").addEventListener("click", cancelEditing);
  $("#btnDelete").addEventListener("click", onDelete);

  $("#btnSales").addEventListener("click", showSalesList);
  $("#btnGuide").addEventListener("click", showGuide);

  $("#btnSignIn").addEventListener("click", async ()=>{ try{ await esriId.getCredential(`${CONFIG.PORTAL_URL}/sharing`); signedIn=true; $("#btnSignIn").style.display="none"; $("#btnSignOut").style.display="inline-block"; toast("Signed in."); updateAuthUI(); }catch(e){ toast("Sign-in cancelled."); } });
  $("#btnSignOut").addEventListener("click", ()=>{ esriId.destroyCredentials(); signedIn=false; $("#btnSignIn").style.display="inline-block"; $("#btnSignOut").style.display="none"; toast("Signed out."); updateAuthUI(); });

  ["timeStartHour","timeStartMin","timeStartAmPm","timeEndHour","timeEndMin","timeEndAmPm","details","chkCompose"].forEach(id=> $("#"+id).addEventListener("input", syncDesc));
  syncDesc();

  updateAuthUI();

  view.watch("center", ()=>{ const c=view.center; $("#coords").textContent=`Lon: ${c.longitude.toFixed(5)} • Lat: ${c.latitude.toFixed(5)}`; });

  setStatus("Click an existing sale to edit, or click map to add a new one.");

  // Splash key bumped so you'll see it after upgrade
  if (!localStorage.getItem("gs_admin_v31_seen")){
    await showGuide();
    localStorage.setItem("gs_admin_v31_seen","1");
  }
}

function showCancel(show){ $("#btnCancel").style.display = show ? "inline-block" : "none"; }
function updateAuthUI(){ const needsAuth=!!CONFIG.OAUTH_APPID; $("#btnSave").disabled = needsAuth && !signedIn; $("#btnDelete").disabled = needsAuth && !signedIn; if (needsAuth && !signedIn) setStatus("Sign in to save changes."); }
function setStatus(t){ $("#status").textContent = t; }

function placePoint(lon, lat){
  editLayer.removeAll();
  // Bright neon edit marker (two overlapping graphics for glow-ish effect)
  editLayer.add(new Graphic({ geometry:{ type:"point", longitude:lon, latitude:lat }, symbol:{ type:"simple-marker", size:16, color:[60,240,212,0.95], outline:{ color:[12,26,44,1], width:1.2 } } }));
  editLayer.add(new Graphic({ geometry:{ type:"point", longitude:lon, latitude:lat }, symbol:{ type:"simple-marker", size:24, color:[60,240,212,0.18], outline:{ color:[60,240,212,0.0], width:0 } } }));
}

function loadForEdit(g){
  selectedFeature = g; inNewMode=false; showCancel(false);
  const a = g.attributes || {};
  $("#address").value = a[FIELDS.address] ?? "";
  $("#descriptionRaw").value = a[FIELDS.description] ?? "";
  $("#dateStart").value = fromEpoch(a[FIELDS.start]) || "";
  $("#dateEnd").value = fromEpoch(a[FIELDS.end]) || "";
  parseTimeFromDescription($("#descriptionRaw").value);
  placePoint(g.geometry.longitude, g.geometry.latitude);
  const label = [a[FIELDS.address], fromEpoch(a[FIELDS.start])].filter(Boolean).join(" — ");
  setStatus(`Editing: ${label}`);
}

function parseTimeFromDescription(text){
  const m = text.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*[-–]\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return;
  $("#timeStartHour").value = m[1]; $("#timeStartMin").value = m[2]; $("#timeStartAmPm").value = m[3].toUpperCase();
  $("#timeEndHour").value = m[4]; $("#timeEndMin").value = m[5]; $("#timeEndAmPm").value = m[6].toUpperCase();
  if ($("#chkCompose").checked) syncDesc();
}

function attributesFromForm(){
  syncDesc();
  return { [FIELDS.address]: $("#address").value.trim() || null, [FIELDS.description]: $("#descriptionRaw").value.trim() || null, [FIELDS.start]: toEpoch($("#dateStart").value), [FIELDS.end]: toEpoch($("#dateEnd").value) };
}

async function onSave(){
  if (!!CONFIG.OAUTH_APPID && !signedIn) { toast("Sign in to save."); return; }
  if (editLayer.graphics.length === 0) return toast("Click the map to place a point.");
  const geom = editLayer.graphics.getItemAt(0).geometry;
  const attrs = attributesFromForm();
  if (!attrs[FIELDS.address]) return toast("Address is required.");
  if (!attrs[FIELDS.description]) return toast("Description is required.");
  if (!attrs[FIELDS.start]) return toast("Start date is required.");

  let edits;
  if (selectedFeature){ attrs[objectIdField] = selectedFeature.attributes[objectIdField]; edits = { updateFeatures: [{ attributes: attrs, geometry: geom }] }; }
  else { edits = { addFeatures: [{ attributes: attrs, geometry: geom }] }; }

  try{
    const result = await layer.applyEdits(edits);
    const r = (result.addFeatureResults?.[0] || result.updateFeatureResults?.[0]);
    if (r?.error) throw r.error;
    const oid = r.objectId || (selectedFeature?.attributes?.[objectIdField]);
    const q = await layer.queryFeatures({ objectIds:[oid], returnGeometry:true, outFields:["*"] });
    if (q.features.length) loadForEdit(q.features[0]);

    await openModal({
      title: selectedFeature ? "Sale Updated" : "Sale Added",
      html: `<p><strong>Address:</strong> ${attrs[FIELDS.address] || ""}</p>
             <p><strong>Dates:</strong> ${fromEpoch(attrs[FIELDS.start])} → ${fromEpoch(attrs[FIELDS.end]) || ""}</p>
             <p><strong>Description:</strong><br>${(attrs[FIELDS.description] || "").replace(/</g,'&lt;')}</p>`,
      actions: [{label:"OK", value:true}]
    });
    inNewMode=false; showCancel(false);
  }catch(e){ console.error(e); await openModal({ title:"Save failed", html:`<p>Could not save. Check permissions and CORS settings.</p>` }); }
}

async function onDelete(){
  if (!!CONFIG.OAUTH_APPID && !signedIn) { toast("Sign in to delete."); return; }
  if (!selectedFeature) return toast("Select a sale first.");
  const confirm = await openModal({ title:"Delete Sale?", html:"<p>This cannot be undone.</p>", actions:[{label:"Cancel", value:false, variant:"btn-secondary"}, {label:"Delete", value:true, variant:"btn-danger"}]});
  if (!confirm) return;
  try{
    const r = await layer.applyEdits({ deleteFeatures: [{ objectId: selectedFeature.attributes[objectIdField] }] });
    if (r.deleteFeatureResults?.[0]?.error) throw r.deleteFeatureResults[0].error;
    editLayer.removeAll(); selectedFeature=null; clearForm();
    await openModal({ title:"Deleted", html:"<p>The sale has been removed.</p>" });
  }catch(e){ console.error(e); await openModal({ title:"Delete failed", html:"<p>Could not delete. Check permissions.</p>" }); }
}

function cancelEditing(){ inNewMode=false; showCancel(false); editLayer.removeAll(); setStatus("Cancelled new sale. Click a sale to edit, or click map to add a new one."); }

function clearForm(){
  $("#address").value = ""; $("#dateStart").value = ""; $("#dateEnd").value = "";
  $("#timeStartHour").value = ""; $("#timeStartMin").value = ""; $("#timeStartAmPm").value = "AM";
  $("#timeEndHour").value = ""; $("#timeEndMin").value = ""; $("#timeEndAmPm").value = "PM";
  $("#details").value = ""; $("#descriptionRaw").value = "";
  setStatus("New sale — click the map to place a point.");
  selectedFeature=null;
}

async function showSalesList(){
  const q = await layer.queryFeatures({ where: "1=1", outFields: ["*"], orderByFields: [FIELDS.start + " DESC"], returnGeometry: true, num: 200 });
  const rows = q.features.map(f=>{ const a=f.attributes; const title=a[FIELDS.address]||"(no address)"; const sub=[fromEpoch(a[FIELDS.start]), fromEpoch(a[FIELDS.end])].filter(Boolean).join(" → "); return { oid:a[objectIdField], title, sub, feature:f }; });
  const items = rows.map(r=>`<div class="list-row" data-oid="${r.oid}"><div class="meta"><span class="title">${r.title.replace(/</g,'&lt;')}</span><span>${r.sub}</span></div><div class="row-actions"><button class="btn btn-secondary btn-edit" data-oid="${r.oid}">Edit</button><button class="btn btn-danger btn-del" data-oid="${r.oid}">Delete</button></div></div>`).join("") || "<p>No sales found.</p>";
  const modal = document.getElementById("modalTpl").content.cloneNode(true); const root = modal.querySelector(".modal-backdrop"); modal.querySelector(".modal-title").textContent = "Garage Sales"; modal.querySelector(".modal-body").innerHTML = `<div class="list">${items}</div>`; modal.querySelector(".modal-actions").innerHTML = '<button class="btn">Close</button>'; modal.querySelector(".modal-actions .btn").addEventListener("click", ()=> root.remove()); modal.querySelector(".modal-close").addEventListener("click", ()=> root.remove()); document.body.appendChild(modal);
  root.addEventListener("click", (e)=>{ const editBtn=e.target.closest(".btn-edit"); const delBtn=e.target.closest(".btn-del"); if (editBtn){ const oid=+editBtn.dataset.oid; const f=rows.find(r=> r.oid===oid)?.feature; if (f){ loadForEdit(f); view.goTo(f.geometry).catch(()=>{}); } root.remove(); } if (delBtn){ const oid=+delBtn.dataset.oid; const f=rows.find(r=> r.oid===oid)?.feature; if (f){ root.remove(); selectedFeature=f; onDelete(); } } });
}

async function showGuide(){
  const html = `<ol style="line-height:1.7;"><li><strong>Add a sale:</strong> click <em>New</em>, click the map to place the point, fill Address + Dates + Time/Details, then <em>Save</em>. Use <em>Cancel</em> to exit new mode.</li><li><strong>Edit a sale:</strong> click a point on the map or open <em>Sales</em> and click <em>Edit</em>.</li><li><strong>Delete:</strong> select a sale, then <em>Delete</em> (confirmation required).</li><li><strong>Description:</strong> auto‑composed from time + details; uncheck to type your own.</li></ol>`;
  await openModal({ title: "Quick Guide", html, actions: [{label:"Got it", value:true}] });
}

init();
