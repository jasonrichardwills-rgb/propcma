// /public/js/accounts.js — Accounts Deal Sheet Processing (vanilla)
(function () {
  const cfg = window.DealSheetConfig;
  const api = window.DealSheetApi;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = (n) => Number(n || 0).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtSize = (b) => { b = Number(b||0); return b < 1024 ? b+" B" : b < 1048576 ? (b/1024).toFixed(0)+" KB" : (b/1048576).toFixed(1)+" MB"; };

  const META = {
    submitted:  { label: "Submitted",  cls: "sub" },
    processing: { label: "Processing", cls: "proc" },
    invoiced:   { label: "Invoiced",   cls: "inv" },
    rejected:   { label: "Returned",   cls: "rej" },
  };

  const state = { queue: [], selectedId: null, deal: null, filter: "all", note: "", pendingNums: {} };

  async function loadQueue() {
    state.queue = await api.getQueue();
    if (!state.selectedId && state.queue.length) state.selectedId = state.queue[0].id;
    if (state.selectedId) await loadDeal(state.selectedId);
    render();
  }
  async function loadDeal(id) {
    state.selectedId = id;
    state.deal = await api.get(id);
    state.pendingNums = { fileNo: state.deal.file_no || "", dealNo: state.deal.deal_no || "" };
    state.note = "";
  }

  function counts() {
    return Object.entries(META).map(([k, m]) => {
      const c = state.queue.filter((d) => d.status === k).length;
      return c ? `<span class="pill ${m.cls}">${c} ${m.label.toLowerCase()}</span>` : "";
    }).join("");
  }

  function checklistOf(deal) {
    const c = (deal.form && deal.form.checklist) || {};
    const items = [
      ["agencyAgreement", "Signed agency agreement"],
      ["unconditionalConfirmation", "Confirmation of unconditional"],
      ["salePriceConfirmation", "Confirmation of sale price"],
      ["marketingReport", "Marketing campaign report"],
    ];
    if (deal.deposit_to_trust) items.push(["spAgreement", "S&P agreement (trust deal)"]);
    return items.map(([k, label]) => ({ ok: !!c[k], label }));
  }

  function render() {
    const shown = state.queue.filter((d) => state.filter === "all" || d.status === state.filter);

    $("app").innerHTML = `
      <header class="top">
        <div class="brand"><span class="brandMark">SIC</span>
          <div><h1>Deal Sheet Processing</h1><p>Accounts · South Island Commercial (2004) Limited</p></div></div>
        <div class="counts">${counts()}</div>
      </header>
      <div class="layout accounts">
        <aside class="queue">
          <div class="filters">
            ${["all","submitted","processing","invoiced"].map((s) =>
              `<button class="fbtn ${state.filter===s?"on":""}" data-filter="${s}">${s==="all"?"All":META[s].label}</button>`).join("")}
          </div>
          ${shown.map((d) => `<button class="row ${state.selectedId===d.id?"sel":""}" data-id="${d.id}">
            <div class="rowTop"><strong>${esc(d.property_address||"—")}</strong>
              <span class="pill ${META[d.status].cls}">${META[d.status].label}</span></div>
            <div class="rowSub">${esc(d.salesperson||"")} · ${esc(d.division||"")} · $${fmt(d.total_invoice_ex_gst)} to invoice
              ${d.deposit_to_trust?'<span class="trustDot"> · TRUST</span>':""}
              ${d.confidential?'<span class="confDot"> · CONFIDENTIAL</span>':""}</div></button>`).join("")
            || `<p class="empty">No deal sheets in this state.</p>`}
        </aside>
        <main id="detail"></main>
      </div>`;

    $("app").querySelectorAll("[data-filter]").forEach((b) =>
      b.onclick = () => { state.filter = b.dataset.filter; render(); });
    $("app").querySelectorAll("[data-id]").forEach((b) =>
      b.onclick = async () => { await loadDeal(b.dataset.id); render(); });

    renderDetail();
  }

  function renderDetail() {
    const el = $("detail");
    const d = state.deal;
    if (!d) { el.innerHTML = ""; return; }
    const splits = d.splits || [];
    const events = d.events || [];
    const checks = checklistOf(d);
    const checklistOk = checks.every((c) => c.ok);

    el.className = "detail";
    el.innerHTML = `
      <div class="detailHead">
        <div><h2>${esc(d.property_address||"—")}</h2>
          <p class="dim">Submitted ${d.submitted_at?new Date(d.submitted_at).toLocaleString("en-NZ"):"—"} · Broker ${esc(d.salesperson||"")} · ${esc(d.division||"")}</p></div>
        <span class="pill big ${META[d.status].cls}">${META[d.status].label}</span>
      </div>
      <div class="cols">
        <section class="panel">
          <h3>Deal</h3>
          <dl>
            <div><dt>Vendor</dt><dd>${esc(d.vendor_name||"—")}</dd></div>
            <div><dt>Purchaser</dt><dd>${esc(d.purchaser_name||"—")}</dd></div>
            <div><dt>Unconditional</dt><dd>${esc(d.unconditional_date||"—")}</dd></div>
            <div><dt>Sale price (excl GST)</dt><dd>$${fmt(d.sale_price_ex_gst)}</dd></div>
            <div class="hl"><dt>Total to invoice (excl GST)</dt><dd>$${fmt(d.total_invoice_ex_gst)}</dd></div>
          </dl>
          ${d.form && d.form.deposit && d.deposit_to_trust ? `<h3>Trust deposit</h3><dl>
            <div><dt>Amount</dt><dd>$${fmt(d.form.deposit.amount)}</dd></div>
            <div><dt>Receipt no.</dt><dd>${esc(d.form.deposit.receiptNo||"—")}</dd></div>
            <div><dt>Method</dt><dd>${esc(d.form.deposit.method||"—")}</dd></div></dl>` : ""}
          <h3>Commission split</h3>
          <table class="tbl"><tbody>${splits.map((s) =>
            `<tr><td>${esc(s.party_name)}</td><td class="r">${s.split_pct}%</td><td class="r mono">$${fmt(s.split_amount)}</td></tr>`).join("")||`<tr><td class="dim">No splits recorded</td></tr>`}</tbody></table>
          <h3>Mandatory checklist</h3>
          <ul class="checks">${checks.map((c) => `<li class="${c.ok?"":"bad"}">${c.label}</li>`).join("")}</ul>
          ${(d.attachments && d.attachments.length) ? `<h3>Attachments</h3>
          <ul class="attachList">${d.attachments.map((a) =>
            `<li><span>📎 ${esc(a.file_name)} <span class="dim">(${fmtSize(a.size_bytes)})</span></span>
             <button class="dlBtn" data-slot="${esc(a.slot)}">Download</button></li>`).join("")}</ul>` : ""}
        </section>

        <section class="panel actions">
          <h3>Process</h3>
          <label class="fld"><span class="lbl">File no.</span>
            <input id="fileNo" value="${esc(state.pendingNums.fileNo)}" ${d.status!=="submitted"?"disabled":""} placeholder="e.g. F-26-119" /></label>
          <label class="fld"><span class="lbl">Deal no.</span>
            <input id="dealNo" value="${esc(state.pendingNums.dealNo)}" ${d.status!=="submitted"?"disabled":""} placeholder="e.g. D-3073" /></label>

          ${d.status==="submitted" ? `
            <button class="primary" id="processBtn" ${!checklistOk?"disabled":""}>Assign numbers &amp; start processing</button>
            ${!checklistOk?`<p class="warn">Checklist incomplete — return to broker.</p>`:""}
            <div class="returnBox">
              <textarea id="returnNote" rows="2" placeholder="Reason for returning to broker…">${esc(state.note)}</textarea>
              <button class="ghost" id="returnBtn">Return to broker</button>
            </div>` : ""}
          ${d.status==="processing" ? `<button class="primary" id="invoiceBtn">Mark invoiced — commission approved</button>` : ""}
          ${d.status==="invoiced" ? `<p class="doneNote">✓ Invoiced. File ${esc(d.file_no)} · Deal ${esc(d.deal_no)}.</p>` : ""}
          ${d.status==="rejected" ? `<p class="warn">Returned to broker — awaiting resubmission.</p>` : ""}

          <h3 style="margin-top:18px">History</h3>
          <ol class="events">${events.map((ev) =>
            `<li><span class="mono dim">${new Date(ev.created_at).toLocaleString("en-NZ")}</span><br />${esc(ev.note||ev.to_status)}</li>`).join("")}</ol>
        </section>
      </div>`;

    const fileNo = $("fileNo"), dealNo = $("dealNo");
    if (fileNo) fileNo.oninput = () => { state.pendingNums.fileNo = fileNo.value; toggleProcess(); };
    if (dealNo) dealNo.oninput = () => { state.pendingNums.dealNo = dealNo.value; toggleProcess(); };
    const note = $("returnNote");
    if (note) note.oninput = () => { state.note = note.value; const rb = $("returnBtn"); if (rb) rb.disabled = !note.value.trim(); };

    const pb = $("processBtn");
    if (pb) { toggleProcess(); pb.onclick = doProcess; }
    const ib = $("invoiceBtn"); if (ib) ib.onclick = doInvoice;
    const rb = $("returnBtn"); if (rb) { rb.disabled = !state.note.trim(); rb.onclick = doReturn; }

    el.querySelectorAll(".dlBtn").forEach((b) => {
      b.onclick = async () => {
        b.disabled = true; b.textContent = "Preparing…";
        try {
          const { url } = await api.attachmentUrl(state.deal.id, b.dataset.slot);
          window.open(url, "_blank");
        } catch (e) { alert("Could not get download link: " + e.message); }
        finally { b.disabled = false; b.textContent = "Download"; }
      };
    });
  }

  function toggleProcess() {
    const pb = $("processBtn"); if (!pb) return;
    const checks = checklistOf(state.deal);
    const ok = checks.every((c) => c.ok) && state.pendingNums.fileNo.trim() && state.pendingNums.dealNo.trim();
    pb.disabled = !ok;
  }

  async function doProcess() {
    try {
      await api.process(state.deal.id, { fileNo: state.pendingNums.fileNo.trim(), dealNo: state.pendingNums.dealNo.trim() });
      await refresh();
    } catch (e) { alert("Could not process: " + e.message); }
  }
  async function doInvoice() {
    try { await api.invoice(state.deal.id); await refresh(); }
    catch (e) { alert("Could not mark invoiced: " + e.message); }
  }
  async function doReturn() {
    if (!state.note.trim()) return;
    try { await api.returnToBroker(state.deal.id, state.note.trim()); await refresh(); }
    catch (e) { alert("Could not return: " + e.message); }
  }
  async function refresh() {
    await loadDeal(state.selectedId);
    state.queue = await api.getQueue();
    render();
  }

  (async function boot() {
    if (cfg.DEMO_MODE) $("demoBadge").classList.remove("hidden");
    try {
      const account = await window.DealSheetAuth.init();
      if (!account) return;
    } catch (e) {
      $("gate").innerHTML = `<div class="inner">Sign-in failed: ${esc(e.message)}</div>`;
      return;
    }
    $("gate").classList.add("hidden");
    $("app").classList.remove("hidden");
    await loadQueue();
  })();
})();
