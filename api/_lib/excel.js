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
// From the SharePoint URL: ...sourcedoc={7F7A269A-2F6D-4F97-9575-1DEAA100EFBB}
// A stable id for the file that survives renames/moves.
const FILE_GUID = "7F7A269A-2F6D-4F97-9575-1DEAA100EFBB";
const WORKSHEET = "Summary All Years";

const num = (v) => {
  const n = parseFloat(String(v ?? "").replace(/[$,\s]/g, ""));
  return isNaN(n) ? null : n;
};

/**
 * Convert an ISO (yyyy-mm-dd) or other parseable date to an Excel serial
 * number — the number of days since 1899-12-30 (Excel's epoch, including
 * its deliberate 1900 leap-year bug).
 *
 * Writing a serial + applying a date number format means Excel stores a
 * REAL date rather than text. Text dates are ambiguous across locales
 * (7/3/2026 is 7 March in NZ but 3 July in the US) and read back as raw
 * numbers in downstream systems.
 */
function toExcelSerial(value) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  // Use UTC parts so a timezone offset can't shift the calendar day.
  const utc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const epoch = Date.UTC(1899, 11, 30);
  return Math.round((utc - epoch) / 86400000);
}

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
  if (deal.deal_type === "lease") return toLeaseExcelRow(deal, newId, brokerNames);

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

  const saleDateRaw = sale.unconditionalDate || sale.dateOfAgreement || null;
  const saleDate = toExcelSerial(saleDateRaw);   // Excel serial, not text

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

async function graphGet(url, token, step = "request") {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text();
    // Include the step so a failure names which call broke, not just "Graph GET 500".
    throw new Error(`Graph GET failed at [${step}] ${res.status}: ${body.slice(0, 300)}`);
  }
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
      token, "resolve site"
    );
    const drive = await graphGet(
      `https://graph.microsoft.com/v1.0/sites/${site.id}/drive`,
      token, "resolve drive"
    );
    // Find the workbook WITHOUT using /search — SharePoint's search
    // endpoint returns intermittent 500s (it depends on the search index
    // and behaves badly under Sites.Selected). Three strategies, cheapest
    // and most reliable first.
    let item = null;
    const attempts = [];

    // (a) By the document GUID from the SharePoint URL (sourcedoc=...).
    //     This is stable across renames and moves.
    if (FILE_GUID) {
      try {
        const byId = await graphGet(
          `https://graph.microsoft.com/v1.0/sites/${site.id}/drive/items/${FILE_GUID}?$select=id,name`,
          token, "find workbook by id"
        );
        if (byId && byId.id) item = byId;
      } catch (e) { attempts.push(`by-guid: ${e.message.slice(0, 120)}`); }
    }

    // (b) By path at the library root.
    if (!item) {
      try {
        const byPath = await graphGet(
          `https://graph.microsoft.com/v1.0/drives/${drive.id}/root:/${encodeURIComponent(FILE_NAME)}?$select=id,name`,
          token, "find workbook by path"
        );
        if (byPath && byPath.id) item = byPath;
      } catch (e) { attempts.push(`by-path: ${e.message.slice(0, 120)}`); }
    }

    // (c) List the root children and match the name (no search index).
    if (!item) {
      try {
        const kids = await graphGet(
          `https://graph.microsoft.com/v1.0/drives/${drive.id}/root/children?$select=id,name&$top=200`,
          token, "list library root"
        );
        const names = (kids.value || []).map((f) => f.name);
        item = (kids.value || []).find((f) => f.name === FILE_NAME)
            || (kids.value || []).find((f) => f.name.trim().toLowerCase() === FILE_NAME.trim().toLowerCase())
            || null;
        if (!item) attempts.push(`root listing had: ${names.slice(0, 8).join(" | ") || "nothing"}`);
      } catch (e) { attempts.push(`list-root: ${e.message.slice(0, 120)}`); }
    }

    // (d) One level of subfolders — the file may not sit at the root.
    if (!item) {
      try {
        const kids = await graphGet(
          `https://graph.microsoft.com/v1.0/drives/${drive.id}/root/children?$select=id,name,folder&$top=100`,
          token, "list folders"
        );
        const folders = (kids.value || []).filter((f) => f.folder);
        for (const f of folders) {
          const sub = await graphGet(
            `https://graph.microsoft.com/v1.0/drives/${drive.id}/items/${f.id}/children?$select=id,name&$top=200`,
            token, `scan folder ${f.name}`
          );
          const hit = (sub.value || []).find(
            (x) => x.name === FILE_NAME ||
                   x.name.trim().toLowerCase() === FILE_NAME.trim().toLowerCase()
          );
          if (hit) { item = hit; break; }
        }
        if (!item) attempts.push(`scanned ${folders.length} folder(s), no match`);
      } catch (e) { attempts.push(`folder-scan: ${e.message.slice(0, 120)}`); }
    }

    if (!item) {
      throw new Error(`Could not locate "${FILE_NAME}". Tried — ${attempts.join(" ;; ")}`);
    }

    // Confirm the worksheet exists and get its EXACT name. Graph returns an
    // unhelpful 500 "generalException" if the sheet name doesn't match
    // character-for-character (trailing spaces, different capitalisation),
    // so resolve it here and fail with a message that actually explains it.
    const sheets = await graphGet(
      `https://graph.microsoft.com/v1.0/drives/${drive.id}/items/${item.id}/workbook/worksheets?$select=name`,
      token, "list worksheets"
    );
    const names = (sheets.value || []).map((w) => w.name);
    const sheetName =
      names.find((n) => n === WORKSHEET) ||
      names.find((n) => n.trim().toLowerCase() === WORKSHEET.trim().toLowerCase());
    if (!sheetName) {
      throw new Error(
        `Worksheet "${WORKSHEET}" not found in ${FILE_NAME}. Sheets present: ${names.join(" | ")}`
      );
    }

    // 2. Find the current used range on the worksheet, so we know which
    //    row to write next.
    // usedRange(valuesOnly=true) is far cheaper than the default on large
    // sheets — the default can time out and surface as a 500.
    const used = await graphGet(
      `https://graph.microsoft.com/v1.0/drives/${drive.id}/items/${item.id}/workbook/worksheets/${encodeURIComponent(sheetName)}/usedRange(valuesOnly=true)?$select=address`,
      token, "read used range"
    );
    // usedRange address looks like "Summary All Years!A1:U57", or
    // "'Summary All Years'!A1:U57" when the sheet name contains spaces.
    // Take the LAST row number in the address (the bottom-right cell).
    const addr = used.address || "";
    const m = /![A-Z]+\d+:[A-Z]+(\d+)\s*$/i.exec(addr);
    if (!m) {
      // Never guess here: defaulting to row 1 would overwrite real data.
      throw new Error(`Could not read the last used row from address "${addr}"`);
    }
    const lastRow = parseInt(m[1], 10);
    const nextRow = lastRow + 1;
    const targetAddress = `A${nextRow}:U${nextRow}`;

    // 3. Write the row.
    //
    // `numberFormat` is sent alongside the values so Excel treats column B
    // as a real date (displaying dd/mm/yyyy) rather than showing the raw
    // serial number. "General" leaves every other column as-is.
    const row = toExcelRow(deal, newId, brokerNames);
    const numberFormat = row.map((_, i) => (i === 1 ? "dd/mm/yyyy" : "General"));
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${drive.id}/items/${item.id}/workbook/worksheets/${encodeURIComponent(sheetName)}/range(address='${encodeURIComponent(targetAddress)}')`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: [row], numberFormat: [numberFormat] }),
      }
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Excel write to ${targetAddress} failed ${res.status}: ${body.slice(0, 300)}`);
    }

    console.log("Excel append ok", { dealId: deal.id, row: nextRow });
    return { ok: true, row: nextRow };
  } catch (error) {
    console.error("Excel append failed", { dealId: deal.id, error: error.message });
    return { ok: false, error: error.message };
  }
}

