// /public/js/auth.js
// MSAL (redirect flow) wrapper. Requires msal-browser from CDN
// (loaded in the HTML) unless DEMO_MODE is on.

(function () {
  const cfg = window.DealSheetConfig;
  let msalApp = null;
  let account = null;

  async function init() {
    if (cfg.DEMO_MODE) {
      account = { name: "Demo User", username: "demo@sicommercial.co.nz" };
      return account;
    }

    msalApp = new msal.PublicClientApplication({
      auth: {
        clientId: cfg.msal.clientId,
        authority: `https://login.microsoftonline.com/${cfg.msal.tenantId}`,
        redirectUri: window.location.href.split(/[?#]/)[0],
      },
      cache: { cacheLocation: "localStorage" },
    });
    await msalApp.initialize();

    const resp = await msalApp.handleRedirectPromise();
    account = resp?.account || msalApp.getAllAccounts()[0] || null;

    if (!account) {
      await msalApp.loginRedirect({ scopes: [cfg.msal.apiScope] });
      return null; // page will redirect
    }
    return account;
  }

  async function getToken() {
    if (cfg.DEMO_MODE) return "demo-token";
    try {
      const r = await msalApp.acquireTokenSilent({
        scopes: [cfg.msal.apiScope],
        account,
      });
      return r.accessToken;
    } catch {
      await msalApp.acquireTokenRedirect({
        scopes: [cfg.msal.apiScope],
        account,
      });
      return null;
    }
  }

  window.DealSheetAuth = {
    init,
    getToken,
    get account() {
      return account;
    },
  };
})();
