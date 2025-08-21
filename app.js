// Front-end only admin for a single hosted feature layer (points)
// Uses ArcGIS Maps SDK for JavaScript (ESM on CDN)
// Author: Generated for City of Portland, TX

// ------------------ CONFIG ------------------
const CONFIG = {
  LAYER_URL: "https://services3.arcgis.com/DAf01WuIltSLujAv/arcgis/rest/services/Garage_Sales/FeatureServer/0",
  PORTAL_URL: "https://www.arcgis.com", // for OAuth popups if needed
  OAUTH_APPID: null, // <--- optionally set an AGOL OAuth appId; leave null for public editing layers
  CENTER: [-97.323, 27.876], // Portland, TX
  ZOOM: 13,
  DESCRIPTION_PREFIX_FROM_TIME: true
};

// Field names in the Garage Sales layer
const FIELDS = {
  address: "Address",
  description: "Description",
  start: "Date_1",
  end: "EndDate"
};

// ------------------ ESM imports ------------------
import Map from "https://js.arcgis.com/4.29/@arcgis/core/Map.js";
import MapView from "https://js.arcgis.com/4.29/@arcgis/core/views/MapView.js";
import FeatureLayer from "https://js.arcgis.com/4.29/@arcgis/core/layers/FeatureLayer.js";
import GraphicsLayer from "https://js.arcgis.com/4.29/@arcgis/core/layers/GraphicsLayer.js";
import Graphic from "https://js.arcgis.com/4.29/@arcgis/core/Graphic.js";
import Search from "https://js.arcgis.com/4.29/@arcgis/core/widgets/Search.js";
import OAuthInfo from "https://js.arcgis.com/4.29/@arcgis/core/identity/OAuthInfo.js";
import esriId from "https://js.arcgis.com/4.29/@arcgis/core/identity/IdentityManager.js";

// ------------------ Tiny helpers ------------------
const $ = (sel) => document.querySelector(sel);
function toast(msg) {
  const tpl = document.getElementById("toastTpl").content.cloneNode(true);
  tpl.querySelector(".toast-text").textContent = msg;
  const node = tpl.firstElementChild;
  document.body.appendChild(node);
  setTimeout(()=> node.remove(), 2600);
}
function toEpoch(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d.getTime();
}
function fromEpoch(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}
function cleanInt(v, min, max) {
  const n = parseInt(v, 10);
  if (isNaN(n)) return null;
  return Math.max(min, Math.min(max, n));
}
function composedDescription() {
  // Build "9:00 AM - 2:00 PM: Details text" from the form pieces
  const sH = cleanInt($("#timeStartHour").value, 1, 12) ?? 9;
  const sM = cleanInt($("#timeStartMin").value, 0, 59) ?? 0;
  const sAmPm = $("#timeStartAmPm").value;
  const eH = cleanInt($("#timeEndHour").value, 1, 12) ?? 2;
  const eM = cleanInt($("#timeEndMin").value, 0, 59) ?? 0;
  const eAmPm = $("#timeEndAmPm").value;
  const details = $("#details").value?.trim() ?? "";
  const fmt = (h, m, ap) => `${h}:${String(m).padStart(2,"0")} ${ap}`;
  const time = `${fmt(sH,sM,sAmPm)} - ${fmt(eH,eM,eAmPm)}`;
  return details ? `${time}: ${details}` : time;
}
function syncDescription() {
  if ($("#chkCompose").checked) {
    $("#descriptionRaw").value = composedDescription();
  }
}

// ------------------ Map + Layer ------------------
let map, view, layer, editLayer, search, selectedFeature = null, objectIdField = "OBJECTID";

async function init() {
  // Optional OAuth (only if OAUTH_APPID present)
  if (CONFIG.OAUTH_APPID) {
    const info = new OAuthInfo({ appId: CONFIG.OAUTH_APPID, portalUrl: CONFIG.PORTAL_URL, popup: true });
    esriId.registerOAuthInfos([info]);
  }

  map = new Map({ basemap: "streets-navigation-vector" });
  view = new MapView({
    container: "map",
    map,
    center: CONFIG.CENTER,
    zoom: CONFIG.ZOOM,
    padding: { top: 10 }
  });

  layer = new FeatureLayer({
    url: CONFIG.LAYER_URL,
    outFields: ["*"],
    popupEnabled: false
  });
  map.add(layer);

  // Layer to show the editable point
  editLayer = new GraphicsLayer();
  map.add(editLayer);

  search = new Search({ view });
  view.ui.add(search, "top-right");

  // Click handler: select feature OR just place a point if empty area
  view.on("click", async (event) => {
    const ht = await view.hitTest(event);
    const featureHit = ht.results.find(r => r.graphic?.layer === layer)?.graphic;
    if (featureHit) {
      loadFeatureForEdit(featureHit);
    } else {
      placePoint(event.mapPoint.longitude, event.mapPoint.latitude);
      selectedFeature = null;
      $("#status").textContent = "New point placed: fill in the form and click Save.";
    }
  });

  // Pull objectIdField name
  await layer.load();
  objectIdField = layer.objectIdField;

  // UI listeners
  $("#btnSave").addEventListener("click", onSave);
  $("#btnNew").addEventListener("click", clearForm);
  $("#btnDelete").addEventListener("click", onDelete);
  $("#btnSignIn").addEventListener("click", async () => {
    try {
      await esriId.getCredential(`${CONFIG.PORTAL_URL}/sharing`);
      $("#btnSignIn").style.display = "none";
      $("#btnSignOut").style.display = "inline-block";
      toast("Signed in.");
    } catch(e){ toast("Sign-in cancelled."); }
  });
  $("#btnSignOut").addEventListener("click", () => {
    esriId.destroyCredentials();
    $("#btnSignIn").style.display = "inline-block";
    $("#btnSignOut").style.display = "none";
    toast("Signed out.");
  });

  // Compose description auto-sync
  ["timeStartHour","timeStartMin","timeStartAmPm","timeEndHour","timeEndMin","timeEndAmPm","details","chkCompose"]
    .forEach(id => $("#"+id).addEventListener("input", syncDescription));
  syncDescription();

  view.watch("center", () => {
    const c = view.center;
    $("#coords").textContent = `Lon: ${c.longitude.toFixed(5)} • Lat: ${c.latitude.toFixed(5)}`;
  });

  $("#status").textContent = "Click an existing sale to edit, or click the map to add a new one.";
}

