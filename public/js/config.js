// /public/js/config.js
// ── THE ONLY FRONTEND FILE YOU EDIT ─────────────────────────
// DEMO_MODE: true  → no sign-in, mock data, works by opening the
//                    HTML files directly. Use to test the UI.
// DEMO_MODE: false → real MSAL sign-in + live API.

window.DealSheetConfig = {
  DEMO_MODE: true,

  msal: {
    clientId: "<client-id>",                       // PropCMA app registration
    tenantId: "<tenant-id>",
    apiScope: "api://<client-id>/access_as_user",  // the scope you exposed
  },

  // Leave "" when the pages are served from the same Vercel project
  // as the /api functions (recommended).
  apiBase: "",
};
