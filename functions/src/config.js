/**
 * src/config.js
 * Application Configuration
 */

const { defineSecret } = require("firebase-functions/params");

// Define Secrets
const llmApiKey = defineSecret("LLM_APIKEY");
const imageGenApiKey = defineSecret("IMAGEGEN_APIKEY");

module.exports = {
    // Secrets
    secrets: {
        llmApiKey,
        imageGenApiKey,
    },

    // Model Configurations
    models: {
        diagnosis: "gemini-2.5-flash-preview-09-2025",
        imageGen: "gemini-2.5-flash-image",
    },

    // API Configurations
    api: {
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
        retryLimit: 3,
    },

    // CORS Settings
    cors: {
        origin: true,
        methods: ["POST", "GET", "OPTIONS"],
    },
};
