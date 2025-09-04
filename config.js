// config.js — CORRECTED with proper Client ID
window.CONFIG = {
    // CORRECT OAuth Configuration for garage-sale-admin
    CLIENT_ID: "VfADq37Q7WauhFsg",  // ← THIS is your correct Client ID
    PORTAL: "https://www.arcgis.com/sharing/rest",

    // Garage Sale Configuration  
    LAYER_URL: "https://services3.arcgis.com/DAf01WuIltSLujAv/arcgis/rest/services/Garage_Sales/FeatureServer/0",
    CENTER: [-97.323, 27.876],
    ZOOM: 13,

    // Organization Restrictions 
    ALLOWED_ORGANIZATIONS: ["cityofportland.maps.arcgis.com"],
    ORGANIZATION_NAME: "City of Portland",

    // Feature Toggles
    REQUIRE_SIGN_IN: true,
    AUTO_COMPOSE_DESCRIPTION: true,
    MULTI_DAY_SALES: true,

    // Geocoding
    GEOCODING_SERVICE: "https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer"
};

console.log("✅ CONFIG loaded with correct Client ID:", window.CONFIG.CLIENT_ID);
