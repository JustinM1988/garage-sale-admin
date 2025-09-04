// app.js — Enhanced Garage Sale Admin with Leaflet, Multi-day Sales, and Organization Auth
// v5.0 — Leaflet-based with comprehensive features

/* ================ Configuration ================ */
const CONFIG = window.CONFIG;
const FIELDS = { 
    address: "Address", 
    description: "Description", 
    start: "Date_1", 
    end: "EndDate" 
};

/* ================ Global State ================ */
let map, featureLayer, editMarker, auth;
let selectedFeature = null, objectIdField = "OBJECTID";
let inNewMode = false, _featureCount = 0;
let multiDayData = [];

/* ================ Utility Functions ================ */
const $ = (sel) => document.querySelector(sel);

function toast(msg, type = "info") {
    const el = document.createElement("div");
    el.className = `toast glass toast-${type}`;
    el.innerHTML = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
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
    return null;
}

function fromEpoch(ms) {
    if (!ms) return "";
    const d = new Date(ms);
    if (isNaN(d)) return "";
    const M = String(d.getMonth()+1).padStart(2,"0");
    const D = String(d.getDate()).padStart(2,"0");
    const Y = d.getFullYear();
    return `${Y}-${M}-${D}`;
}

// Auto-compose description function
function composeDescription() {
    const details = $("#details")?.value?.trim() || "";

    if ($("#chkMultiDay")?.checked && multiDayData.length > 0) {
        // Multi-day format: "Friday 7:00 AM - 2:00 PM & Saturday 8:00 AM - 4:00 PM: Items"
        const dayStrings = multiDayData.map(day => {
            const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][day.dayOfWeek];
            const startTime = formatTime(day.startHour, day.startMin, day.startAmPm);
            const endTime = formatTime(day.endHour, day.endMin, day.endAmPm);
            return `${dayName} ${startTime} - ${endTime}`;
        });
        const timeStr = dayStrings.join(' & ');
        return details ? `${timeStr}: ${details}` : timeStr;
    } else {
        // Single day format: "7:00 AM - 4:00 PM: Items"
        const sH = parseInt($("#timeStartHour")?.value || "7");
        const sM = parseInt($("#timeStartMin")?.value || "0");
        const sAP = $("#timeStartAmPm")?.value || "AM";
        const eH = parseInt($("#timeEndHour")?.value || "2");
        const eM = parseInt($("#timeEndMin")?.value || "0");
        const eAP = $("#timeEndAmPm")?.value || "PM";

        const startTime = formatTime(sH, sM, sAP);
        const endTime = formatTime(eH, eM, eAP);
        const timeStr = `${startTime} - ${endTime}`;
        return details ? `${timeStr}: ${details}` : timeStr;
    }
}

function formatTime(hour, minute, ampm) {
    return `${hour}:${String(minute).padStart(2,"0")} ${ampm}`;
}

function updateDescriptionPreview() {
    const preview = $("#descriptionPreview");
    if (preview) {
        preview.value = composeDescription();
    }
}

/* ================ Authentication Integration ================ */
function initAuth() {
    auth = new ArcGISAuth(CONFIG);

    auth.on('onSignIn', (userInfo) => {
        console.log("User signed in:", userInfo);
        showMainApp(true, userInfo);
        toast(`Welcome, ${userInfo.fullName || userInfo.username}!`, "success");

        // Validate and load user profile
        auth.whoAmI().then(profile => {
            console.log("User profile validated:", profile);
        }).catch(err => {
            console.error("Profile validation failed:", err);
            toast(err.message, "error");
            auth.signOut();
        });
    });

    auth.on('onSignOut', () => {
        console.log("User signed out");
        showMainApp(false);
        toast("Signed out", "info");
        cancelEditing();
    });

    auth.on('onError', (error) => {
        console.error("Auth error:", error);
        toast(`Authentication error: ${error.message}`, "error");
        showMainApp(false);
    });

    // Set up button handlers
    $("#btnSignIn")?.addEventListener("click", () => auth.signIn());
    $("#btnSignInOverlay")?.addEventListener("click", () => auth.signIn());
    $("#btnSignOut")?.addEventListener("click", () => auth.signOut());

    // Check initial auth state
    if (auth.isSignedIn()) {
        const userInfo = auth.getUserInfo();
        showMainApp(true, userInfo);
        // Validate in background
        auth.whoAmI().catch(err => {
            console.error("Session validation failed:", err);
            auth.signOut();
        });
    } else {
        showMainApp(false);
    }
}

