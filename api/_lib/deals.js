// /api/_lib/deals.js
// Server-side mirror of the form's maths and validation, so the
// stored figures are computed from the payload — never trusted
// from the client.

const num = (v) => {
  const n = parseFloat(String(v ?? "").replace(/[$,\s]/g, ""));
  return isNaN(n) ? 0 : n;
};

/** Recompute derived figures from the raw form payload. */
export function computeDerived(form) {
  const salePrice = num(form.sale?.salePrice);

  const tierFees = (form.comm?.tiers || []).map((t, i) => {
    const base = i === 0 && !t.base ? salePrice : num(t.base);
    return (num(t.pct) / 100) * base;
  });

  const fixedFee =
    form.comm?.marketingFeeInstead || form.comm?.adminFee ? 500 : 0;

  const totalInvoice =
    tierFees.reduce((a, b) => a + b, 0) +
    num(form.comm?.otherFee) +
    fixedFee +
    num(form.comm?.recoverMarketing) +
    num(form.comm?.recoverOther);

  const splits = [
    ...(form.splits || [])
      .filter((s) => num(s.pct) > 0)
      .map((s) => ({
        party_type: "salesperson",
        party_name: s.person || "(unnamed)",
        split_pct: num(s.pct),
        split_amount: +((num(s.pct) / 100) * totalInvoice).toFixed(2),
      })),
    ...(form.thirdParty || [])
      .filter((s) => num(s.pct) > 0)
      .map((s) => ({
        party_type: "third_party",
        party_name: s.name || "(unnamed)",
        split_pct: num(s.pct),
        split_amount: +((num(s.pct) / 100) * totalInvoice).toFixed(2),
      })),
  ];

  const splitPctTotal = splits.reduce((a, s) => a + s.split_pct, 0);

  return {
    salePrice: +salePrice.toFixed(2),
    totalInvoice: +totalInvoice.toFixed(2),
    splits,
    splitPctTotal,
  };
}

/** Denormalised columns written alongside the jsonb payload. */
export function toRow(form, derived) {
  const p = form.property || {};
  return {
    salesperson: form.ownership?.salesperson || null,
    division: form.ownership?.division || null,
    // Single free-text address, matching the PropCMA `Address` column
    // format (no consistent structure to split into parts).
    property_address: (p.address || "").trim() || null,
    suburb: null, // no longer captured separately
    city: p.city || null,
    vendor_name: form.vendor?.name || null,
    purchaser_name: form.purchaser?.name || null,
    date_of_agreement: form.sale?.dateOfAgreement || null,
    unconditional_date: form.sale?.unconditionalDate || null,
    sale_price_ex_gst: derived.salePrice || null,
    total_invoice_ex_gst: derived.totalInvoice || null,
    wale_years: form.sale?.wale ? parseFloat(String(form.sale.wale).replace(/[^\d.]/g, "")) || null : null,
    deposit_to_trust: !!form.depositToTrust,
    confidential: !!form.press?.confidential,
    property_id: form.propertyId || null, // uuid from PropCMA properties table
    form,
  };
}

/** Submit-time validation. Returns [] when ready. */
export function validateForSubmit(form, derived) {
  const missing = [];
  const words = (form.press?.text || "").trim().split(/\s+/).filter(Boolean).length;

  if (!form.ownership?.salesperson) missing.push("Salesperson");
  if (!form.property?.address || !form.property.address.trim()) missing.push("Property address");
  if (!form.vendor?.name) missing.push("Vendor name");
  if (!form.sale?.dateOfAgreement) missing.push("Date of agreement");
  if (!form.sale?.unconditionalDate) missing.push("Unconditional date");
  if (!derived.salePrice) missing.push("Sale price");
  if (!derived.totalInvoice) missing.push("Commission calculation");
  if (derived.splits.length === 0) missing.push("Commission split");
  else if (Math.abs(derived.splitPctTotal - 100) > 0.01)
    missing.push("Commission split must total 100%");
  if (words < 20) missing.push("Press release paragraph (20 words min)");
  if (!form.buyerSource) missing.push("Buyer source");
  if (!form.listingSource) missing.push("Listing source");

  const c = form.checklist || {};
  if (!c.agencyAgreement) missing.push("Checklist — signed agency agreement");
  if (!c.unconditionalConfirmation) missing.push("Checklist — confirmation of unconditional");
  if (!c.salePriceConfirmation) missing.push("Checklist — confirmation of sale price");
  if (!c.marketingReport) missing.push("Checklist — marketing campaign report");
  if (form.depositToTrust && !c.spAgreement)
    missing.push("Checklist — S&P agreement (trust deal)");
  if (!form.brokerName) missing.push("Broker sign-off");

  return missing;
}
