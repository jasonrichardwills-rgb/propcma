// /public/js/form.js — Broker Deal Sheet (vanilla)
(function () {
  const cfg = window.DealSheetConfig;
  const api = window.DealSheetApi;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const num = (v) => { const n = parseFloat(String(v ?? "").replace(/[$,\s]/g, "")); return isNaN(n) ? 0 : n; };
  const fmt = (n) => n.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const DIVISIONS = ["Industrial","Office","Retail","Investment Sales","Land","Rural & Agribusiness","Other"];
  const TITLES = ["Freehold","Strata","Leasehold"];
  const PAY = ["Direct credit","Cheque","International transfer"];
  const BUYER = ["Advert","Sign","Website","Relationship","Target mailing","Referral","Canvassing","Other"];
  const LISTING = ["Referral","Canvassing","Relationship","Other"];

  const state = {
    currentId: null,
    saveTimer: null,
    f: {
      propertyId: null,
      ownership: { salesperson: "", division: "Industrial", office: "Christchurch" },
      cmaLabel: "",
      property: { address:"", buildingName:"", propertyType:"", level:"", city:"Christchurch" },
      vendor: { name:"", phone:"", contactName:"", email:"", postalAddress:"", postcode:"", city:"", country:"NZ", fax:"", solicitorName:"", solicitorFirm:"", solicitorPhone:"", vendorGroup:"" },
      billingDifferent: false,
      billing: { name:"", phone:"", contactName:"", email:"", postalAddress:"", postcode:"", city:"", country:"NZ", fax:"" },
      invoicePurchaser: false,
      purchaser: { name:"", phone:"", contactName:"", email:"", postalAddress:"", postcode:"", city:"", country:"NZ", fax:"", solicitorName:"", solicitorFirm:"", solicitorPhone:"" },
      sale: { dateOfAgreement:"", unconditionalDate:"", salePrice:"", rentalBasis:"Net", rentalIncome:"", yieldManual:"", titleType:"Freehold", landArea:"", wale:"", tenancies:"", occupiedArea:"", tenancySchedule:false },
      depositToTrust: false,
      deposit: { amount:"", dateReceived:"", method:"Direct credit", receiptNo:"", earlyRelease:false, vendorAuthSent:false, vendorAuthReceived:false, purchaserAuthSent:false, purchaserAuthReceived:false },
      comm: { tiers:[{pct:"",base:""},{pct:"",base:""},{pct:"",base:""}], otherDesc:"", otherFee:"", adminFee:true, marketingFeeInstead:false, marketingJobNo:"", recoverMarketing:"", recoverJobNo:"", recoverOtherDesc:"", recoverOther:"" },
      splits: [ {person:"",pct:""},{person:"",pct:""},{person:"",pct:""},{person:"",pct:""},{person:"",pct:""} ],
      thirdParty: [ {name:"",pct:""},{name:"",pct:""},{name:"",pct:""} ],
      press: { text:"", confidential:false },
      buyerSource:"", buyerSourceOther:"",
      listingSource:"", listingReferralWho:"", listingReferralInternal:"Yes", listingOther:"",
      checklist: { agencyAgreement:false, unconditionalConfirmation:false, salePriceConfirmation:false, marketingReport:false, spAgreement:false },
      brokerName:"",
    },
  };

  const get = (path) => path.split(".").reduce((o, k) => o?.[k], state.f);
  const set = (path, val) => {
    const keys = path.split("."); let o = state.f;
    for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
    o[keys[keys.length - 1]] = val;
    scheduleAutosave();
    render();
  };

  // ---------- derived ----------
  function derive() {
    const f = state.f;
    const salePrice = num(f.sale.salePrice);
    const yieldCalc = salePrice > 0 && num(f.sale.rentalIncome) > 0 ? (num(f.sale.rentalIncome)/salePrice)*100 : 0;
    // Manual/pre-filled yield takes precedence; otherwise show the calc.
    const yieldPct = f.sale.yieldManual !== "" ? num(f.sale.yieldManual) : yieldCalc;
    const tierFees = f.comm.tiers.map((t,i) => { const base = i===0 && !t.base ? salePrice : num(t.base); return (num(t.pct)/100)*base; });
    const fixedFee = (f.comm.marketingFeeInstead || f.comm.adminFee) ? 500 : 0;
    const totalInvoice = tierFees.reduce((a,b)=>a+b,0) + num(f.comm.otherFee) + fixedFee + num(f.comm.recoverMarketing) + num(f.comm.recoverOther);
    const allSplits = [...f.splits, ...f.thirdParty];
    const splitPctTotal = allSplits.reduce((a,s)=>a+num(s.pct),0);
    const splitsOk = splitPctTotal === 0 || Math.abs(splitPctTotal-100) < 0.01;
    const pressWords = f.press.text.trim() ? f.press.text.trim().split(/\s+/).length : 0;
    return { salePrice, yieldCalc, yieldPct, tierFees, fixedFee, totalInvoice, splitPctTotal, splitsOk, pressWords };
  }

  function validate(d) {
    const f = state.f, m = [];
    if (!f.ownership.salesperson) m.push("Salesperson");
    if (!f.property.address || !f.property.address.trim()) m.push("Property address");
    if (!f.vendor.name) m.push("Vendor name");
    if (!f.sale.dateOfAgreement) m.push("Date of agreement");
    if (!f.sale.unconditionalDate) m.push("Unconditional date");
    if (!d.salePrice) m.push("Sale price");
    if (!d.totalInvoice) m.push("Commission calculation");
    if (d.splitPctTotal === 0) m.push("Commission split");
    else if (!d.splitsOk) m.push("Commission split must total 100%");
    if (d.pressWords < 20) m.push("Press release paragraph (20 words min)");
    if (!f.buyerSource) m.push("Buyer source");
    if (!f.listingSource) m.push("Listing source");
    if (!f.checklist.agencyAgreement) m.push("Checklist — signed agency agreement");
    if (!f.checklist.unconditionalConfirmation) m.push("Checklist — confirmation of unconditional");
    if (!f.checklist.salePriceConfirmation) m.push("Checklist — confirmation of sale price");
    if (!f.checklist.marketingReport) m.push("Checklist — marketing campaign report");
    if (f.depositToTrust && !f.checklist.spAgreement) m.push("Checklist — S&P agreement (trust deal)");
    if (!f.brokerName) m.push("Broker sign-off");
    return m;
  }

  // ---------- autosave ----------
  let saveState = "";
  function scheduleAutosave() {
    clearTimeout(state.saveTimer);
    saveState = "Saving…"; updateSaveState();
    state.saveTimer = setTimeout(async () => {
      try {
        const r = await api.saveDraft(state.f, state.currentId);
        state.currentId = r.id;
        saveState = "Draft saved";
      } catch (e) { saveState = "Save failed — will retry"; }
      updateSaveState();
    }, 1500);
  }
  function updateSaveState() { const el = $("saveState"); if (el) el.textContent = saveState; }

  // ---------- small builders ----------
  const txt = (path, label, opts = {}) => {
    const { ph = "", type = "text", span = 1, req = false } = opts;
    return `<label class="fld span${span}"><span class="lbl">${label}${req ? '<em class="req">*</em>' : ''}</span>
      <input type="${type}" data-path="${path}" value="${esc(get(path))}" placeholder="${esc(ph)}" /></label>`;
  };
  const sel = (path, label, options, span = 1) =>
    `<label class="fld span${span}"><span class="lbl">${label}</span>
      <select data-path="${path}"><option value="">Select…</option>
      ${options.map(o => `<option value="${esc(o)}" ${get(path)===o?"selected":""}>${esc(o)}</option>`).join("")}
      </select></label>`;
  const chk = (path, label) =>
    `<label class="chk"><input type="checkbox" data-path="${path}" ${get(path)?"checked":""} /><span>${label}</span></label>`;
  const party = (base, solicitor) => `<div class="grid">
    ${txt(base+".name","Name",{span:2,req:base==="vendor"})}${txt(base+".phone","Phone")}
    ${txt(base+".contactName","Contact name",{span:2})}${txt(base+".email","Email",{type:"email"})}
    ${txt(base+".postalAddress","Postal address",{span:2})}${txt(base+".postcode","Postcode")}
    ${txt(base+".city","City")}${txt(base+".country","Country")}${txt(base+".fax","Fax")}
    ${solicitor ? txt(base+".solicitorName","Solicitor")+txt(base+".solicitorFirm","Firm")+txt(base+".solicitorPhone","Solicitor phone") : ""}
  </div>`;
  const section = (n, title, note, inner) => `<section class="card"><header class="cardHead">
    <span class="secNo">${n}</span><div><h2>${title}</h2>${note?`<p class="note">${note}</p>`:""}</div></header>${inner}</section>`;

  // When yield isn't manually set, show the live calc as the input's placeholder.
  function yieldCalcPlaceholder(d) {
    return d.yieldCalc ? `auto: ${d.yieldCalc.toFixed(2)}` : "auto-calculated";
  }

  // ---------- render ----------
  function render() {
    const d = derive();
    const missing = validate(d);
    const f = state.f;

    const commRows = ["Commission","Second tier","Third tier"].map((label,i) => `<tr>
      <td>${label}</td>
      <td><input class="cell" data-path="comm.tiers.${i}.pct" value="${esc(f.comm.tiers[i].pct)}" placeholder="%" /></td>
      <td><input class="cell" data-path="comm.tiers.${i}.base" value="${esc(i===0 && !f.comm.tiers[i].base ? (d.salePrice?fmt(d.salePrice):"") : f.comm.tiers[i].base)}" placeholder="${i===0?"Sale price":"Amount"}" /></td>
      <td class="r mono">${d.tierFees[i]?fmt(d.tierFees[i]):"—"}</td></tr>`).join("");

    const splitRows = f.splits.map((s,i) => `<tr>
      <td><input class="cell" data-path="splits.${i}.person" value="${esc(s.person)}" placeholder="Salesperson ${i+1}" /></td>
      <td><input class="cell" data-path="splits.${i}.pct" value="${esc(s.pct)}" placeholder="%" /></td>
      <td class="r mono">${num(s.pct)?fmt((num(s.pct)/100)*d.totalInvoice):"—"}</td></tr>`).join("");
    const tpRows = f.thirdParty.map((s,i) => `<tr>
      <td><input class="cell" data-path="thirdParty.${i}.name" value="${esc(s.name)}" placeholder="Office / party" /></td>
      <td><input class="cell" data-path="thirdParty.${i}.pct" value="${esc(s.pct)}" placeholder="%" /></td>
      <td class="r mono">${num(s.pct)?fmt((num(s.pct)/100)*d.totalInvoice):"—"}</td></tr>`).join("");

    $("app").innerHTML = `
      <header class="top">
        <div class="brand"><span class="brandMark">SIC</span>
          <div><h1>Deal Sheet — Sales Record</h1><p>South Island Commercial (2004) Limited · Colliers</p></div></div>
        <div class="accountsBox"><span class="tag">Completed by accounts</span>
          <div class="acctFields"><label><span>File No.</span><input disabled placeholder="—" /></label>
          <label><span>Deal No.</span><input disabled placeholder="—" /></label></div></div>
      </header>
      <p class="mandate">Complete <strong>all</strong> categories for commission to be paid promptly.
        Fields marked <em class="req">*</em> and the mandatory checklist must be complete before sending to accounts.</p>
      ${state.triedSubmit && missing.length ? `<div class="warnBanner"><strong>Not ready to send.</strong> Outstanding: ${missing.map(esc).join(" · ")}</div>` : ""}

      <div class="layout">
        <main>
          ${section("1","Deal ownership","",`<div class="grid">
            ${txt("ownership.salesperson","Salesperson",{ph:"e.g. OS",req:true})}
            ${sel("ownership.division","Division",DIVISIONS)}${txt("ownership.office","Office")}</div>`)}

          ${section("2","Property details","Search PropCMA to pre-fill the address, land area and yield.",`
            <div class="cmaLink">
              <div class="searchWrap">
                <label class="fld"><span class="lbl">PropCMA property</span>
                  <input id="cmaSearch" placeholder="Type an address or vendor…" autocomplete="off" value="${esc(f.cmaLabel)}" /></label>
                <div class="searchResults hidden" id="cmaResults"></div>
              </div>
              ${state.f.propertyId ? `<span class="linkedPill">Linked · comparable</span>` : ""}
            </div>
            <div class="grid">
              ${txt("property.address","Address",{span:3,req:true,ph:"e.g. 76 Columbia Ave, Hornby"})}
              ${txt("property.buildingName","Building name",{span:2})}${txt("property.propertyType","Property type")}
              ${txt("property.level","Level")}${txt("property.city","City",{span:2})}</div>`)}

          ${section("3","Vendor","",party("vendor",true)+`<div class="grid" style="margin-top:10px">${txt("vendor.vendorGroup","Vendor group",{ph:"Parent company / common name",span:3})}</div>`)}

          ${section("4","Billing entity","Legal entity for invoicing. Leave off if the same as the vendor.",
            chk("billingDifferent","Invoice a different legal entity to the vendor") + (f.billingDifferent?`<div style="margin-top:12px">${party("billing",false)}</div>`:""))}

          ${section("5","Purchaser","",
            chk("invoicePurchaser","Tick if the invoice needs to be raised to the purchaser") + `<div style="margin-top:12px">${party("purchaser",true)}</div>`)}

          ${section("6","Sale details","",`<div class="grid">
            ${txt("sale.dateOfAgreement","Date of agreement",{type:"date",req:true})}
            ${txt("sale.unconditionalDate","Unconditional date",{type:"date",req:true})}
            ${txt("sale.salePrice","Sale price (excl GST) $",{ph:"0.00",req:true})}
            ${sel("sale.rentalBasis","Rental basis",["Net","Gross"])}
            ${txt("sale.rentalIncome",(f.sale.rentalBasis)+" rental income $ p.a.")}
            <label class="fld"><span class="lbl">${f.sale.rentalBasis} yield %</span>
              <input data-path="sale.yieldManual" value="${esc(f.sale.yieldManual)}" placeholder="${yieldCalcPlaceholder(d)}" /></label>
            ${sel("sale.titleType","Title",TITLES)}${txt("sale.landArea","Land area (sqm)")}
            ${txt("sale.wale","WALE (Years)")}
            ${txt("sale.tenancies","No. of tenancies (incl. sub-tenancies)")}${txt("sale.occupiedArea","Occupied by area (sqm)")}</div>
            <div style="margin-top:10px">${chk("sale.tenancySchedule","Tenancy schedule attached (if available)")}</div>`)}

          ${section("7","Deposit — trust account","Complete if a deposit will be paid into the Colliers trust account.",
            chk("depositToTrust","Deposit paid into the trust account") + (f.depositToTrust?`
              <div class="grid" style="margin-top:12px">
                ${txt("deposit.amount","Deposit amount $")}${txt("deposit.dateReceived","Date received",{type:"date"})}
                ${sel("deposit.method","Payment method",PAY)}${txt("deposit.receiptNo","Trust receipt no.")}</div>
              <div class="authRow">${chk("deposit.earlyRelease","Early release required")}
              ${f.deposit.earlyRelease?`<div class="authGrid"><span class="authLbl">Authorisation forms</span>
                ${chk("deposit.vendorAuthSent","Vendor — sent")}${chk("deposit.vendorAuthReceived","Vendor — received")}
                ${chk("deposit.purchaserAuthSent","Purchaser — sent")}${chk("deposit.purchaserAuthReceived","Purchaser — received")}</div>`:""}</div>`:""))}

          ${section("8","Commission calculation","Fees calculate automatically from the percentages you enter.",`
            <table class="tbl"><thead><tr><th>Tier</th><th>%</th><th>Of amount $</th><th class="r">Fee $</th></tr></thead>
            <tbody>${commRows}
              <tr><td>Other</td><td colspan="2"><input class="cell" data-path="comm.otherDesc" value="${esc(f.comm.otherDesc)}" placeholder="Please specify" /></td>
                <td class="r"><input class="cell r" data-path="comm.otherFee" value="${esc(f.comm.otherFee)}" placeholder="0.00" /></td></tr>
              <tr><td colspan="3"><div class="feeChoice">
                <label class="chk"><input type="radio" name="fee" id="feeAdmin" ${f.comm.adminFee && !f.comm.marketingFeeInstead?"checked":""} /><span>Administration fee ($500)</span></label>
                <label class="chk"><input type="radio" name="fee" id="feeMkt" ${f.comm.marketingFeeInstead?"checked":""} /><span>Marketing fee ($500) — Job no.</span></label>
                ${f.comm.marketingFeeInstead?`<input class="cell jobNo" data-path="comm.marketingJobNo" value="${esc(f.comm.marketingJobNo)}" placeholder="Job no." />`:""}
              </div></td><td class="r mono">500.00</td></tr>
              <tr><td>Recover marketing costs</td><td><input class="cell" data-path="comm.recoverJobNo" value="${esc(f.comm.recoverJobNo)}" placeholder="Job no." /></td><td></td>
                <td class="r"><input class="cell r" data-path="comm.recoverMarketing" value="${esc(f.comm.recoverMarketing)}" placeholder="0.00" /></td></tr>
              <tr><td>Recover other costs</td><td colspan="2"><input class="cell" data-path="comm.recoverOtherDesc" value="${esc(f.comm.recoverOtherDesc)}" placeholder="Please specify" /></td>
                <td class="r"><input class="cell r" data-path="comm.recoverOther" value="${esc(f.comm.recoverOther)}" placeholder="0.00" /></td></tr>
            </tbody>
            <tfoot><tr><td colspan="3">Total amount to be invoiced (excl GST)</td><td class="r mono total">$${fmt(d.totalInvoice)}</td></tr></tfoot></table>`)}

          ${section("9","Commission split","Percentages (incl. third-party) must total 100%. Amounts calculate from the invoice total.",`
            <table class="tbl"><thead><tr><th>Salesperson</th><th>%</th><th class="r">Amount $</th></tr></thead><tbody>${splitRows}</tbody></table>
            <h3 class="subHead">Third party / other office <span class="dim">(request invoices for conjunctional / referral fees)</span></h3>
            <table class="tbl"><tbody>${tpRows}</tbody></table>
            <div class="splitStatus ${d.splitPctTotal===0?"":d.splitsOk?"ok":"bad"}">Split total: ${d.splitPctTotal.toFixed(2)}%${d.splitPctTotal!==0?(d.splitsOk?" ✓":" — must equal 100%"):""}</div>`)}

          ${section("10","Press release paragraph","Minimum 20 words describing the deal.",`
            <textarea rows="4" data-path="press.text" placeholder="e.g. Colliers has negotiated the sale of a 2,450sqm freehold industrial facility in Hornby…">${esc(f.press.text)}</textarea>
            <div class="pressRow"><span class="${d.pressWords>=20?"ok":"dim"}">${d.pressWords} / 20 words</span>${chk("press.confidential","Confidential — not for release without broker approval")}</div>`)}

          ${section("11","Buyer & listing source","",`<div class="grid">
            ${sel("buyerSource","Buyer source",BUYER)}${f.buyerSource==="Other"?txt("buyerSourceOther","Other — specify",{span:2}):""}</div>
            <div class="grid" style="margin-top:8px">${sel("listingSource","Listing source",LISTING)}
            ${f.listingSource==="Referral"?txt("listingReferralWho","Referral — who")+sel("listingReferralInternal","Internal referral",["Yes","No"]):""}
            ${f.listingSource==="Other"?txt("listingOther","Other — specify",{span:2}):""}</div>`)}

          ${section("12","Mandatory checklist","The invoice will not be raised unless all relevant boxes are ticked.",`<div class="checkStack">
            ${chk("checklist.agencyAgreement","Signed agency agreement attached")}
            ${chk("checklist.unconditionalConfirmation","Confirmation of unconditional attached (from vendor or vendor's solicitor)")}
            ${chk("checklist.salePriceConfirmation","Confirmation of sale price attached (e.g. first page of the S&P agreement)")}
            ${chk("checklist.marketingReport","Marketing campaign report attached")}
            ${f.depositToTrust?chk("checklist.spAgreement","Trust deal — sale and purchase agreement attached"):""}</div>`)}

          ${section("13","Broker sign-off","",`<div class="grid">
            ${txt("brokerName","Signed for broker",{ph:"Full name",span:2,req:true})}
            <label class="fld"><span class="lbl">Date</span><input disabled value="${new Date().toLocaleDateString("en-NZ")}" /></label></div>
            <p class="note" style="margin-top:8px">Manager approval to pay commission is completed by accounts / management after submission.</p>`)}
        </main>

        <aside class="rail"><div class="railCard">
          <h3>Deal summary</h3>
          <dl>
            <div><dt>Property</dt><dd>${f.property.address?esc(f.property.address):"—"}</dd></div>
            <div><dt>Vendor</dt><dd>${esc(f.vendor.name||"—")}</dd></div>
            <div><dt>Sale price</dt><dd>${d.salePrice?"$"+fmt(d.salePrice):"—"}</dd></div>
            <div><dt>${f.sale.rentalBasis} yield</dt><dd>${d.yieldPct?d.yieldPct.toFixed(2)+"%":"—"}</dd></div>
            <div class="hl"><dt>Total to invoice</dt><dd>$${fmt(d.totalInvoice)}</dd></div>
            <div><dt>Split total</dt><dd class="${d.splitPctTotal&&!d.splitsOk?"bad":""}">${d.splitPctTotal.toFixed(0)}%</dd></div>
          </dl>
          <div class="readiness">${missing.length===0?'<span class="ok">✓ Ready to send</span>':`${missing.length} item${missing.length===1?"":"s"} outstanding`}</div>
          <button class="primary" id="sendBtn">Send to accounts</button>
          <div class="saveState" id="saveState">${saveState}</div>
          <p class="tiny">Sends the completed deal sheet to accounts for File No. / Deal No. assignment, invoicing and commission processing.</p>
        </div></aside>
      </div>

      <div class="overlay hidden" id="confirmModal"><div class="modal">
        <h3>Confirm and send to accounts</h3>
        <dl>
          <div><dt>Property</dt><dd>${esc(f.property.address||"—")}</dd></div>
          <div><dt>Vendor</dt><dd>${esc(f.vendor.name)}</dd></div>
          <div><dt>Sale price (excl GST)</dt><dd>$${fmt(d.salePrice)}</dd></div>
          <div><dt>Total to invoice (excl GST)</dt><dd>$${fmt(d.totalInvoice)}</dd></div>
          <div><dt>Broker</dt><dd>${esc(f.brokerName)}</dd></div>
        </dl>
        <p class="tiny">Once sent, changes must go through accounts. Check the figures above carefully.</p>
        <div class="modalBtns"><button class="ghost" id="cancelSend">Back to editing</button>
        <button class="primary" id="confirmSend">Confirm — send to accounts</button></div>
      </div></div>`;

    wire();
  }

  // ---------- event wiring (delegated where possible) ----------
  function wire() {
    $("app").querySelectorAll("[data-path]").forEach((el) => {
      const path = el.dataset.path;
      if (el.type === "checkbox") el.onchange = () => set(path, el.checked);
      else if (el.tagName === "TEXTAREA") el.oninput = () => setNoRender(path, el.value);
      else el.oninput = () => setNoRender(path, el.value);
      // re-render on blur / change for selects & date pickers
      if (el.tagName === "SELECT" || el.type === "date") el.onchange = () => set(path, el.value);
    });

    const feeAdmin = $("feeAdmin"), feeMkt = $("feeMkt");
    if (feeAdmin) feeAdmin.onchange = () => { state.f.comm.adminFee = true; state.f.comm.marketingFeeInstead = false; scheduleAutosave(); render(); };
    if (feeMkt) feeMkt.onchange = () => { state.f.comm.marketingFeeInstead = true; state.f.comm.adminFee = false; scheduleAutosave(); render(); };

    setupPropertySearch();

    $("sendBtn").onclick = onSend;
    const cm = $("confirmModal");
    $("cancelSend").onclick = () => cm.classList.add("hidden");
    $("confirmSend").onclick = doSubmit;
    cm.onclick = (e) => { if (e.target === cm) cm.classList.add("hidden"); };
  }

  // update value without a full re-render (avoids caret jump while typing);
  // recompute only the summary + save.
  function setNoRender(path, val) {
    const keys = path.split("."); let o = state.f;
    for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
    o[keys[keys.length - 1]] = val;
    scheduleAutosave();
    refreshDerivedOnly();
  }
  function refreshDerivedOnly() {
    // lightweight: re-render fully but preserve focus
    const active = document.activeElement;
    const path = active?.dataset?.path;
    const selStart = active?.selectionStart, selEnd = active?.selectionEnd;
    render();
    if (path) {
      const again = $("app").querySelector(`[data-path="${CSS.escape(path)}"]`);
      if (again) { again.focus(); try { again.setSelectionRange(selStart, selEnd); } catch {} }
    }
  }

  // ---------- PropCMA search ----------
  function setupPropertySearch() {
    const input = $("cmaSearch"), box = $("cmaResults");
    if (!input) return;
    let t = null;
    input.oninput = () => {
      state.f.cmaLabel = input.value;
      clearTimeout(t);
      const q = input.value.trim();
      if (q.length < 2) { box.classList.add("hidden"); return; }
      t = setTimeout(async () => {
        try {
          const results = await api.searchProperties(q);
          if (!results.length) { box.innerHTML = `<button disabled>No matches</button>`; box.classList.remove("hidden"); return; }
          box.innerHTML = results.map((r, i) =>
            `<button data-idx="${i}">${esc(r.label)}${r.propertyType?` <span class="dim">· ${esc(r.propertyType)}</span>`:""}</button>`).join("");
          box.classList.remove("hidden");
          box.querySelectorAll("button[data-idx]").forEach((b) => {
            b.onclick = () => { linkProperty(results[+b.dataset.idx]); box.classList.add("hidden"); };
          });
        } catch (e) { box.innerHTML = `<button disabled>Search unavailable</button>`; box.classList.remove("hidden"); }
      }, 250);
    };
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".searchWrap")) box.classList.add("hidden");
    });
  }

  function linkProperty(p) {
    const f = state.f;
    f.propertyId = p.id;
    f.cmaLabel = p.label;
    if (p.address) f.property.address = p.address;
    if (p.propertyType) f.property.propertyType = p.propertyType;
    if (p.landArea) f.sale.landArea = p.landArea;          // PropCMA "SQM"
    if (p.occupiedArea) f.sale.occupiedArea = p.occupiedArea; // PropCMA "Land Area (SQM)"
    if (p.wale) f.sale.wale = p.wale;
    if (p.yield) f.sale.yieldManual = p.yield;             // overrides the calc
    if (p.annualRent) f.sale.rentalIncome = p.annualRent;
    // Notes -> press release paragraph (only if the broker hasn't written one)
    if (p.notes && !f.press.text.trim()) f.press.text = p.notes;
    scheduleAutosave();
    render();
  }

  // ---------- submit ----------
  function onSend() {
    const d = derive();
    const missing = validate(d);
    state.triedSubmit = true;
    if (missing.length) { window.scrollTo({ top: 0, behavior: "smooth" }); render(); return; }
    $("confirmModal").classList.remove("hidden");
  }

  async function doSubmit() {
    $("confirmSend").disabled = true;
    try {
      await api.saveDraft(state.f, state.currentId).then((r) => (state.currentId = r.id));
      await api.submit(state.currentId);
      showDone();
    } catch (e) {
      $("confirmModal").classList.add("hidden");
      state.triedSubmit = true;
      if (e.missing) { render(); window.scrollTo({ top: 0, behavior: "smooth" }); }
      else alert("Could not send: " + e.message);
    } finally {
      const b = $("confirmSend"); if (b) b.disabled = false;
    }
  }

  function showDone() {
    const d = derive(), f = state.f;
    $("app").innerHTML = `<div class="done">
      <div class="doneMark">✓</div>
      <h1>Deal sheet sent to accounts</h1>
      <p><strong>${esc(f.property.address||"—")}</strong> — sale price $${fmt(d.salePrice)}, total to invoice $${fmt(d.totalInvoice)} excl GST.</p>
      <p class="dim">Accounts will assign the File No. and Deal No., raise the invoice and process commission. You'll be copied on the confirmation.</p>
      <button class="ghost" id="againBtn">Start a new deal sheet</button></div>`;
    $("againBtn").onclick = () => location.reload();
  }

  // ---------- boot ----------
  (async function boot() {
    if (cfg.DEMO_MODE) $("demoBadge").classList.remove("hidden");
    try {
      const account = await window.DealSheetAuth.init();
      if (!account) return; // redirecting to sign in
      if (account.name) state.f.ownership.salesperson = state.f.ownership.salesperson || "";
    } catch (e) {
      $("gate").innerHTML = `<div class="inner">Sign-in failed: ${esc(e.message)}</div>`;
      return;
    }
    $("gate").classList.add("hidden");
    $("app").classList.remove("hidden");
    render();
  })();
})();