function showMainApp(isSignedIn, userInfo = null) {
    const signinOverlay = $("#signin-overlay");
    const mainContent = $("#main-content");
    const signedOutSection = $("#signed-out-section");
    const signedInSection = $("#signed-in-section");
    const appControls = $("#app-controls");

    if (isSignedIn && userInfo) {
        // Hide sign-in overlay, show main app
        signinOverlay.style.display = "none";
        mainContent.style.display = "grid";
        signedOutSection.style.display = "none";
        signedInSection.style.display = "flex";
        appControls.style.display = "flex";

        // Update user info
        $("#user-name").textContent = userInfo.fullName || userInfo.username;

        // Initialize map if not already done
        if (!map) {
            initMap();
        }
    } else {
        // Show sign-in overlay, hide main app
        signinOverlay.style.display = "flex";
        mainContent.style.display = "none";
        signedOutSection.style.display = "flex";
        signedInSection.style.display = "none";
        appControls.style.display = "none";
    }
}

/* ================ Leaflet Map Implementation ================ */
async function initMap() {
    console.log("Initializing Leaflet map...");

    try {
        // Create Leaflet map
        map = L.map('map').setView(CONFIG.CENTER, CONFIG.ZOOM);

        // Add OpenStreetMap base layer (reliable and free)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        // Custom icon for garage sales - bright circular design
        const garageSaleIcon = L.divIcon({
            className: 'garage-sale-icon',
            html: '<div class="garage-sale-marker">🏷️</div>',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });

        // Load and display garage sales from ArcGIS Feature Service
        await loadGarageSales(garageSaleIcon);

        // Set up map click handler for adding new sales
        map.on('click', onMapClick);

        // Set up coordinate display
        map.on('mousemove', (e) => {
            $("#coordinates").textContent = `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`;
        });

        console.log("Map initialized successfully");
        setStatus("Map loaded. Click 'New Sale' to add a garage sale.");

    } catch (error) {
        console.error("Map initialization error:", error);
        toast("Failed to initialize map: " + error.message, "error");
    }
}

async function loadGarageSales(icon) {
    try {
        const token = auth.getToken();
        const url = `${CONFIG.LAYER_URL}/query?where=1=1&outFields=*&returnGeometry=true&f=json${token ? '&token=' + token : ''}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message || "Failed to load garage sales");
        }

        // Create feature layer group
        if (featureLayer) {
            map.removeLayer(featureLayer);
        }
        featureLayer = L.layerGroup();

        // Add each garage sale as a marker
        data.features.forEach(feature => {
            const geom = feature.geometry;
            const attrs = feature.attributes;

            const marker = L.marker([geom.y, geom.x], { icon })
                .bindPopup(createPopupContent(attrs))
                .on('click', () => loadForEdit(feature));

            // Store feature data on marker
            marker.featureData = feature;
            featureLayer.addLayer(marker);
        });

        featureLayer.addTo(map);
        _featureCount = data.features.length;

        console.log(`Loaded ${_featureCount} garage sales`);

    } catch (error) {
        console.error("Error loading garage sales:", error);
        toast("Failed to load garage sales: " + error.message, "error");
    }
}

function createPopupContent(attributes) {
    const address = attributes[FIELDS.address] || "No address";
    const description = attributes[FIELDS.description] || "No description";
    const startDate = attributes[FIELDS.start] ? new Date(attributes[FIELDS.start]).toLocaleDateString() : "No date";

    return `
        <div class="popup-content">
            <h4>${address}</h4>
            <p><strong>When:</strong> ${startDate}</p>
            <p><strong>Details:</strong> ${description}</p>
            <button onclick="editSale(${attributes[objectIdField]})">Edit Sale</button>
        </div>
    `;
}

// Global function for popup buttons
window.editSale = function(objectId) {
    const marker = featureLayer.getLayers().find(layer => 
        layer.featureData.attributes[objectIdField] === objectId
    );
    if (marker) {
        loadForEdit(marker.featureData);
        map.closePopup();
    }
};

function onMapClick(e) {
    if (!inNewMode) {
        toast("Click 'New Sale' to add a garage sale at a location", "info");
        return;
    }

    // Place new sale at clicked location
    placeNewSale(e.latlng);
}

function placeNewSale(latlng) {
    // Remove previous edit marker
    if (editMarker) {
        map.removeLayer(editMarker);
    }

    // Create edit marker (green for new)
    editMarker = L.marker(latlng, {
        icon: L.divIcon({
            className: 'edit-marker',
            html: '<div class="edit-marker-icon new">📍</div>',
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        })
    }).addTo(map);

    // Focus address field and provide coordinates
    $("#address").focus();
    setStatus("Sale location placed. Fill out the form and click Save.");
    $("#coordinates").textContent = `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;

    // Try reverse geocoding for address
    reverseGeocode(latlng);
}

/* ================ Address Search & Geocoding ================ */
async function reverseGeocode(latlng) {
    try {
        const url = `${CONFIG.GEOCODING_SERVICE}/reverseGeocode?location=${latlng.lng},${latlng.lat}&f=json`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.address) {
            $("#address").value = data.address.Match_addr || data.address.LongLabel || "";
        }
    } catch (error) {
        console.log("Reverse geocoding failed:", error);
    }
}

