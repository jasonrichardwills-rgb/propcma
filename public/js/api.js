// /public/js/api.js
// Data layer used by both pages. In DEMO_MODE it runs against an
// in-memory mock backend (below) so the UI is fully clickable
// with zero setup; otherwise it calls /api/deal-sheets/*.

(function () {
  const cfg = window.DealSheetConfig;

  // ───────────────────────── live client ─────────────────────
  async function call(path, { method = "GET", body } = {}) {
    const token = await window.DealSheetAuth.getToken();
    const res = await fetch(`${cfg.apiBase}/api/deal-sheets${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* empty */ }
    if (!res.ok) {
      const err = new Error(data?.error || `Request failed (${res.status})`);
      err.status = res.status;
      err.missing = data?.missing;
      throw err;
    }
    return data;
  }

  const live = {
    listMine: () => call("?scope=mine"),
    saveDraft: (form, id) => call("", { method: "POST", body: { id, form } }),
    submit: (id) => call(`/${id}/submit`, { method: "POST" }),
    searchProperties: (q) => call(`/properties?q=${encodeURIComponent(q)}`),
    get: (id) => call(`/${id}`),
    getQueue: (status) => call(`?scope=queue${status ? `&status=${status}` : ""}`),
    process: (id, nums) => call(`/${id}/process`, { method: "POST", body: nums }),
    invoice: (id) => call(`/${id}/invoice`, { method: "POST" }),
    returnToBroker: (id, note) => call(`/${id}/return`, { method: "POST", body: { note } }),
  };

  // ───────────────────────── demo backend ────────────────────
  const demoProperties = [
    { id: "cma-2041", label: "76 Columbia Ave, Hornby", address: "76 Columbia Ave, Hornby", propertyType: "Industrial — Warehouse", landArea: "1,850", occupiedArea: "2,450", annualRent: "", yield: "", wale: "", notes: "Modern high-stud warehouse with dual road frontage and generous yard, sold with vacant possession to an owner-occupier.", vendor: "Hodge Family Trust", purchaser: "", dealType: "Sale" },
    { id: "cma-2044", label: "Victoria House, 112 Victoria St", address: "112 Victoria St, Christchurch Central", propertyType: "Office", landArea: "620", occupiedArea: "810", annualRent: "245000", yield: "7.5", wale: "4.2", notes: "A-grade CBD office building fully leased to established tenants, sold to a private investor on a passing yield of 7.5%.", vendor: "Victoria House Investments Ltd", purchaser: "", dealType: "Sale" },
    { id: "cma-2052", label: "8B Foremans Rd, Islington", address: "Unit B, 8 Foremans Rd, Islington", propertyType: "Industrial — Yard & Store", landArea: "3,900", occupiedArea: "5,120", annualRent: "", yield: "", wale: "", notes: "Large securely-fenced industrial yard with storage building, leased to a national logistics operator.", vendor: "Foremans Road Trustee Ltd", purchaser: "", dealType: "Lease" },
  ];

  const demoStore = {
    seq: 1043,
    deals: [
      {
        id: "ds-1042", status: "submitted", submitted_at: "2026-07-13T09:12:00",
        salesperson: "OS", division: "Industrial",
        property_address: "76 Columbia Ave", suburb: "Hornby",
        vendor_name: "Kay Margot Hodge and Paget & Associates Trustees Ltd",
        purchaser_name: "Southbase Property Holdings Ltd",
        unconditional_date: "2026-07-08",
        sale_price_ex_gst: 1965000, total_invoice_ex_gst: 136590.27,
        deposit_to_trust: true, confidential: false,
        file_no: "", deal_no: "",
        form: { depositToTrust: true, deposit: { amount: "171766.88", receiptNo: "1436758", method: "Direct credit" },
          checklist: { agencyAgreement: true, unconditionalConfirmation: true, salePriceConfirmation: true, marketingReport: true, spAgreement: true } },
        splits: [
          { party_type: "salesperson", party_name: "OS", split_pct: 50, split_amount: 68295.13 },
          { party_type: "salesperson", party_name: "CK", split_pct: 25, split_amount: 34147.57 },
          { party_type: "salesperson", party_name: "SS", split_pct: 25, split_amount: 34147.57 },
        ],
        events: [{ created_at: "2026-07-13T09:12:00", note: "Submitted by broker", to_status: "submitted" }],
      },
      {
        id: "ds-1041", status: "processing", submitted_at: "2026-07-11T15:40:00",
        salesperson: "CK", division: "Office",
        property_address: "112 Victoria St", suburb: "Christchurch Central",
        vendor_name: "Victoria House Investments Ltd", purchaser_name: null,
        unconditional_date: "2026-07-04",
        sale_price_ex_gst: 3250000, total_invoice_ex_gst: 92500,
        deposit_to_trust: false, confidential: true,
        file_no: "F-26-118", deal_no: "D-3072",
        form: { depositToTrust: false,
          checklist: { agencyAgreement: true, unconditionalConfirmation: true, salePriceConfirmation: true, marketingReport: true } },
        splits: [{ party_type: "salesperson", party_name: "CK", split_pct: 100, split_amount: 92500 }],
        events: [
          { created_at: "2026-07-11T15:40:00", note: "Submitted by broker", to_status: "submitted" },
          { created_at: "2026-07-12T08:55:00", note: "File F-26-118 / Deal D-3072 assigned", to_status: "processing" },
        ],
      },
    ],
  };

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const delay = (v) => new Promise((r) => setTimeout(() => r(clone(v)), 150));
  const findDeal = (id) => demoStore.deals.find((d) => d.id === id);

  const demo = {
    listMine: () => delay(demoStore.deals.map(({ id, status, property_address, vendor_name, total_invoice_ex_gst }) =>
      ({ id, status, property_address, vendor_name, total_invoice_ex_gst }))),
    saveDraft: (form, id) => {
      let d = id && findDeal(id);
      if (!d) {
        d = { id: `ds-${demoStore.seq++}`, status: "draft", splits: [], events: [] };
        demoStore.deals.unshift(d);
      }
      d.form = clone(form);
      d.property_address = (form.property?.address || "").trim();
      d.vendor_name = form.vendor?.name || "";
      return delay({ id: d.id, status: d.status });
    },
    submit: (id) => {
      const d = findDeal(id);
      d.status = "submitted";
      d.submitted_at = new Date().toISOString();
      d.events.push({ created_at: d.submitted_at, note: "Submitted by broker", to_status: "submitted" });
      return delay({ ok: true, status: "submitted", emailed: true });
    },
    searchProperties: (q) =>
      delay(demoProperties.filter((p) => p.label.toLowerCase().includes(q.toLowerCase()))),
    get: (id) => delay(findDeal(id)),
    getQueue: (status) =>
      delay(demoStore.deals.filter((d) => d.status !== "draft" && (!status || d.status === status))),
    process: (id, { fileNo, dealNo }) => {
      const d = findDeal(id);
      d.status = "processing"; d.file_no = fileNo; d.deal_no = dealNo;
      d.events.push({ created_at: new Date().toISOString(), note: `File ${fileNo} / Deal ${dealNo} assigned`, to_status: "processing" });
      return delay({ ok: true });
    },
    invoice: (id) => {
      const d = findDeal(id);
      d.status = "invoiced";
      d.events.push({ created_at: new Date().toISOString(), note: "Invoice raised — commission approved", to_status: "invoiced" });
      return delay({ ok: true });
    },
    returnToBroker: (id, note) => {
      const d = findDeal(id);
      d.status = "rejected";
      d.events.push({ created_at: new Date().toISOString(), note: `Returned to broker: ${note}`, to_status: "rejected" });
      return delay({ ok: true });
    },
  };

  window.DealSheetApi = cfg.DEMO_MODE ? demo : live;
})();
