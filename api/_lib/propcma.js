// /api/_lib/propcma.js
//
// When accounts marks a deal INVOICED, the completed sale is written
// into PropCMA's `properties` table (the Summary All Years comparables
// data) as a NEW row. Existing rows are never modified — a deal sheet
// may be *linked* to a past comparable, but that comparable is
// reference data and must not be overwritten.
//
// Excel (`Sales Data Colliers.xlsx`) is NOT written directly here —
// the existing PropCMA Graph sync carries Supabase changes through.
//
// Broker code -> first name, for the "Broker" column.

import { supabase } from "./supabase.js";

const BROKER_NAMES = {
  AS: "Angus", AB: "Annabelle", BC: "Ben", BB: "Brynn", CK: "Christian",
  CD: "Courtney", ES: "Ed", EC: "Elliot", GS: "Gary", GB: "Greg",
  HD: "Hamish", HP: "Harry", HW: "Helen", JM: "Jackson", LM: "Lachlan",
  LT: "Lane", LW: "Luke", MO: "Marius", MM: "Mark", ML: "Michael",
  ND: "Nick", NG: "Noel", OS: "Oliver", PM: "Paul", PC: "Phil",
  RM: "Rory", SR: "Sally", SS: "Sam", TL: "Tom", WF: "Will",
};

const num = (v) => {
  const n = parseFloat(String(v ?? "").replace(/[$,\s]/g, ""));
  return isNaN(n) ? null : n;
};

/**
 * Build the properties row from a deal_sheets record.
 * `newId` comes from next_ds_property_id() — e.g. 'ds_2313'.
 * Existing Excel-imported rows use the 'xl_' prefix; the 'ds_'
 * prefix marks rows created by the deal sheet.
 */
export function toPropertyRow(deal, newId) {
  const form = deal.form || {};
  const sale = form.sale || {};

  const salePrice = num(deal.sale_price_ex_gst) ?? num(sale.salePrice);
  const sqm = num(sale.landArea);              // form "Land area" -> PropCMA "SQM"
  const landAreaSqm = num(sale.occupiedArea);  // form "Occupied by area" -> PropCMA "Land Area (SQM)"
  const annualRent = num(sale.rentalIncome);

  // Yield: use the broker's entered/pre-filled value, else compute it.
  const yieldPct = sale.yieldManual !== "" && sale.yieldManual != null
    ? num(sale.yieldManual)
    : (salePrice && annualRent ? +((annualRent / salePrice) * 100).toFixed(2) : null);

  // Conjunction: Yes when any third party holds a commission share.
  const hasThirdParty = (form.thirdParty || []).some((t) => num(t.pct) > 0);

  // Brokers: full first names, comma separated.
  const brokers = (form.ownership?.salespeople || [])
    .map((code) => BROKER_NAMES[code] || code)
    .join(", ");

  return {
    id: newId,
    "Sale Date": sale.unconditionalDate || sale.dateOfAgreement || null,
    "Address": deal.property_address || form.property?.address || null,
    "Name of Vendor/Landlord": deal.vendor_name || null,
    "Name of Purchaser/Tenant": deal.purchaser_name || null,
    "Conjunction": hasThirdParty ? "Yes" : "No",
    "Lease/Sale": "Sale",           // deal sheet is the Sales Record
    "Auction": sale.auction ? "Yes" : "No",
    "Category": form.property?.propertyType || null,
    "SQM": sqm,
    "Sale Price": salePrice,
    "Price per SQM": salePrice && sqm ? +(salePrice / sqm).toFixed(2) : null,
    "Broker": brokers || null,
    "Notes": form.press?.text || null,
    "Land Area (SQM)": landAreaSqm,
    "Annual Rent ($)": annualRent,
    "Initial Yield (%)": yieldPct,
    "WALE (Years)": num(sale.wale),
    // "Photos" intentionally left unset — PropCMA's own workflow owns it.
  };
}

/**
 * Insert the invoiced deal into `properties`.
 * Returns { ok, id } — never throws into the caller's transition,
 * because invoicing must not fail over a comparables write.
 */
export async function pushToPropCMA(deal) {
  // properties.id is text with no database default, so we supply one.
  // next_ds_property_id() is backed by a Postgres sequence (atomic —
  // concurrent invoices cannot collide) and yields e.g. 'ds_2313'.
  const { data: idData, error: idErr } = await supabase.rpc("next_ds_property_id");
  if (idErr || !idData) {
    console.error("PropCMA id generation failed", { dealId: deal.id, error: idErr });
    return { ok: false, error: idErr?.message || "Could not generate property id" };
  }
  const newId = idData;

  const row = toPropertyRow(deal, newId);

  const { error } = await supabase.from("properties").insert(row);
  if (error) {
    console.error("PropCMA insert failed", { dealId: deal.id, error });
    return { ok: false, error: error.message };
  }
  return { ok: true, id: newId };
}