async function geocodeAddress(address) {
    try {
        const url = `${CONFIG.GEOCODING_SERVICE}/findAddressCandidates?singleLine=${encodeURIComponent(address)}&f=json&maxLocations=1`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.candidates && data.candidates.length > 0) {
            const candidate = data.candidates[0];
            const latlng = [candidate.location.y, candidate.location.x];

            // Zoom to location
            map.setView(latlng, 16);

            // Add temporary marker
            if (window.searchMarker) {
                map.removeLayer(window.searchMarker);
            }
            window.searchMarker = L.marker(latlng, {
                icon: L.divIcon({
                    className: 'search-marker',
                    html: '<div class="search-marker-icon">🔍</div>',
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                })
            }).addTo(map);

            setTimeout(() => {
                if (window.searchMarker) {
                    map.removeLayer(window.searchMarker);
                    window.searchMarker = null;
                }
            }, 3000);

            toast(`Found: ${candidate.address}`, "success");
        } else {
            toast("Address not found", "warning");
        }
    } catch (error) {
        console.error("Geocoding error:", error);
        toast("Address search failed", "error");
    }
}

/* ================ Multi-Day Sale Management ================ */
function setupMultiDayFeature() {
    $("#chkMultiDay").addEventListener("change", (e) => {
        const isMultiDay = e.target.checked;
        $("#single-day-times").style.display = isMultiDay ? "none" : "block";
        $("#multi-day-times").style.display = isMultiDay ? "block" : "none";

        if (isMultiDay && multiDayData.length === 0) {
            // Initialize with two days
            addMultiDayRow();
            addMultiDayRow();
        }
        updateDescriptionPreview();
    });

    $("#btnAddDay").addEventListener("click", addMultiDayRow);
}

function addMultiDayRow() {
    const container = $("#multi-day-container");
    const index = multiDayData.length;

    const dayData = {
        dayOfWeek: index === 0 ? 5 : 6, // Default to Friday, Saturday
        startHour: 7,
        startMin: 0,
        startAmPm: "AM",
        endHour: 2,
        endMin: 0,
        endAmPm: "PM"
    };

    multiDayData.push(dayData);

    const dayRow = document.createElement("div");
    dayRow.className = "multi-day-row";
    dayRow.innerHTML = `
        <div class="day-selector">
            <select class="day-select" data-index="${index}">
                <option value="0">Sunday</option>
                <option value="1">Monday</option>
                <option value="2">Tuesday</option>
                <option value="3">Wednesday</option>
                <option value="4">Thursday</option>
                <option value="5" ${index === 0 ? 'selected' : ''}>Friday</option>
                <option value="6" ${index === 1 ? 'selected' : ''}>Saturday</option>
            </select>
        </div>
        <div class="time-row">
            <select class="time-hour" data-index="${index}" data-field="startHour">
                ${Array.from({length: 12}, (_, i) => 
                    `<option value="${i+1}" ${i+7 === dayData.startHour ? 'selected' : ''}>${i+1}</option>`
                ).join('')}
            </select>
            <span>:</span>
            <select class="time-min" data-index="${index}" data-field="startMin">
                <option value="0" selected>00</option>
                <option value="15">15</option>
                <option value="30">30</option>
                <option value="45">45</option>
            </select>
            <select class="time-ampm" data-index="${index}" data-field="startAmPm">
                <option value="AM" selected>AM</option>
                <option value="PM">PM</option>
            </select>
            <span>to</span>
            <select class="time-hour" data-index="${index}" data-field="endHour">
                ${Array.from({length: 12}, (_, i) => 
                    `<option value="${i+1}" ${i+2 === dayData.endHour ? 'selected' : ''}>${i+1}</option>`
                ).join('')}
            </select>
            <span>:</span>
            <select class="time-min" data-index="${index}" data-field="endMin">
                <option value="0" selected>00</option>
                <option value="15">15</option>
                <option value="30">30</option>
                <option value="45">45</option>
            </select>
            <select class="time-ampm" data-index="${index}" data-field="endAmPm">
                <option value="AM">AM</option>
                <option value="PM" selected>PM</option>
            </select>
        </div>
        <button class="btn-remove-day" data-index="${index}">×</button>
    `;

    container.appendChild(dayRow);

    // Add event listeners
    dayRow.querySelectorAll("select").forEach(select => {
        select.addEventListener("change", updateMultiDayData);
    });

    dayRow.querySelector(".btn-remove-day").addEventListener("click", (e) => {
        const idx = parseInt(e.target.dataset.index);
        removeMultiDayRow(idx);
    });

    updateDescriptionPreview();
}