/** Excel row (A–U) for an invoiced LEASE. Mirrors toLeasePropertyRow. */
export function toLeaseExcelRow(deal, newId, brokerNames = {}) {
  const form = deal.form || {};
  const lease = form.lease || {};
  const r = form.rental || {};

  const grossAnnual = num(deal.annual_gross_rent) ?? num(deal.sale_price_ex_gst);
  const area = ["retail", "office", "warehouse", "canopy"]
    .reduce((a, k) => a + (num((r[k] || {}).qty) || 0), 0);

  const names = (form.ownership?.salespeople || [])
    .map((code) => brokerNames[code] || code);
  const b = [0, 1, 2, 3].map((i) => names[i] || null);

  const category = form.ownership?.division === "Investment Sales"
    ? "Investment" : (form.ownership?.division || null);

  return [
    newId,                                                    // A ID
    toExcelSerial(lease.commencementDate || lease.dateOfAgreement), // B Sale Date
    deal.property_address || form.property?.address || null,  // C Address
    deal.vendor_name || null,                                 // D Lessor
    deal.purchaser_name || null,                              // E Lessee
    "Lease",                                                  // F Lease/Sale
    "No",                                                     // G Auction
    category,                                                 // H Category
    area || null,                                             // I SQM
    grossAnnual,                                              // J Sale Price (gross annual rent)
    grossAnnual && area ? +(grossAnnual / area).toFixed(2) : null, // K Price per SQM
    b[0], b[1], b[2], b[3],                                   // L–O Broker 1–4
    null,                                                     // P Notes
    null,                                                     // Q Land Area
    grossAnnual,                                              // R Annual Rent
    null,                                                     // S Initial Yield
    null,                                                     // T Photos
    num(lease.termYears) || null,                             // U WALE (lease term)
  ];
}
