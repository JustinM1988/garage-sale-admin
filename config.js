// config.js — Enhanced Configuration with Organization Restrictions
window.CONFIG = {
    // OAuth Configuration - City of Portland Organization
    CLIENT_ID: "ic6BRtzVkEpNKVjS",
    PORTAL: "https://cityofportland.maps.arcgis.com/sharing/rest",  // Organization specific

    // Garage Sale Configuration
    LAYER_URL: "https://services3.arcgis.com/DAf01WuIltSLujAv/arcgis/rest/services/Garage_Sales/FeatureServer/0",
    CENTER: [-97.323, 27.876],
    ZOOM: 13,

    // Organization Restrictions
    ALLOWED_ORGANIZATIONS: ["cityofportland.maps.arcgis.com"],
    ORGANIZATION_NAME: "City of Portland",

    // Feature Toggles
    REQUIRE_SIGN_IN: true,
    AUTO_COMPOSE_DESCRIPTION: true,  // Always auto-compose
    MULTI_DAY_SALES: true,          // Enable multi-day feature

    // Geocoding
    GEOCODING_SERVICE: "https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer",
};
