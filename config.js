// config.js — Fixed Configuration with Error Handling
(function() {
    // Ensure global CONFIG object exists
    window.CONFIG = window.CONFIG || {};

    // Enhanced Configuration
    window.CONFIG = {
        // OAuth Configuration - Working SessionTest settings
        CLIENT_ID: "ic6BRtzVkEpNKVjS",
        PORTAL: "https://www.arcgis.com/sharing/rest",

        // Garage Sale Configuration  
        LAYER_URL: "https://services3.arcgis.com/DAf01WuIltSLujAv/arcgis/rest/services/Garage_Sales/FeatureServer/0",
        CENTER: [-97.323, 27.876],
        ZOOM: 13,

        // Organization Restrictions (temporarily relaxed for testing)
        ALLOWED_ORGANIZATIONS: ["*"], // Allow any org for now
        ORGANIZATION_NAME: "City of Portland",

        // Feature Toggles
        REQUIRE_SIGN_IN: true,
        AUTO_COMPOSE_DESCRIPTION: true,
        MULTI_DAY_SALES: true,

        // Geocoding
        GEOCODING_SERVICE: "https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer"
    };

    // Debug logging
    console.log("CONFIG loaded successfully:", window.CONFIG);

    // Dispatch event to notify other scripts that CONFIG is ready
    if (typeof document !== 'undefined') {
        document.dispatchEvent(new Event('configReady'));
    }
})();
