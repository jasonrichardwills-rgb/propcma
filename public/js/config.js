// /public/js/config.js
// ── THE ONLY FRONTEND FILE YOU EDIT ─────────────────────────
// DEMO_MODE: true  → no sign-in, mock data, works by opening the
//                    HTML files directly. Use to test the UI.
// DEMO_MODE: false → real MSAL sign-in + live API.
//
// NOTE: the values below are PUBLIC by design — MSAL exposes them
// to the browser. The client SECRET must never appear in this file;
// it belongs only in Vercel's environment variables.

window.DealSheetConfig = {
  DEMO_MODE: false,

  msal: {
    clientId: "e41d7680-86d8-49a0-8a68-17a5f166e10b",
    tenantId: "eb16ec4a-f2aa-404f-b306-b391df9df367",
    apiScope: "api://e41d7680-86d8-49a0-8a68-17a5f166e10b/access_as_user",
  },

  // Leave "" when the pages are served from the same Vercel project
  // as the /api functions (recommended).
  apiBase: "",
};
