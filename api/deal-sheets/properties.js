// /api/deal-sheets/properties.js
//
// GET /api/deal-sheets/properties?q=columbia -> PropCMA records
// matching the search, shaped for the deal-sheet dropdown pre-fill.
//
// Matched to the real PropCMA `properties` (Summary All Years)
// columns. These are mixed-case / spaced identifiers, so every
// column is double-quoted. Requires the generated `id` column from
// the schema migration (section 0 of deal_sheets_schema_v2.sql).
//
// The Address field has no consistent format, so it is passed
// through as a single string — the form uses one Address field to
// match. Only non-address data (land area, category, yield) and the
// stable id are pre-filled.
//
// Columns (for reference):
//   "Sale Date","Address","Name of Vendor/Landlord","Name of Purchaser/Tenant",
//   "Conjunction","Lease/Sale","Auction","Category","SQM","Sale Price",
//   "Price per SQM","Broker","Notes","Land Area (SQM)","Annual Rent ($)",
//   "Initial Yield (%)","Photos","WALE (Years)"

import { requireUser, sendError, HttpError } from "../_lib/auth.js";
import { supabase } from "../_lib/supabase.js";

const TABLE = "properties";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).end();
    }
    await requireUser(req);

    const q = (req.query.q || "").trim();
    if (q.length < 2) return res.status(200).json([]);

    const { data, error } = await supabase
      .from(TABLE)
      .select(
        `id, "Address", "Category", "Name of Vendor/Landlord", "Name of Purchaser/Tenant", ` +
        `"SQM", "Land Area (SQM)", "Annual Rent ($)", "Initial Yield (%)", "WALE (Years)", "Notes", "Lease/Sale"`
      )
      .or(`"Address".ilike.%${q}%,"Name of Vendor/Landlord".ilike.%${q}%`)
      .limit(10);

    if (error) throw new HttpError(500, "Property search failed");

    return res.status(200).json(
      (data || []).map((p) => ({
        id: p.id,
        label: p["Address"] || "(no address)",

        // Single address field — no splitting (formats are inconsistent).
        // The form reads `address` into its one Address box.
        address: p["Address"] || "",
        propertyType: p["Category"] || "",

        // Sale-detail pre-fill. Note the mapping:
        //   form "Land area (sqm)"  <- PropCMA "SQM"
        //   form "Occupied by area" <- PropCMA "Land Area (SQM)"
        landArea: p["SQM"]?.toString() || "",
        occupiedArea: p["Land Area (SQM)"]?.toString() || "",
        annualRent: p["Annual Rent ($)"]?.toString() || "",
        yield: p["Initial Yield (%)"]?.toString() || "",
        wale: p["WALE (Years)"]?.toString() || "",
        notes: p["Notes"] || "",

        // Metadata (shown in the dropdown row for context; not copied
        // into the new deal — these belong to the past comparable sale)
        vendor: p["Name of Vendor/Landlord"] || "",
        purchaser: p["Name of Purchaser/Tenant"] || "",
        dealType: p["Lease/Sale"] || "",
      }))
    );
  } catch (e) {
    sendError(res, e);
  }
}
