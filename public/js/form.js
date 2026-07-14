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
  const BROKERS = [
    { code:"AS", name:"Angus" },{ code:"AB", name:"Annabelle" },{ code:"BC", name:"Ben" },
    { code:"BB", name:"Brynn" },{ code:"CK", name:"Christian" },{ code:"CD", name:"Courtney" },
    { code:"ES", name:"Ed" },{ code:"EC", name:"Elliot" },{ code:"GS", name:"Gary" },
    { code:"GB", name:"Greg" },{ code:"HD", name:"Hamish" },{ code:"HP", name:"Harry" },
    { code:"HW", name:"Helen" },{ code:"JM", name:"Jackson" },{ code:"LM", name:"Lachlan" },
    { code:"LT", name:"Lane" },{ code:"LW", name:"Luke" },{ code:"MO", name:"Marius" },
    { code:"MM", name:"Mark" },{ code:"ML", name:"Michael" },{ code:"ND", name:"Nick" },
    { code:"NG", name:"Noel" },{ code:"OS", name:"Oliver" },{ code:"PM", name:"Paul" },
    { code:"PC", name:"Phil" },{ code:"RM", name:"Rory" },{ code:"SR", name:"Sally" },
    { code:"SS", name:"Sam" },{ code:"TL", name:"Tom" },{ code:"WF", name:"Will" },
  ];
  const TITLES = ["Freehold","Strata","Leasehold"];
  const PAY = ["Direct credit","Cheque","International transfer"];
  const BUYER = ["Advert","Sign","Website","Relationship","Target mailing","Referral","Canvassing","Other"];
  const LISTING = ["Referral","Canvassing","Relationship","Other"];

  const state = {
    currentId: null,
    saveTimer: null,
    f: {
      propertyId: null,
      ownership: { salespeople: [], division: "Industrial", office: "Christchurch" },
      cmaLabel: "",
      property: { address:"", buildingName:"", propertyType:"", level:"", city:"Christchurch" },
      vendor: { name:"", phone:"", contactName:"", email:"", postalAddress:"", postcode:"", city:"", country:"NZ", fax:"", solicitorName:"", solicitorFirm:"", solicitorPhone:"", vendorGroup:"" },
      billingDifferent: false,
      billing: { name:"", phone:"", contactName:"", email:"", postalAddress:"", postcode:"", city:"", country:"NZ", fax:"" },
      invoicePurchaser: false,
      purchaser: { name:"", phone:"", contactName:"", email:"", postalAddress:"", postcode:"", city:"", country:"NZ", fax:"", solicitorName:"", solicitorFirm:"", solicitorPhone:"" },
      sale: { dateOfAgreement:"", unconditionalDate:"", salePrice:"", rentalBasis:"Net", rentalIncome:"", yieldManual:"", titleType:"Freehold", landArea:"", wale:"", tenancies:"", occupiedArea:"", auction:false, tenancySchedule:false },
      depositToTrust: false,
      deposit: { amount:"", dateReceived:"", method:"Direct credit", receiptNo:"", earlyRelease:false, vendorAuthSent:false, vendorAuthReceived:false, purchaserAuthSent:false, purchaserAuthReceived:false },
      comm: { tiers:[{pct:"",base:""},{pct:"",base:""},{pct:"",base:""}], otherDesc:"", otherFee:"", adminFee:true, marketingFee:false, marketingJobNo:"", recoverMarketing:"", recoverJobNo:"", recoverOtherDesc:"", recoverOther:"" },
      splits: [ {person:"",pct:""},{person:"",pct:""},{person:"",pct:""},{person:"",pct:""},{person:"",pct:""} ],
      thirdParty: [ {name:"",pct:""},{name:"",pct:""},{name:"",pct:""} ],
      press: { text:"", confidential:false },
      buyerSource:"", buyerSourceOther:"",
      listingSource:"", listingReferralWho:"", listingReferralInternal:"Yes", listingOther:"",
      checklist: { agencyAgreement:false, unconditionalConfirmation:false, salePriceConfirmation:false, marketingReport:false, spAgreement:false },
      attachments: {},  // { slotKey: { name, path, size } } populated after upload
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
    const fixedFee = (f.comm.adminFee ? 500 : 0) + (f.comm.marketingFee ? 500 : 0);
    const totalInvoice = tierFees.reduce((a,b)=>a+b,0) + num(f.comm.otherFee) + fixedFee + num(f.comm.recoverMarketing) + num(f.comm.recoverOther);
    const allSplits = [...f.splits, ...f.thirdParty];
    const splitPctTotal = allSplits.reduce((a,s)=>a+num(s.pct),0);
    const splitsOk = splitPctTotal === 0 || Math.abs(splitPctTotal-100) < 0.01;
    const pressWords = f.press.text.trim() ? f.press.text.trim().split(/\s+/).length : 0;
    return { salePrice, yieldCalc, yieldPct, tierFees, fixedFee, totalInvoice, splitPctTotal, splitsOk, pressWords };  }

  function validate(d) {
    const f = state.f, m = [];
    if (!f.ownership.salespeople.length) m.push("Salesperson");
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
    ${txt(base+".city","City")}${txt(base+".country","Country")}
    ${solicitor ? txt(base+".solicitorName","Solicitor")+txt(base+".solicitorFirm","Firm")+txt(base+".solicitorPhone","Solicitor phone") : ""}
  </div>`;
  const section = (n, title, note, inner) => `<section class="card"><header class="cardHead">
    <span class="secNo">${n}</span><div><h2>${title}</h2>${note?`<p class="note">${note}</p>`:""}</div></header>${inner}</section>`;

  // When yield isn't manually set, show the live calc as the input's placeholder.
  function yieldCalcPlaceholder(d) {
    return d.yieldCalc ? `auto: ${d.yieldCalc.toFixed(2)}` : "auto-calculated";
  }

  // File attachment slot: shows attach button, or the attached file with a remove option.
  function uploadSlot(slotKey, label) {
    const a = state.f.attachments[slotKey];
    if (a) {
      return `<div class="upSlot done" data-slot="${slotKey}">
        <span class="upFile">📎 ${esc(a.name)}</span>
        <button type="button" class="upRemove" data-slot="${slotKey}">Remove</button></div>`;
    }
    return `<div class="upSlot" data-slot="${slotKey}">
      <label class="upBtn">Attach file<input type="file" class="upInput" data-slot="${slotKey}" hidden /></label>
      <span class="upHint">${label}</span>
      <span class="upProgress hidden" data-slot="${slotKey}">Uploading…</span></div>`;
  }

  // ---------- render ----------
  function render() {
    const d = derive();
    const missing = validate(d);
    const f = state.f;

    const commRows = ["Commission","Second tier","Third tier"].map((label,i) => `<tr>
      <td>${label}</td>
      <td><input class="cell" data-recalc data-path="comm.tiers.${i}.pct" value="${esc(f.comm.tiers[i].pct)}" placeholder="%" /></td>
      <td><input class="cell" data-recalc data-path="comm.tiers.${i}.base" value="${esc(i===0 && !f.comm.tiers[i].base ? (d.salePrice?fmt(d.salePrice):"") : f.comm.tiers[i].base)}" placeholder="${i===0?"Sale price":"Amount"}" /></td>
      <td class="r mono">${d.tierFees[i]?fmt(d.tierFees[i]):"—"}</td></tr>`).join("");

    // Section 9 split dropdowns offer only the brokers chosen in section 1
    const dealBrokers = BROKERS.filter((b) => f.ownership.salespeople.includes(b.code));
    const splitRows = f.splits.map((s,i) => `<tr>
      <td><select class="cell" data-path="splits.${i}.person">
        <option value="">${dealBrokers.length?"Select…":"Add salespeople in section 1"}</option>
        ${dealBrokers.map((b) => `<option value="${esc(b.name)}" ${s.person===b.name?"selected":""}>${esc(b.name)}</option>`).join("")}
        </select></td>
      <td><input class="cell" data-recalc data-path="splits.${i}.pct" value="${esc(s.pct)}" placeholder="%" /></td>
      <td class="r mono">${num(s.pct)?fmt((num(s.pct)/100)*d.totalInvoice):"—"}</td></tr>`).join("");
    const tpRows = f.thirdParty.map((s,i) => `<tr>
      <td><input class="cell" data-path="thirdParty.${i}.name" value="${esc(s.name)}" placeholder="Office / party" /></td>
      <td><input class="cell" data-recalc data-path="thirdParty.${i}.pct" value="${esc(s.pct)}" placeholder="%" /></td>
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
          ${section("1","Deal ownership","Select every salesperson working this deal. Commission splits (section 9) can only be assigned to these people.",`
            <div class="grid">
              ${sel("ownership.division","Division",DIVISIONS)}${txt("ownership.office","Office")}
            </div>
            <div class="brokerPick">
              <span class="lbl">Salesperson<em class="req">*</em>
                <span class="dim">${f.ownership.salespeople.length} selected</span></span>
              <div class="brokerGrid">
                ${BROKERS.map((b) => `<label class="brokerChip ${f.ownership.salespeople.includes(b.code)?"on":""}">
                  <input type="checkbox" class="brokerBox" value="${b.code}" ${f.ownership.salespeople.includes(b.code)?"checked":""} />
                  <span>${esc(b.name)}</span></label>`).join("")}
              </div>
            </div>`)}

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
            <div style="margin-top:10px">${chk("sale.auction","Sold at auction")}</div>
            <div style="margin-top:10px">${chk("sale.tenancySchedule","Tenancy schedule attached (if available)")}
              ${uploadSlot("tenancySchedule","optional — PDF or Excel")}</div>`)}

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
                <label class="chk"><input type="checkbox" id="feeAdmin" ${f.comm.adminFee?"checked":""} /><span>Administration fee ($500)</span></label>
                <label class="chk"><input type="checkbox" id="feeMkt" ${f.comm.marketingFee?"checked":""} /><span>Marketing fee ($500) — Job no.</span></label>
                ${f.comm.marketingFee?`<input class="cell jobNo" data-path="comm.marketingJobNo" value="${esc(f.comm.marketingJobNo)}" placeholder="Job no." />`:""}
              </div></td><td class="r mono">${fmt(d.fixedFee)}</td></tr>
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

          ${section("12","Mandatory checklist","Tick each item. You may optionally attach the document — accounts can download it.",`<div class="checkStack">
            <div class="checkRow">${chk("checklist.agencyAgreement","Signed agency agreement attached")}${uploadSlot("agencyAgreement","")}</div>
            <div class="checkRow">${chk("checklist.unconditionalConfirmation","Confirmation of unconditional attached (from vendor or vendor's solicitor)")}${uploadSlot("unconditionalConfirmation","")}</div>
            <div class="checkRow">${chk("checklist.salePriceConfirmation","Confirmation of sale price attached (e.g. first page of the S&P agreement)")}${uploadSlot("salePriceConfirmation","")}</div>
            <div class="checkRow">${chk("checklist.marketingReport","Marketing campaign report attached")}${uploadSlot("marketingReport","")}</div>
            ${f.depositToTrust?`<div class="checkRow">${chk("checklist.spAgreement","Trust deal — sale and purchase agreement attached")}${uploadSlot("spAgreement","")}</div>`:""}</div>`)}

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
      if (el.type === "checkbox") {
        el.onchange = () => set(path, el.checked);
      } else if (el.tagName === "SELECT" || el.type === "date") {
        // no typing caret to preserve — safe to re-render
        el.onchange = () => set(path, el.value);
      } else {
        // text / textarea: update state + summary only, NEVER re-render
        // the form while typing (that was reversing text as the caret
        // jumped back to the start on each keystroke)
        el.oninput = () => setNoRender(path, el.value);
        // numeric fields that drive table amounts recalc on blur
        if (el.hasAttribute("data-recalc")) el.onchange = () => set(path, el.value);
      }
    });

    const feeAdmin = $("feeAdmin"), feeMkt = $("feeMkt");
    if (feeAdmin) feeAdmin.onchange = () => { state.f.comm.adminFee = feeAdmin.checked; scheduleAutosave(); render(); };
    if (feeMkt) feeMkt.onchange = () => { state.f.comm.marketingFee = feeMkt.checked; scheduleAutosave(); render(); };

    // Broker multi-select
    $("app").querySelectorAll(".brokerBox").forEach((box) => {
      box.onchange = () => {
        const code = box.value;
        const list = state.f.ownership.salespeople;
        if (box.checked) {
          if (!list.includes(code)) list.push(code);
        } else {
          state.f.ownership.salespeople = list.filter((c) => c !== code);
          // clear any split row assigned to a broker no longer on the deal
          const name = (BROKERS.find((b) => b.code === code) || {}).name;
          state.f.splits.forEach((s) => { if (s.person === name) { s.person = ""; } });
        }
        scheduleAutosave();
        render();
      };
    });

    setupPropertySearch();
    setupUploads();

    $("sendBtn").onclick = onSend;
    const cm = $("confirmModal");
    $("cancelSend").onclick = () => cm.classList.add("hidden");
    $("confirmSend").onclick = doSubmit;
    cm.onclick = (e) => { if (e.target === cm) cm.classList.add("hidden"); };
  }

  // Update value without touching the form DOM, so the caret stays put.
  // Only the summary rail's derived numbers refresh.
  function setNoRender(path, val) {
    const keys = path.split("."); let o = state.f;
    for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
    o[keys[keys.length - 1]] = val;
    scheduleAutosave();
    updateSummary();
  }

  // Recompute and patch just the summary rail + readiness, in place.
  function updateSummary() {
    const d = derive();
    const missing = validate(d);
    const f = state.f;
    const rail = $("app").querySelector(".railCard");
    if (!rail) return;
    const dds = rail.querySelectorAll("dl dd");
    // order matches the summary dl below: property, vendor, sale price, yield, total, split
    if (dds[0]) dds[0].textContent = f.property.address || "—";
    if (dds[1]) dds[1].textContent = f.vendor.name || "—";
    if (dds[2]) dds[2].textContent = d.salePrice ? "$" + fmt(d.salePrice) : "—";
    if (dds[3]) dds[3].textContent = d.yieldPct ? d.yieldPct.toFixed(2) + "%" : "—";
    if (dds[4]) dds[4].textContent = "$" + fmt(d.totalInvoice);
    if (dds[5]) { dds[5].textContent = d.splitPctTotal.toFixed(0) + "%"; dds[5].className = d.splitPctTotal && !d.splitsOk ? "bad" : ""; }
    const readiness = rail.querySelector(".readiness");
    if (readiness) readiness.innerHTML = missing.length === 0
      ? '<span class="ok">✓ Ready to send</span>'
      : `${missing.length} item${missing.length===1?"":"s"} outstanding`;
  }

  // ---------- file uploads ----------
  function setupUploads() {
    $("app").querySelectorAll(".upInput").forEach((inp) => {
      inp.onchange = async () => {
        const file = inp.files && inp.files[0];
        if (!file) return;
        const slot = inp.dataset.slot;
        await uploadFile(slot, file);
      };
    });
    $("app").querySelectorAll(".upRemove").forEach((btn) => {
      btn.onclick = async () => {
        const slot = btn.dataset.slot;
        try { await api.removeAttachment(state.currentId, slot); } catch (e) { /* ignore */ }
        delete state.f.attachments[slot];
        scheduleAutosave();
        render();
      };
    });
  }

  async function uploadFile(slot, file) {
    // ensure the deal has an id to attach to
    if (!state.currentId) {
      try { const r = await api.saveDraft(state.f, null); state.currentId = r.id; }
      catch (e) { alert("Couldn't start a draft to attach to: " + e.message); return; }
    }
    const prog = $("app").querySelector(`.upProgress[data-slot="${slot}"]`);
    if (prog) prog.classList.remove("hidden");
    try {
      const meta = await api.uploadAttachment(state.currentId, slot, file);
      state.f.attachments[slot] = { name: meta.name, path: meta.path, size: meta.size };
      scheduleAutosave();
      render();
    } catch (e) {
      if (prog) prog.classList.add("hidden");
      alert("Upload failed: " + e.message);
    }
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
    } catch (e) {
      $("gate").innerHTML = `<div class="inner">Sign-in failed: ${esc(e.message)}</div>`;
      return;
    }
    $("gate").classList.add("hidden");
    $("app").classList.remove("hidden");
    render();
  })();
})();