function updateMultiDayData(e) {
    const index = parseInt(e.target.dataset.index);
    const field = e.target.dataset.field || "dayOfWeek";

    if (multiDayData[index]) {
        if (field === "dayOfWeek") {
            multiDayData[index].dayOfWeek = parseInt(e.target.value);
        } else {
            multiDayData[index][field] = e.target.classList.contains("time-hour") || 
                                        e.target.classList.contains("time-min") ? 
                                        parseInt(e.target.value) : e.target.value;
        }
    }
    updateDescriptionPreview();
}

function removeMultiDayRow(index) {
    multiDayData.splice(index, 1);
    $("#multi-day-container").innerHTML = "";
    multiDayData.forEach((_, i) => addMultiDayRowFromData(i));
    updateDescriptionPreview();
}

function addMultiDayRowFromData(index) {
    // Rebuild row from existing data - implementation would be similar to addMultiDayRow
    // but using existing data from multiDayData[index]
}

/* ================ Edit Mode Functions ================ */
function enterAddMode() {
    if (!auth.isSignedIn()) {
        toast("Please sign in to add garage sales.", "error");
        return;
    }

    inNewMode = true;
    $("#btnCancel").style.display = "inline-block";
    $("#modeChip").style.display = "block";

    if (editMarker) {
        map.removeLayer(editMarker);
    }

    setStatus("Click on the map where you want to place the garage sale.");
    $("#coordinates").textContent = "Click map to place garage sale";
}

function cancelEditing() {
    inNewMode = false;
    selectedFeature = null;
    $("#btnCancel").style.display = "none";
    $("#modeChip").style.display = "none";

    if (editMarker) {
        map.removeLayer(editMarker);
        editMarker = null;
    }

    // Clear form
    $("#address").value = "";
    $("#details").value = "";
    $("#dateStart").value = "";
    $("#dateEnd").value = "";
    $("#chkMultiDay").checked = false;
    $("#single-day-times").style.display = "block";
    $("#multi-day-times").style.display = "none";
    multiDayData = [];
    $("#multi-day-container").innerHTML = "";

    updateDescriptionPreview();
    setStatus("Click 'New Sale' to add a garage sale, or click existing sales to edit.");
}

function loadForEdit(feature) {
    if (!auth.isSignedIn()) {
        toast("Please sign in to edit garage sales.", "error");
        return;
    }

    selectedFeature = feature;
    inNewMode = false;
    $("#btnCancel").style.display = "inline-block";
    $("#modeChip").style.display = "none";

    const attrs = feature.attributes;
    const geom = feature.geometry;

    // Load form data
    $("#address").value = attrs[FIELDS.address] || "";
    $("#dateStart").value = fromEpoch(attrs[FIELDS.start]) || "";
    $("#dateEnd").value = fromEpoch(attrs[FIELDS.end]) || "";

    // Parse description to extract details and times
    const description = attrs[FIELDS.description] || "";
    parseDescriptionForEdit(description);

    // Place edit marker
    if (editMarker) {
        map.removeLayer(editMarker);
    }

    editMarker = L.marker([geom.y, geom.x], {
        icon: L.divIcon({
            className: 'edit-marker',
            html: '<div class="edit-marker-icon edit">✏️</div>',
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        })
    }).addTo(map);

    // Zoom to feature
    map.setView([geom.y, geom.x], 16);

    const address = attrs[FIELDS.address] || "Unknown location";
    setStatus(`Editing: ${address}. Make changes and click Save, or Cancel to exit.`);
}

