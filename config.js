// config.js — Quick Fix for OAuth Redirect Issue
window.CONFIG = {
    // Use the working SessionTest CLIENT_ID and setup
    CLIENT_ID: "ic6BRtzVkEpNKVjS",

    // Try the original working portal first
    PORTAL: "https://www.arcgis.com/sharing/rest",

    // Backup: If above doesn't work, try your org portal
    // PORTAL: "https://cityofportland.maps.arcgis.com/sharing/rest",

    // Garage Sale Configuration
    LAYER_URL: "https://services3.arcgis.com/DAf01WuIltSLujAv/arcgis/rest/services/Garage_Sales/FeatureServer/0",
    CENTER: [-97.323, 27.876],
    ZOOM: 13,

    // Temporarily disable organization restrictions for testing
    ALLOWED_ORGANIZATIONS: ["*"], // Allow any organization for now
    ORGANIZATION_NAME: "Testing",

    // Feature settings
    REQUIRE_SIGN_IN: true,
    AUTO_COMPOSE_DESCRIPTION: true,
    MULTI_DAY_SALES: true,

    // Geocoding
    GEOCODING_SERVICE: "https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer
