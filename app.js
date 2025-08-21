// Sleek Neon build — front-end only editor for one Hosted Feature Layer
const CONFIG = {
  LAYER_URL: "https://services3.arcgis.com/DAf01WuIltSLujAv/arcgis/rest/services/Garage_Sales/FeatureServer/0",
  PORTAL_URL: "https://www.arcgis.com",
  OAUTH_APPID: null, // set to your AGOL OAuth appId to require sign‑in
  CENTER: [-97.323, 27.876],
  ZOOM: 13
};

const FIELDS = {
  address: "Address",
  description: "Description",
  start: "Date_1",
  end: "EndDate"
};

import Map from "https://js.arcgis.com/4.29/@arcgis/core/Map.js";
import MapView from "https://js.arcgis.com/4.29/@arcgis/core/views/MapView.js";
import FeatureLayer from "https://js.arcgis.com/4.29/@arcgis/core/layers/FeatureLayer.js";
import GraphicsLayer from "https://js.arcgis.com/4.29/@arcgis/core/layers/GraphicsLayer.js";
import Graphic from "https://js.arcgis.com/4.29/@arcgis/core/Graphic.js";
import Search from "https://js.arcgis.com/4.29/@arcgis/core/widgets/Search.js";
import OAuthInfo from "https://js.arcgis.com/4.29/@arcgis/core/identity/OAuthInfo.js";
import esriId from "https://js.arcgis.com/4.29/@arcgis/core/identity/IdentityManager.js";

const $ = (sel) => document.querySelector(sel);
function toast(msg){ const n=document.getElementById("toastTpl").content.cloneNode(true).firstElementChild; n.querySelector(".toast-text").textContent=msg; document.body.appendChild(n); setTimeout(()=>n.remove(),2500);}
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

let map, view, layer, editLayer, search, selectedFeature=null, objectIdField="OBJECTID", signedIn=false;

async function init(){
  if (CONFIG.OAUTH_APPID){
    const info = new OAuthInfo({ appId: CONFIG.OAUTH_APPID, portalUrl: CONFIG.PORTAL_URL, popup:true });
    esriId.registerOAuthInfos([info]);
  }

  map = new Map({ basemap: "arcgis-dark-gray" });
  view = new MapView({ container:"map", map, center: CONFIG.CENTER, zoom: CONFIG.ZOOM });

  layer = new FeatureLayer({ url: CONFIG.LAYER_URL, outFields: ["*"], popupEnabled:false });
  map.add(layer);

  editLayer = new GraphicsLayer(); map.add(editLayer);
  search = new Search({ view }); view.ui.add(search, "top-right");

  await layer.load(); objectIdField = layer.objectIdField;

  view.on("click", async (ev)=>{
    const ht = await view.hitTest(ev);
    const g = ht.results.find(r=> r.graphic?.layer === layer)?.graphic;
    if (g){ loadForEdit(g); }
    else { placePoint(ev.mapPoint.longitude, ev.mapPoint.latitude); selectedFeature=null; setStatus("New sale — place set, fill info then Save."); }
  });

  $("#btnSave").addEventListener("click", onSave);
  $("#btnNew").addEventListener("click", clearForm);
  $("#btnDelete").addEventListener("click", onDelete);

  $("#btnSignIn").addEventListener("click", async ()=>{
    try{ await esriId.getCredential(`${CONFIG.PORTAL_URL}/sharing`); signedIn=true; $("#btnSignIn").style.display="none"; $("#btnSignOut").style.display="inline-block"; toast("Signed in.");}
    catch(e){ toast("Sign-in cancelled.");}
  });
  $("#btnSignOut").addEventListener("click", ()=>{ esriId.destroyCredentials(); signedIn=false; $("#btnSignIn").style.display="inline-block"; $("#btnSignOut").style.display="none"; toast("Signed out."); });

  ["timeStartHour","timeStartMin","timeStartAmPm","timeEndHour","timeEndMin","timeEndAmPm","details","chkCompose"].forEach(id=> $("#"+id).addEventListener("input", syncDesc));
  syncDesc();

  // If sign-in required, disable save/delete until logged in
  updateAuthUI();

  view.watch("center", ()=>{ const c=view.center; $("#coords").textContent=`Lon: ${c.longitude.toFixed(5)} • Lat: ${c.latitude.toFixed(5)}`; });

  setStatus("Click an existing sale to edit, or click map to add a new one.");
}

function updateAuthUI(){
  const needsAuth = !!CONFIG.OAUTH_APPID;
  $("#btnSave").disabled = needsAuth && !signedIn;
  $("#btnDelete").disabled = needsAuth && !signedIn;
  if (needsAuth) $("#status").textContent = (signedIn ? "Authenticated." : "Sign in to save changes.");
}

function setStatus(t){ $("#status").textContent = t; }

function placePoint(lon, lat){
  editLayer.removeAll();
  editLayer.add(new Graphic({ geometry:{ type:"point", longitude:lon, latitude:lat }, symbol:{ type:"simple-marker", size:13, outline:{ width:1 } } }));
}

function loadForEdit(g){
  selectedFeature = g;
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
  return {
    [FIELDS.address]: $("#address").value.trim() || null,
    [FIELDS.description]: $("#descriptionRaw").value.trim() || null,
    [FIELDS.start]: toEpoch($("#dateStart").value),
    [FIELDS.end]: toEpoch($("#dateEnd").value)
  };
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
    toast(selectedFeature ? "Updated." : "Added.");
    const oid = r.objectId || (selectedFeature?.attributes?.[objectIdField]);
    const q = await layer.queryFeatures({ objectIds:[oid], returnGeometry:true, outFields:["*"] });
    if (q.features.length) loadForEdit(q.features[0]);
  }catch(e){ console.error(e); toast("Save failed."); }
}

async function onDelete(){
  if (!!CONFIG.OAUTH_APPID && !signedIn) { toast("Sign in to delete."); return; }
  if (!selectedFeature) return toast("Select a sale first.");
  if (!confirm("Delete this sale?")) return;
  try{
    const r = await layer.applyEdits({ deleteFeatures: [{ objectId: selectedFeature.attributes[objectIdField] }] });
    if (r.deleteFeatureResults?.[0]?.error) throw r.deleteFeatureResults[0].error;
    toast("Deleted."); clearForm(); editLayer.removeAll(); selectedFeature=null; setStatus("Deleted. Click map to add a new one.");
  }catch(e){ console.error(e); toast("Delete failed."); }
}

function clearForm(){
  $("#address").value = ""; $("#dateStart").value = ""; $("#dateEnd").value = "";
  $("#timeStartHour").value = ""; $("#timeStartMin").value = ""; $("#timeStartAmPm").value = "AM";
  $("#timeEndHour").value = ""; $("#timeEndMin").value = ""; $("#timeEndAmPm").value = "PM";
  $("#details").value = ""; $("#descriptionRaw").value = "";
  setStatus("New sale — click the map to place a point.");
  selectedFeature=null;
}

init();