function parseDescriptionForEdit(description) {
    // Try to parse the description to extract times and details
    // This is a simplified parser - you might want to make it more robust

    if (description.includes(' & ')) {
        // Multi-day format
        $("#chkMultiDay").checked = true;
        $("#single-day-times").style.display = "none";
        $("#multi-day-times").style.display = "block";

        // Parse multi-day description
        const parts = description.split(':');
        if (parts.length >= 2) {
            $("#details").value = parts.slice(1).join(':').trim();
        }

        // TODO: Parse individual day/time combinations
        // For now, just show default multi-day setup
        if (multiDayData.length === 0) {
            addMultiDayRow();
            addMultiDayRow();
        }
    } else {
        // Single day format
        $("#chkMultiDay").checked = false;
        $("#single-day-times").style.display = "block";
        $("#multi-day-times").style.display = "none";

        // Parse single day: "7:00 AM - 4:00 PM: Details"
        const match = description.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM):\s*(.+)/);
        if (match) {
            $("#timeStartHour").value = match[1];
            $("#timeStartMin").value = match[2];
            $("#timeStartAmPm").value = match[3];
            $("#timeEndHour").value = match[4];
            $("#timeEndMin").value = match[5];
            $("#timeEndAmPm").value = match[6];
            $("#details").value = match[7];
        }
    }

    updateDescriptionPreview();
}

/* ================ Save/Delete Operations ================ */
async function onSave() {
    if (!auth.isSignedIn()) {
        toast("Please sign in to save changes.", "error");
        return;
    }

    if (!editMarker) {
        toast("Please place a location on the map first.", "warning");
        return;
    }

    const address = $("#address").value.trim();
    const details = $("#details").value.trim();
    const startDate = $("#dateStart").value;

    if (!address) {
        toast("Address is required.", "warning");
        $("#address").focus();
        return;
    }

    if (!startDate) {
        toast("Start date is required.", "warning");
        $("#dateStart").focus();
        return;
    }

    const description = composeDescription();
    const latlng = editMarker.getLatLng();

    const attributes = {
        [FIELDS.address]: address,
        [FIELDS.description]: description,
        [FIELDS.start]: toEpochMaybe(startDate),
        [FIELDS.end]: toEpochMaybe($("#dateEnd").value)
    };

    const geometry = {
        x: latlng.lng,
        y: latlng.lat,
        spatialReference: { wkid: 4326 }
    };

    try {
        let edits;
        if (selectedFeature) {
            // Update existing feature
            attributes[objectIdField] = selectedFeature.attributes[objectIdField];
            edits = {
                updates: [{
                    attributes: attributes,
                    geometry: geometry
                }]
            };
        } else {
            // Add new feature
            edits = {
                adds: [{
                    attributes: attributes,
                    geometry: geometry
                }]
            };
        }

        const token = auth.getToken();
        const url = `${CONFIG.LAYER_URL}/applyEdits`;

        const formData = new FormData();
        formData.append('f', 'json');
        formData.append('token', token);
        if (edits.adds) formData.append('adds', JSON.stringify(edits.adds));
        if (edits.updates) formData.append('updates', JSON.stringify(edits.updates));

        const response = await fetch(url, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.error) {
            throw new Error(result.error.message || "Save operation failed");
        }

        const success = (result.addResults?.[0]?.success || result.updateResults?.[0]?.success);
        if (!success) {
            const error = result.addResults?.[0]?.error || result.updateResults?.[0]?.error;
            throw new Error(error?.description || "Save operation failed");
        }

        toast(selectedFeature ? "Garage sale updated!" : "Garage sale added!", "success");

        // Refresh the map
        await loadGarageSales(L.divIcon({
            className: 'garage-sale-icon',
            html: '<div class="garage-sale-marker">🏷️</div>',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        }));

        cancelEditing();

    } catch (error) {
        console.error("Save error:", error);
        toast(`Save failed: ${error.message}`, "error");
    }
}

