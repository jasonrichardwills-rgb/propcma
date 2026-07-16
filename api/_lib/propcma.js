// /api/_lib/propcma.js
//
// When accounts marks a deal INVOICED, the completed sale is written
// into PropCMA's `properties` table (the comparables data) as a NEW
// row. Existing rows are never modified — a deal sheet may be *linked*
// to a past comparable, but that comparable is reference data and must
// not be overwritten.
//
// Excel (`Sales Data Colliers.xlsx`) is NOT written directly here —
// the existing PropCMA Graph sync carries Supabase changes through.

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
 * Column names/types match the live PropCMA `properties` table
 * (snake_case; `auction` is boolean; there is no conjunction column).
 */
export function toPropertyRow(deal, newId) {
  const form = deal.form || {};
  const sale = form.sale || {};

  const salePrice = num(deal.sale_price_ex_gst) ?? num(sale.salePrice);
  const sqm = num(sale.landArea);              // form "Land area" -> sqm
  const landArea = num(sale.occupiedArea);     // form "Occupied by area" -> land_area
  const annualRent = num(sale.rentalIncome);

  const yieldPct = sale.yieldManual !== "" && sale.yieldManual != null
    ? num(sale.yieldManual)
    : (salePrice && annualRent ? +((annualRent / salePrice) * 100).toFixed(2) : null);

  const brokers = (form.ownership?.salespeople || [])
    .map((code) => BROKER_NAMES[code] || code)
    .join(", ");

  const saleDateIso = sale.unconditionalDate || sale.dateOfAgreement || null;
  const saleDateTs = saleDateIso ? Date.parse(saleDateIso) : null;

  return {
    id: newId,
    address: deal.property_address || form.property?.address || null,
    sale_date: saleDateIso,
    sale_date_ts: Number.isFinite(saleDateTs) ? saleDateTs : null,
    lease_or_sale: "Sale",
    auction: !!sale.auction,
    category: form.property?.propertyType || null,
    sqm: sqm,
    sale_price: salePrice,
    price_per_sqm: salePrice && sqm ? +(salePrice / sqm).toFixed(2) : null,
    purchaser: deal.purchaser_name || null,
    vendor: deal.vendor_name || null,
    initial_yield: yieldPct,
    annual_rent: annualRent,
    land_area: landArea,
    notes: form.press?.text || null,
    broker: brokers || null,
    wale: num(sale.wale),
    // `photos` left unset — PropCMA's own workflow owns it.
    // No conjunction column exists in `properties`.
  };
}

/**
 * Insert the invoiced deal into `properties`.
 * Returns { ok, id } — never throws into the caller's transition,
 * because invoicing must not fail over a comparables write.
 */
export async function pushToPropCMA(deal) {
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
