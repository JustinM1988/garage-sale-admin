// app.js — Enhanced Garage Sale Admin with OAuth2 PKCE Authentication
// v4.0 — Integrated with SessionTest OAuth, enhanced security and features

import esriConfig from "https://js.arcgis.com/4.29/@arcgis/core/config.js";
import Map from "https://js.arcgis.com/4.29/@arcgis/core/Map.js";
import MapView from "https://js.arcgis.com/4.29/@arcgis/core/views/MapView.js";
import FeatureLayer from "https://js.arcgis.com/4.29/@arcgis/core/layers/FeatureLayer.js";
import GraphicsLayer from "https://js.arcgis.com/4.29/@arcgis/core/layers/GraphicsLayer.js";
import Graphic from "https://js.arcgis.com/4.29/@arcgis/core/Graphic.js";
import Search from "https://js.arcgis.com/4.29/@arcgis/core/widgets/Search.js";

/* ================ Configuration ================ */
const CONFIG = window.CONFIG;

// Layer fields
const FIELDS = { 
    address: "Address", 
    description: "Description", 
    start: "Date_1", 
    end: "EndDate" 
};

/* ================ Global State ================ */
let map, view, layer, editLayer, ghostLayer, ghostGraphic, search, auth;
let selectedFeature = null, objectIdField = "OBJECTID";
let inNewMode = false, _featureCount = 0;

/* ================ Utility Functions ================ */
const $ = (sel) => document.querySelector(sel);

function toast(msg) {
    const el = document.createElement("div");
    el.className = "toast glass";
    el.innerHTML = `${msg}`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

function setStatus(t) { 
    const el = $("#status"); 
    if (el) el.textContent = t; 
}

function toEpochMaybe(v) {
    if (v == null || v === "") return null;
    if (typeof v === "number") return v;
    const d1 = new Date(v); 
    if (!isNaN(d1)) return d1.getTime();
    const m = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) { 
        const d = new Date(+m[3], +m[1]-1, +m[2]); 
        if (!isNaN(d)) return d.getTime(); 
    }
    return null;
}

function fromEpoch(ms) {
    if (!ms) return "";
    const d = (typeof ms === "number") ? new Date(ms) : new Date(String(ms));
    if (isNaN(d)) return "";
    const M = String(d.getMonth()+1).padStart(2,"0");
    const D = String(d.getDate()).padStart(2,"0");
    const Y = d.getFullYear();
    return `${Y}-${M}-${D}`;
}

function cleanInt(v, min, max) { 
    const n = parseInt(v, 10); 
    if (isNaN(n)) return null; 
    return Math.max(min, Math.min(max, n)); 
}

function composeDescription() {
    const fmt = (h,m,ap) => `${h}:${String(m).padStart(2,"0")} ${ap}`;
    const sH = cleanInt($("#timeStartHour")?.value, 1, 12) ?? 9;
    const sM = cleanInt($("#timeStartMin")?.value, 0, 59) ?? 0;
    const sAP = $("#timeStartAmPm")?.value ?? "AM";
    const eH = cleanInt($("#timeEndHour")?.value, 1, 12) ?? 2;
    const eM = cleanInt($("#timeEndMin")?.value, 0, 59) ?? 0;
    const eAP = $("#timeEndAmPm")?.value ?? "PM";
    const details = $("#details")?.value?.trim() ?? "";
    const time = `${fmt(sH,sM,sAP)} - ${fmt(eH,eM,eAP)}`;
    return details ? `${time}: ${details}` : time;
}

function syncDesc() { 
    if ($("#chkCompose")?.checked) $("#descriptionRaw").value = composeDescription(); 
}