async function onDelete() {
    if (!auth.isSignedIn()) {
        toast("Please sign in to delete garage sales.", "error");
        return;
    }

    if (!selectedFeature) {
        toast("Please select a garage sale to delete.", "warning");
        return;
    }

    const address = selectedFeature.attributes[FIELDS.address] || "this garage sale";
    if (!confirm(`Are you sure you want to delete "${address}"?`)) {
        return;
    }

    try {
        const token = auth.getToken();
        const url = `${CONFIG.LAYER_URL}/deleteFeatures`;

        const formData = new FormData();
        formData.append('f', 'json');
        formData.append('token', token);
        formData.append('objectIds', selectedFeature.attributes[objectIdField]);

        const response = await fetch(url, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.error || !result.deleteResults?.[0]?.success) {
            const error = result.error || result.deleteResults?.[0]?.error;
            throw new Error(error?.description || error?.message || "Delete failed");
        }

        toast("Garage sale deleted.", "success");

        // Refresh the map
        await loadGarageSales(L.divIcon({
            className: 'garage-sale-icon',
            html: '<div class="garage-sale-marker">🏷️</div>',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        }));

        cancelEditing();

    } catch (error) {
        console.error("Delete error:", error);
        toast(`Delete failed: ${error.message}`, "error");
    }
}

/* ================ Filter Functions ================ */
function applyQuickFilter(kind) {
    // This would filter the displayed markers based on date criteria
    // Implementation depends on how you want to handle client-side filtering
    console.log("Applying filter:", kind);
    toast(`Filter applied: ${kind}`, "info");
}

/* ================ Theme Functions ================ */
function cycleTheme() {
    const themes = ["dark", "dim", "light"];
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    const currentIndex = themes.indexOf(current);
    const next = themes[(currentIndex + 1) % themes.length];

    document.documentElement.setAttribute("data-theme", next);
    toast(`Theme: ${next}`, "info");
}

/* ================ Modal Functions ================ */
async function showSalesList() {
    toast("Loading garage sales list...", "info");
    // Implementation for showing all sales in a modal
}

function showGuide() {
    const content = document.createElement("div");
    content.innerHTML = `
        <h3>🏷️ Garage Sale Manager Guide</h3>
        <ol>
            <li><strong>Sign In:</strong> Use your City of Portland ArcGIS account</li>
            <li><strong>Add Sale:</strong> Click "New Sale", then click map location</li>
            <li><strong>Address Search:</strong> Use search box to find and zoom to addresses</li>
            <li><strong>Single Day:</strong> Set start/end times normally</li>
            <li><strong>Multi-Day:</strong> Check "Multi-day sale" for different times per day</li>
            <li><strong>Edit:</strong> Click existing sale markers on map</li>
            <li><strong>Description:</strong> Auto-generated from times and items</li>
        </ol>
        <p><em>Only City of Portland employees can access this application.</em></p>
    `;

    showModal("User Guide", content);
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
}

/* ================ Initialization ================ */
async function init() {
    console.log("Enhanced Garage Sale Admin v5.0 starting...");

    try {
        // Initialize authentication first
        initAuth();

        // Set up form handlers
        setupMultiDayFeature();

        // Auto-update description preview
        ["timeStartHour", "timeStartMin", "timeStartAmPm", "timeEndHour", "timeEndMin", "timeEndAmPm", "details"]
            .forEach(id => {
                const el = $(id);
                if (el) el.addEventListener("change", updateDescriptionPreview);
            });

        // Button handlers
        $("#btnSave")?.addEventListener("click", onSave);
        $("#btnNew")?.addEventListener("click", enterAddMode);
        $("#btnCancel")?.addEventListener("click", cancelEditing);
        $("#btnDelete")?.addEventListener("click", onDelete);
        $("#btnTheme")?.addEventListener("click", cycleTheme);
        $("#btnSales")?.addEventListener("click", showSalesList);
        $("#btnGuide")?.addEventListener("click", showGuide);
        $("#selFilter")?.addEventListener("change", (e) => applyQuickFilter(e.target.value));

        // Address search
        $("#btnSearch")?.addEventListener("click", () => {
            const address = $("#addressSearch").value.trim();
            if (address) {
                geocodeAddress(address);
            }
        });

        $("#addressSearch")?.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                const address = e.target.value.trim();
                if (address) {
                    geocodeAddress(address);
                }
            }
        });

        // Initial state
        updateDescriptionPreview();

        console.log("Application initialized successfully");

    } catch (error) {
        console.error("Initialization error:", error);
        toast(`Initialization failed: ${error.message}`, "error");
    }
}

// Start the application when DOM is ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
