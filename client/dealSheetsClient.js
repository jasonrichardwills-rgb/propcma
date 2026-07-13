// /client/dealSheetsClient.js
// Framework-agnostic data layer for the Deal Sheet UI.
// Works in any frontend — the only dependency is your existing
// MSAL instance and signed-in account.
//
// Setup once, after MSAL sign-in:
//
//   import { createDealSheetsClient } from "./dealSheetsClient.js";
//   const api = createDealSheetsClient({
//     msalInstance,                              // your PublicClientApplication
//     account: msalInstance.getAllAccounts()[0],
//     apiScope: "api://<client-id>/access_as_user",
//   });
//
// ── Wiring the BROKER FORM (deal-sheet-form.jsx) ──────────────
//   • PropCMA dropdown: replace MOCK_PROPCMA with
//       const results = await api.searchProperties(query);
//     (same shape — linkCma() works unchanged; also store
//      form.propertyId = selected.id)
//   • Autosave draft: debounce ~2s after changes →
//       const { id } = await api.saveDraft(f, currentId);
//   • "Confirm — send to accounts" button →
//       await api.saveDraft(f, currentId);
//       await api.submit(currentId);
//     A 422 response returns { missing: [...] } — show it in the
//     existing warning banner.
//
// ── Wiring the ACCOUNTS VIEW (accounts-review.jsx) ────────────
//   • Queue list:    const deals = await api.getQueue();
//   • Detail:        const deal = await api.get(id);   // incl. splits + events
//   • Assign & start: await api.process(id, { fileNo, dealNo });
//   • Invoiced:       await api.invoice(id);
//   • Return:         await api.returnToBroker(id, note);
//   Then re-fetch the queue/detail to refresh state.

export function createDealSheetsClient({ msalInstance, account, apiScope, baseUrl = "" }) {
  async function accessToken() {
    try {
      const r = await msalInstance.acquireTokenSilent({ scopes: [apiScope], account });
      return r.accessToken;
    } catch {
      // Fall back to interactive if silent renewal fails (expired session)
      const r = await msalInstance.acquireTokenPopup({ scopes: [apiScope], account });
      return r.accessToken;
    }
  }

  async function call(path, { method = "GET", body } = {}) {
    const token = await accessToken();
    const res = await fetch(`${baseUrl}/api/deal-sheets${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    let data = null;
    try { data = await res.json(); } catch { /* empty body */ }

    if (!res.ok) {
      const err = new Error(data?.error || `Request failed (${res.status})`);
      err.status = res.status;
      err.missing = data?.missing; // populated on 422 submit validation
      throw err;
    }
    return data;
  }

  return {
    // broker
    listMine:        ()            => call("?scope=mine"),
    saveDraft:       (form, id)    => call("", { method: "POST", body: { id, form } }),
    submit:          (id)          => call(`/${id}/submit`, { method: "POST" }),
    searchProperties:(q)           => call(`/properties?q=${encodeURIComponent(q)}`),

    // shared
    get:             (id)          => call(`/${id}`),

    // accounts / manager
    getQueue:        (status)      => call(`?scope=queue${status ? `&status=${status}` : ""}`),
    process:         (id, nums)    => call(`/${id}/process`, { method: "POST", body: nums }),
    invoice:         (id)          => call(`/${id}/invoice`, { method: "POST" }),
    returnToBroker:  (id, note)    => call(`/${id}/return`,  { method: "POST", body: { note } }),
  };
}