function houseSvg(fill = "#ff4aa2", stroke = "#fff") {
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
            <path fill="${fill}" stroke="${stroke}" stroke-width="1.5" 
                  d="M12 2.69l8 6.4V22H4V9.09l8-6.4z M12 5.31L6 9.91V20h12V9.91l-6-4.6z"/>
            <rect x="9" y="12" width="6" height="8" fill="${stroke}"/>
        </svg>`;
    return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

function sqlTs(d) { 
    const pad = (n) => String(n).padStart(2,"0");
    const s = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    return `TIMESTAMP '${s}'`;
}

/* ================ Authentication Integration ================ */
function initAuth() {
    auth = new ArcGISAuth(CONFIG);

    // Set up event handlers
    auth.on('onSignIn', (userInfo) => {
        console.log("User signed in:", userInfo);
        updateAuthUI(true, userInfo);
        toast("Signed in successfully!");
        enableEditingFeatures(true);
    });

    auth.on('onSignOut', () => {
        console.log("User signed out");
        updateAuthUI(false);
        toast("Signed out");
        enableEditingFeatures(false);
        cancelEditing();
    });

    auth.on('onError', (error) => {
        console.error("Auth error:", error);
        toast("Authentication error: " + error.message);
        updateAuthUI(false);
    });

    // Set up button handlers
    $("#btnSignIn")?.addEventListener("click", () => {
        auth.signIn().catch(err => console.error("Sign-in error:", err));
    });

    $("#btnSignOut")?.addEventListener("click", () => {
        auth.signOut();
    });

    // Check initial auth state
    updateAuthUI(auth.isSignedIn(), auth.getUserInfo());
    enableEditingFeatures(auth.isSignedIn());
}

function updateAuthUI(signedIn, userInfo = null) {
    const signInBtn = $("#btnSignIn");
    const signOutBtn = $("#btnSignOut");
    const userInfoEl = $("#user-info");
    const authMessage = $("#auth-message");

    if (signedIn && userInfo) {
        signInBtn.style.display = "none";
        signOutBtn.style.display = "inline-block";
        userInfoEl.style.display = "inline-block";
        userInfoEl.textContent = userInfo.fullName || userInfo.username || "User";
        authMessage.textContent = `Signed in as ${userInfo.fullName || userInfo.username}. You can now add and edit garage sales.`;
    } else {
        signInBtn.style.display = "inline-block";
        signOutBtn.style.display = "none";
        userInfoEl.style.display = "none";
        authMessage.textContent = "Sign in with your ArcGIS account to add and edit garage sales.";
    }
}

function enableEditingFeatures(enabled) {
    const editingElements = ["#btnNew", "#btnSave", "#btnDelete"];
    editingElements.forEach(sel => {
        const el = $(sel);
        if (el) {
            el.disabled = !enabled;
            el.style.opacity = enabled ? "1" : "0.5";
        }
    });
}

/* ================ Map and Layer Management ================ */
async function initMap() {
    // Configure ArcGIS
    if (CONFIG.ARCGIS_API_KEY) {
        esriConfig.apiKey = CONFIG.ARCGIS_API_KEY;
        map = new Map({ basemap: "arcgis-dark-gray" });
    } else {
        map = new Map({ basemap: "osm" });
    }

    // Create map view
    view = new MapView({
        container: "map",
        map: map,
        center: CONFIG.CENTER,
        zoom: CONFIG.ZOOM
    });

    await view.when();
    console.log("MapView ready");

    // Create feature layer
    layer = new FeatureLayer({
        url: CONFIG.LAYER_URL,
        outFields: ["*"],
        popupEnabled: false
    });

    layer.renderer = {
        type: "simple",
        symbol: {
            type: "picture-marker",
            url: houseSvg("#ff4aa2", "#ffffff"),
            width: "24px",
            height: "24px",
            yoffset: 8
        }
    };

    map.add(layer);

    try {
        await layer.load();
        objectIdField = layer.objectIdField;
        console.log(`Layer loaded, OID field: ${objectIdField}`);
        _featureCount = await layer.queryFeatureCount({ where: "1=1" });
    } catch (e) {
        console.error("Layer load error:", e);
        toast("Failed to load garage sales layer");
    }

    // Create editing layers
    editLayer = new GraphicsLayer();
    ghostLayer = new GraphicsLayer();
    map.add(editLayer);
    map.add(ghostLayer);

    // Add search widget
    search = new Search({ view });
    view.ui.add(search, "top-right");

    // Set up map interactions
    setupMapInteractions();
}

function setupMapInteractions() {
    // Ghost pin while in New mode
    let lastMove = 0;
    view.on("pointer-move", (e) => {
        if (!inNewMode) return;
        const now = performance.now();
        if (now - lastMove < 250) return;
        lastMove = now;

        const mp = view.toMap({ x: e.x, y: e.y });
        if (!mp) return;

        if (!ghostGraphic) {
            ghostGraphic = new Graphic({
                geometry: mp,
                symbol: { 
                    type: "simple-marker", 
                    size: 14, 
                    color: [60, 240, 212, 0.9], 
                    outline: { color: [12, 26, 44, 1], width: 1 } 
                }
            });
            ghostLayer.add(ghostGraphic);
        } else {
            ghostGraphic.geometry = mp;
        }

        // Update coordinates display
        $("#coordinates").textContent = `Lon: ${mp.longitude.toFixed(5)} • Lat: ${mp.latitude.toFixed(5)}`;
    });

    // Map click handler
    view.on("click", async (ev) => {
        if (!inNewMode) {
            const ht = await view.hitTest(ev);
            const g = ht.results.find(r => r.graphic?.layer === layer)?.graphic;
            if (g) {
                loadForEdit(g);
            } else {
                toast("Click New to add a sale.");
            }
            return;
        }
        finalizePlacement(ev.mapPoint);
    });

    // Update coordinates on center/zoom change
    let lastT = 0;
    view.watch(["center", "zoom"], () => {
        const now = performance.now();
        if (now - lastT < 400) return;
        lastT = now;

        const c = view.center;
        if (!inNewMode) {
            $("#coordinates").textContent = `Lon: ${c.longitude.toFixed(5)} • Lat: ${c.latitude.toFixed(5)} | Zoom: ${view.zoom}`;
        }
    });
}

/* ================ Edit Mode Functions ================ */
function enterAddMode() {
    if (!auth.isSignedIn()) {
        toast("Please sign in to add garage sales.");
        return;
    }

    inNewMode = true;
    $("#btnCancel") && ($("#btnCancel").style.display = "inline-block");
    $("#modeChip") && ($("#modeChip").style.display = "inline-block");
    editLayer.removeAll();
    ghostLayer.removeAll();
    ghostGraphic = null;
    setStatus("Add mode — move the cursor and click to place the sale.");
}

function finalizePlacement(mp) {
    if (!mp) return;
    placePoint(mp.longitude, mp.latitude);
    ghostLayer.removeAll();
    ghostGraphic = null;
    $("#address")?.focus();
    setStatus("Point placed — fill the form and Save, or Cancel.");
}

function cancelEditing() {
    inNewMode = false;
    selectedFeature = null;
    $("#btnCancel") && ($("#btnCancel").style.display = "none");
    $("#modeChip") && ($("#modeChip").style.display = "none");
    ghostLayer.removeAll();
    ghostGraphic = null;
    editLayer.removeAll();

    // Clear form
    $("#address").value = "";
    $("#descriptionRaw").value = "";
    $("#dateStart").value = "";
    $("#dateEnd").value = "";
    $("#details").value = "";

    setStatus("Exited editing. Click a sale to edit, or click New to add.");
}

function placePoint(lon, lat) {
    editLayer.removeAll();
    editLayer.add(new Graphic({
        geometry: { type: "point", longitude: lon, latitude: lat },
        symbol: {
            type: "picture-marker",
            url: houseSvg("#3cf0d4", "#0b1118"),
            width: "32px",
            height: "32px"
        }
    }));
}

function loadForEdit(g) {
    if (!auth.isSignedIn()) {
        toast("Please sign in to edit garage sales.");
        return;
    }

    selectedFeature = g;
    inNewMode = false;
    $("#btnCancel") && ($("#btnCancel").style.display = "inline-block");
    $("#modeChip") && ($("#modeChip").style.display = "none");

    const a = g.attributes || {};
    $("#address").value = a[FIELDS.address] ?? "";
    $("#descriptionRaw").value = a[FIELDS.description] ?? "";
    $("#dateStart").value = fromEpoch(a[FIELDS.start]) || "";
    $("#dateEnd").value = fromEpoch(a[FIELDS.end]) || "";

    parseTimeFromDescription($("#descriptionRaw").value || "");
    placePoint(g.geometry.longitude, g.geometry.latitude);

    const label = [a[FIELDS.address], fromEpoch(a[FIELDS.start])].filter(Boolean).join(" — ");
    setStatus(`Editing: ${label}. Use Cancel to exit without saving.`);
}

function parseTimeFromDescription(text) {
    const m = text.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*[-–]\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!m) return;
    $("#timeStartHour").value = m[1];
    $("#timeStartMin").value = m[2];
    $("#timeStartAmPm").value = m[3].toUpperCase();
    $("#timeEndHour").value = m[4];
    $("#timeEndMin").value = m[5];
    $("#timeEndAmPm").value = m[6].toUpperCase();
    syncDesc();
}

/* ================ Save/Delete Operations ================ */
function attributesFromForm() {
    syncDesc();
    return {
        [FIELDS.address]: $("#address").value.trim() || null,
        [FIELDS.description]: $("#descriptionRaw").value.trim() || null,
        [FIELDS.start]: toEpochMaybe($("#dateStart").value),
        [FIELDS.end]: toEpochMaybe($("#dateEnd").value)
    };
}

async function onSave() {
    if (!auth.isSignedIn()) {
        toast("Please sign in to save.");
        return;
    }

    if (editLayer.graphics.length === 0) {
        return toast("Click New, then click the map to place a point.");
    }

    const geom = editLayer.graphics.getItemAt(0).geometry;
    const attrs = attributesFromForm();

    if (!attrs[FIELDS.address]) return toast("Address is required.");
    if (!attrs[FIELDS.description]) return toast("Description is required.");
    if (!attrs[FIELDS.start]) return toast("Start date is required.");

    let edits;
    if (selectedFeature) {
        attrs[layer.objectIdField] = selectedFeature.attributes[layer.objectIdField];
        edits = { updateFeatures: [{ attributes: attrs, geometry: geom }] };
    } else {
        edits = { addFeatures: [{ attributes: attrs, geometry: geom }] };
    }

    try {
        // Add authentication header if available
        const token = auth.getToken();
        if (token) {
            layer.apiKey = null; // Use token instead of API key
        }

        const result = await layer.applyEdits(edits);
        const r = (result.addFeatureResults?.[0] || result.updateFeatureResults?.[0]);

        if (r?.error) throw r.error;

        const oid = r.objectId || (selectedFeature?.attributes?.[layer.objectIdField]);
        const q = await layer.queryFeatures({ 
            objectIds: [oid], 
            returnGeometry: true, 
            outFields: ["*"] 
        });

        if (q.features.length) loadForEdit(q.features[0]);

        _featureCount = await layer.queryFeatureCount({ where: "1=1" });
        toast(selectedFeature ? "Sale updated." : "Sale added.");

        inNewMode = false;
        $("#btnCancel")?.style && ($("#btnCancel").style.display = "none");
        $("#modeChip")?.style && ($("#modeChip").style.display = "none");

    } catch (e) {
        console.error(e);
        if (e.message?.includes("401") || e.message?.includes("unauthorized")) {
            toast("Authentication expired. Please sign in again.");
            auth.signOut();
        } else {
            toast("Save failed. Check your permissions and try again.");
        }
    }
}

async function onDelete() {
    if (!auth.isSignedIn()) {
        toast("Please sign in to delete.");
        return;
    }

    if (!selectedFeature) return toast("Select a sale first.");

    if (!confirm("Are you sure you want to delete this garage sale?")) {
        return;
    }

    try {
        const token = auth.getToken();
        if (token) {
            layer.apiKey = null; // Use token instead of API key
        }

        const r = await layer.applyEdits({ 
            deleteFeatures: [{ objectId: selectedFeature.attributes[layer.objectIdField] }] 
        });

        if (r.deleteFeatureResults?.[0]?.error) throw r.deleteFeatureResults[0].error;

        editLayer.removeAll();
        selectedFeature = null;
        $("#address").value = "";
        $("#descriptionRaw").value = "";
        $("#dateStart").value = "";
        $("#dateEnd").value = "";
        $("#details").value = "";

        _featureCount = await layer.queryFeatureCount({ where: "1=1" });
        toast("Deleted.");

    } catch (e) {
        console.error(e);
        if (e.message?.includes("401") || e.message?.includes("unauthorized")) {
            toast("Authentication expired. Please sign in again.");
            auth.signOut();
        } else {
            toast("Delete failed. Check your permissions and try again.");
        }
    }
}

/* ================ Filter Functions ================ */
function applyQuickFilter(kind) {
    const now = new Date();
    let start = null, end = null, label = "all";

    if (kind === "weekend") {
        const d = new Date(now);
        const dow = d.getDay();
        const add = (6 - dow + 7) % 7;
        const sat = new Date(d.getFullYear(), d.getMonth(), d.getDate() + add, 0, 0, 0);
        const sun = new Date(sat.getFullYear(), sat.getMonth(), sat.getDate() + 1, 23, 59, 59);
        start = sat; end = sun; label = "weekend";
    } else if (kind === "next14") {
        start = now; 
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14, 23, 59, 59); 
        label = "next14";
    } else if (kind === "past") {
        start = null; end = now; label = "past";
    }

    let where = "1=1";
    if (label === "weekend" || label === "next14") {
        const ts1 = sqlTs(start), ts2 = sqlTs(end);
        where = `(${FIELDS.start} <= ${ts2}) AND (${FIELDS.end} IS NULL OR ${FIELDS.end} >= ${ts1})`;
    } else if (label === "past") {
        const ts = sqlTs(end);
        where = `${FIELDS.end} < ${ts}`;
    }

    layer.definitionExpression = where;
    console.log(`Filter applied: ${label}`);
}

/* ================ Theme Functions ================ */
function cycleTheme() {
    const order = ["dark", "dim", "light"];
    const cur = document.documentElement.getAttribute("data-theme") || "dark";
    const idx = order.indexOf(cur);
    const next = order[(idx + 1) % order.length];
    document.documentElement.setAttribute("data-theme", next);
    toast(`Theme: ${next}`);
}

/* ================ Modal Functions ================ */
async function showSalesList() {
    try {
        const q = await layer.queryFeatures({
            where: layer.definitionExpression || "1=1",
            outFields: ["*"],
            orderByFields: [FIELDS.start + " DESC"],
            returnGeometry: true,
            num: 200
        });

        const rows = q.features.map(f => {
            const a = f.attributes;
            const title = a[FIELDS.address] || "(no address)";
            const sub = [fromEpoch(a[FIELDS.start]), fromEpoch(a[FIELDS.end])].filter(Boolean).join(" → ");
            return { oid: a[layer.objectIdField], title, sub, feature: f };
        });

        const body = document.createElement("div");
        body.className = "list";
        body.innerHTML = rows.length ? rows.map(r => `
            <div class="list-row">
                <div class="meta">
                    <div class="title">${r.title.replace(/</g, '&lt;')}</div>
                    <div>${r.sub}</div>
                </div>
                <div style="display:flex;gap:8px;">
                    <button class="btn btn-secondary btn-edit" data-oid="${r.oid}">Edit</button>
                    <button class="btn btn-danger btn-del" data-oid="${r.oid}">Delete</button>
                </div>
            </div>
        `).join("") : "<p>No sales found.</p>";

        showModal("Garage Sales", body);

        // Add event handlers
        body.querySelectorAll(".btn-edit").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                const oid = +btn.dataset.oid;
                const f = rows.find(r => r.oid === oid)?.feature;
                closeModal();
                if (f) {
                    loadForEdit(f);
                    view.goTo(f.geometry).catch(() => {});
                }
            });
        });

        body.querySelectorAll(".btn-del").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                e.preventDefault();
                const oid = +btn.dataset.oid;
                const f = rows.find(r => r.oid === oid)?.feature;
                closeModal();
                if (f) {
                    selectedFeature = f;
                    await onDelete();
                }
            });
        });

    } catch (e) {
        console.error(e);
        toast("Couldn't load list.");
    }
}

function showGuide() {
    const content = document.createElement("div");
    content.innerHTML = `
        <ol>
            <li><strong>Sign in:</strong> Click "Sign In" and authenticate with your ArcGIS account.</li>
            <li><strong>Add a sale:</strong> Click <em>New</em>. A ghost pin follows your cursor — click to place. Fill the form, then <em>Save</em>. Use <em>Cancel</em> to exit.</li>
            <li><strong>Edit a sale:</strong> Click a point on the map or open <em>Sales</em> → <em>Edit</em>.</li>
            <li><strong>Delete:</strong> Select a sale, then <em>Delete</em>.</li>
            <li><strong>Description:</strong> Auto-composed from time + details; uncheck to type your own.</li>
            <li><strong>Filters:</strong> Use the dropdown to show sales by time period.</li>
        </ol>
        <p><strong>Note:</strong> You must be signed in to add, edit, or delete garage sales.</p>
    `;

    showModal("Quick Guide", content);
}

function showModal(title, bodyElement) {
    const wrap = document.createElement("div");
    wrap.className = "modal-backdrop";
    wrap.innerHTML = `
        <div class="modal glass">
            <div class="modal-header">
                <div class="modal-title">${title}</div>
                <button class="modal-close">✕</button>
            </div>
            <div class="modal-body"></div>
            <div class="modal-actions">
                <button class="btn btn-secondary">Close</button>
            </div>
        </div>
    `;

    wrap.querySelector(".modal-body").appendChild(bodyElement);
    document.body.appendChild(wrap);

    const closeModal = () => wrap.remove();
    wrap.querySelector(".modal-close").addEventListener("click", closeModal);
    wrap.querySelector(".modal-actions .btn").addEventListener("click", closeModal);

    const esc = (e) => {
        if (e.key === "Escape") {
            closeModal();
            window.removeEventListener("keydown", esc);
        }
    };
    window.addEventListener("keydown", esc);

    // Return close function for external use
    window.closeModal = closeModal;
}

/* ================ Initialization ================ */
async function init() {
    console.log("Garage Sale Admin v4.0 starting...");

    try {
        // Initialize authentication
        initAuth();

        // Initialize map
        await initMap();

        // Set up form event handlers
        ["timeStartHour", "timeStartMin", "timeStartAmPm", "timeEndHour", "timeEndMin", "timeEndAmPm", "details", "chkCompose"]
            .forEach(id => $(id)?.addEventListener("input", syncDesc));
        syncDesc();

        // Set up button handlers
        $("#btnSave")?.addEventListener("click", onSave);
        $("#btnNew")?.addEventListener("click", enterAddMode);
        $("#btnCancel")?.addEventListener("click", cancelEditing);
        $("#btnDelete")?.addEventListener("click", onDelete);
        $("#btnTheme")?.addEventListener("click", cycleTheme);
        $("#btnSales")?.addEventListener("click", showSalesList);
        $("#btnGuide")?.addEventListener("click", showGuide);
        $("#selFilter")?.addEventListener("change", (e) => applyQuickFilter(e.target.value));

        setStatus("Application ready. Sign in to add and edit garage sales.");

    } catch (error) {
        console.error("Initialization error:", error);
        toast("Failed to initialize application: " + error.message);
    }
}

// Start the application
init();
