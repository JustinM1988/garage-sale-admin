// config.js — ArcGIS OAuth2 PKCE Configuration
window.CONFIG = {
    // OAuth Configuration (from working SessionTest)
    CLIENT_ID: "ic6BRtzVkEpNKVjS",
    PORTAL: "https://www.arcgis.com/sharing/rest",

    // Garage Sale Admin Configuration
    LAYER_URL: "https://services3.arcgis.com/DAf01WuIltSLujAv/arcgis/rest/services/Garage_Sales/FeatureServer/0",
    PORTAL_URL: "https://cityofportland.maps.arcgis.com",
    CENTER: [-97.323, 27.876],
    ZOOM: 13,

    // Enhanced settings
    REQUIRE_SIGN_IN: true,
    ARCGIS_API_KEY: null  // Set if you have an API key
};
