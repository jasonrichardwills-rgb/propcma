// /api/_lib/excel.js
//
// Appends an invoiced deal as a new row to the "Summary All Years"
// worksheet in Sales Data Colliers.xlsx (SharePoint · BrokerToolKit),
// via Microsoft Graph. Called alongside the Supabase properties write
// on invoicing; non-fatal, so a failure never blocks the invoice.
//
// Requires the application permission Sites.Selected (granted on the
// BrokerToolKit site) or Sites.ReadWrite.All, with admin consent.
//
// The sheet is plain rows (no Excel table), so we append to the used
// range. Column order is FIXED by the sheet layout (A–U) — if someone
// reorders columns in Excel, this mapping must be updated to match.

import { graphToken } from "./graph.js";

// --- file coordinates (from the SharePoint URL) ---
const SP_HOST = "cjch.sharepoint.com";
const SP_SITE_PATH = "/sites/BrokerToolKit";
const FILE_NAME = "Sales Data Colliers.xlsx";
const WORKSHEET = "Summary All Years";

const num = (v) => {
  const n = parseFloat(String(v ?? "").replace(/[$,\s]/g, ""));
  return isNaN(n) ? null : n;
};

/**
 * Build the A–U row array for the Excel sheet from an invoiced deal.
 * brokerNames maps broker codes -> first names.
 *
 * NOTE the deliberately crossed area mapping (matches Supabase):
 *   Column I "SQM"            <- deal sheet "Land area (sqm)"
 *   Column Q "Land Area (SQM)"<- deal sheet "Occupied by area (sqm)"
 * The Excel labels read backwards vs the deal-sheet fields, but the
 * data lands where the business wants it.
 */
export function toExcelRow(deal, newId, brokerNames = {}) {
  const form = deal.form || {};
  const sale = form.sale || {};

  const salePrice = num(deal.sale_price_ex_gst) ?? num(sale.salePrice);
  const sqm = num(sale.landArea);            // -> column I "SQM"
  const occupied = num(sale.occupiedArea);   // -> column Q "Land Area (SQM)"
  const annualRent = num(sale.rentalIncome);
  const yieldPct = sale.yieldManual !== "" && sale.yieldManual != null
    ? num(sale.yieldManual)
    : (salePrice && annualRent ? +((annualRent / salePrice) * 100).toFixed(2) : null);

  const category = form.ownership?.division === "Investment Sales"
    ? "Investment" : (form.ownership?.division || null);

  // Up to four brokers, one per column L–O. Capped at 4 (sheet has
  // no more columns); any beyond the fourth are not written.
  const brokerNamesList = (form.ownership?.salespeople || [])
    .map((code) => brokerNames[code] || code);
  const b = [0, 1, 2, 3].map((i) => brokerNamesList[i] || null);

  const saleDate = sale.unconditionalDate || sale.dateOfAgreement || null;

  // Order MUST match columns A–U on "Summary All Years".
  return [
    newId,                                                   // A ID
    saleDate,                                                // B Sale Date
    deal.property_address || form.property?.address || null, // C Address
    deal.vendor_name || null,                                // D Vendor/Landlord
    deal.purchaser_name || null,                             // E Purchaser/Tenant
    "Sale",                                                  // F Lease/Sale
    sale.auction ? "Yes" : "No",                             // G Auction (Yes/No text)
    category,                                                // H Category
    sqm,                                                     // I SQM  (<- land area)
    salePrice,                                               // J Sale Price
    salePrice && sqm ? +(salePrice / sqm).toFixed(2) : null, // K Price per SQM
    b[0], b[1], b[2], b[3],                                  // L–O Broker 1–4
    null,                                                    // P Notes (blank)
    occupied,                                                // Q Land Area (<- occupied area)
    annualRent,                                              // R Annual Rent ($)
    yieldPct,                                                // S Initial Yield (%)
    null,                                                    // T Photos (blank)
    num(sale.wale),                                          // U WALE (Years)
  ];
}

async function graphGet(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Graph GET ${res.status}: ${await res.text()}`);
  return res.json();
}

/**
 * Append the invoiced deal to the Excel sheet.
 * Returns { ok, error? } — never throws into the caller.
 */
export async function appendToExcel(deal, newId, brokerNames = {}) {
  try {
    const token = await graphToken();

    // 1. Resolve the site, then the file (driveItem) by name in the
    //    site's default document library.
    const site = await graphGet(
      `https://graph.microsoft.com/v1.0/sites/${SP_HOST}:${SP_SITE_PATH}`,
      token
    );
    const drive = await graphGet(
      `https://graph.microsoft.com/v1.0/sites/${site.id}/drive`,
      token
    );
    // Find the workbook by name at the drive root (search is more
    // tolerant of folders than a fixed path).
    const search = await graphGet(
      `https://graph.microsoft.com/v1.0/drives/${drive.id}/root/search(q='${encodeURIComponent(FILE_NAME)}')`,
      token
    );
    const item = (search.value || []).find((f) => f.name === FILE_NAME);
    if (!item) throw new Error(`File not found: ${FILE_NAME}`);

    // 2. Find the current used range on the worksheet, so we know which
    //    row to write next.
    const used = await graphGet(
      `https://graph.microsoft.com/v1.0/drives/${drive.id}/items/${item.id}/workbook/worksheets/${encodeURIComponent(WORKSHEET)}/usedRange?$select=address,rowCount`,
      token
    );
    // usedRange address looks like "Summary All Years!A1:U57" — the next
    // free row is rowCount+1 (rowCount includes the header row).
    const m = /!\D+\d+:\D+(\d+)/.exec(used.address || "");
    const lastRow = m ? parseInt(m[1], 10) : 1;
    const nextRow = lastRow + 1;
    const targetAddress = `A${nextRow}:U${nextRow}`;

    // 3. Write the row.
    const row = toExcelRow(deal, newId, brokerNames);
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${drive.id}/items/${item.id}/workbook/worksheets/${encodeURIComponent(WORKSHEET)}/range(address='${encodeURIComponent(targetAddress)}')`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: [row] }),
      }
    );
    if (!res.ok) throw new Error(`Excel write ${res.status}: ${await res.text()}`);

    console.log("Excel append ok", { dealId: deal.id, row: nextRow });
    return { ok: true, row: nextRow };
  } catch (error) {
    console.error("Excel append failed", { dealId: deal.id, error: error.message });
    return { ok: false, error: error.message };
  }
}