function placePoint(lon, lat) {
  editLayer.removeAll();
  const g = new Graphic({
    geometry: { type: "point", longitude: lon, latitude: lat },
    symbol: { type: "simple-marker", size: 12, outline: { width: 1 } }
  });
  editLayer.add(g);
}

function loadFeatureForEdit(graphic) {
  selectedFeature = graphic;
  const attrs = graphic.attributes || {};
  $("#address").value = attrs[FIELDS.address] ?? "";
  $("#descriptionRaw").value = attrs[FIELDS.description] ?? "";
  $("#dateStart").value = fromEpoch(attrs[FIELDS.start]) || "";
  $("#dateEnd").value = fromEpoch(attrs[FIELDS.end]) || "";
  // Try to pre-parse time out of description (best-effort)
  parseTimeFromDescription($("#descriptionRaw").value);
  placePoint(graphic.geometry.longitude, graphic.geometry.latitude);
  $("#status").textContent = `Editing sale #${attrs[objectIdField] || ""}`;
}

function parseTimeFromDescription(text) {
  // naive: "9:00 AM - 2:00 PM: rest..." → populate time boxes
  const m = text.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*[-–]\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return;
  $("#timeStartHour").value = m[1];
  $("#timeStartMin").value = m[2];
  $("#timeStartAmPm").value = m[3].toUpperCase();
  $("#timeEndHour").value = m[4];
  $("#timeEndMin").value = m[5];
  $("#timeEndAmPm").value = m[6].toUpperCase();
  if ($("#chkCompose").checked) syncDescription();
}

function collectAttributes() {
  // If compose checked, sync before save
  syncDescription();

  return {
    [FIELDS.address]: $("#address").value.trim() || null,
    [FIELDS.description]: $("#descriptionRaw").value.trim() || null,
    [FIELDS.start]: toEpoch($("#dateStart").value),
    [FIELDS.end]: toEpoch($("#dateEnd").value)
  };
}

async function onSave() {
  if (editLayer.graphics.length === 0) {
    toast("Place a point on the map first.");
    return;
  }
  const geometry = editLayer.graphics.getItemAt(0).geometry;
  const attributes = collectAttributes();

  // Basic validation
  if (!attributes[FIELDS.address]) return toast("Address is required.");
  if (!attributes[FIELDS.description]) return toast("Description is required.");
  if (!attributes[FIELDS.start]) return toast("Start date is required.");

  let edits;
  if (selectedFeature) {
    attributes[objectIdField] = selectedFeature.attributes[objectIdField];
    edits = { updateFeatures: [{ attributes, geometry }] };
  } else {
    edits = { addFeatures: [{ attributes, geometry }] };
  }

  try {
    const result = await layer.applyEdits(edits);
    const r = (result.addFeatureResults?.[0] || result.updateFeatureResults?.[0]);
    if (r?.error) throw r.error;
    toast(selectedFeature ? "Feature updated." : "Feature added.");
    if (!selectedFeature) {
      // Load the newly added feature for convenience
      const oid = r.objectId;
      const q = await layer.queryFeatures({ objectIds: [oid], returnGeometry: true, outFields: ["*"] });
      if (q.features.length) loadFeatureForEdit(q.features[0]);
    } else {
      // refresh view of the updated feature
      const q = await layer.queryFeatures({ objectIds: [selectedFeature.attributes[objectIdField]], returnGeometry: true, outFields: ["*"] });
      if (q.features.length) loadFeatureForEdit(q.features[0]);
    }
  } catch (e) {
    console.error(e);
    toast("Save failed. Check layer edit settings or sign-in.");
  }
}

async function onDelete() {
  if (!selectedFeature) return toast("Select a sale to delete.");
  if (!confirm("Delete this sale? This cannot be undone.")) return;
  try {
    const result = await layer.applyEdits({ deleteFeatures: [{ objectId: selectedFeature.attributes[objectIdField] }] });
    const r = result.deleteFeatureResults?.[0];
    if (r?.error) throw r.error;
    toast("Feature deleted.");
    clearForm();
    // Remove graphic point
    editLayer.removeAll();
    selectedFeature = null;
  } catch (e) {
    console.error(e);
    toast("Delete failed.");
  }
}

function clearForm() {
  $("#address").value = "";
  $("#dateStart").value = "";
  $("#dateEnd").value = "";
  $("#timeStartHour").value = "";
  $("#timeStartMin").value = "";
  $("#timeStartAmPm").value = "AM";
  $("#timeEndHour").value = "";
  $("#timeEndMin").value = "";
  $("#timeEndAmPm").value = "PM";
  $("#details").value = "";
  $("#descriptionRaw").value = "";
  $("#status").textContent = "Ready for a new sale. Click the map to place a point.";
  selectedFeature = null;
}

// Kick things off
init();
