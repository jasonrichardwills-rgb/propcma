// /api/deal-sheets/properties.js
//
// GET /api/deal-sheets/properties?q=columbia -> PropCMA records
// matching the search, shaped for the deal-sheet dropdown pre-fill.
//
// Column names match the live PropCMA `properties` table (snake_case).
// The address field has no consistent format, so it is passed through
// as a single string — the form uses one Address field to match.

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
        "id, address, category, vendor, purchaser, sqm, land_area, " +
        "annual_rent, initial_yield, wale, notes, lease_or_sale"
      )
      .or(`address.ilike.%${q}%,vendor.ilike.%${q}%`)
      .limit(10);

    if (error) throw new HttpError(500, "Property search failed");

    return res.status(200).json(
      (data || []).map((p) => ({
        id: p.id,
        label: p.address || "(no address)",

        // Single address field — no splitting (formats are inconsistent).
        address: p.address || "",
        propertyType: p.category || "",

        // Sale-detail pre-fill. Mapping:
        //   form "Land area (sqm)"  <- properties.sqm
        //   form "Occupied by area" <- properties.land_area
        landArea: p.sqm?.toString() || "",
        occupiedArea: p.land_area?.toString() || "",
        annualRent: p.annual_rent?.toString() || "",
        yield: p.initial_yield?.toString() || "",
        wale: p.wale?.toString() || "",
        notes: p.notes || "",

        // Metadata (shown for context; not copied into the new deal —
        // these belong to the past comparable sale)
        vendor: p.vendor || "",
        purchaser: p.purchaser || "",
        dealType: p.lease_or_sale || "",
      }))
    );
  } catch (e) {
    sendError(res, e);
  }
}
