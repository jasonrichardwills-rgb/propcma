// /api/deal-sheets/[id]/attachments.js
//
// POST   /api/deal-sheets/:id/attachments   (multipart: slot, file) — upload
// DELETE /api/deal-sheets/:id/attachments?slot=…                     — remove
//
// Files live in the private Supabase Storage bucket `deal-documents`
// under  <dealId>/<slot>/<filename>. A row per attachment is tracked
// in `deal_sheet_attachments` so the accounts page can list them.
//
// Brokers may attach/remove on their OWN draft; accounts/managers may
// on any non-draft deal.

import Busboy from "busboy";
import { requireUser, sendError, HttpError } from "../../_lib/auth.js";
import { supabase } from "../../_lib/supabase.js";

export const config = { api: { bodyParser: false } }; // we parse multipart ourselves

const BUCKET = "deal-documents";
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
const ALLOWED = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.ms-excel",
  "image/jpeg", "image/png",
]);
const VALID_SLOTS = new Set([
  "tenancySchedule", "agencyAgreement", "unconditionalConfirmation",
  "salePriceConfirmation", "marketingReport", "amlComplete", "spAgreement",
]);

export default async function handler(req, res) {
  try {
    const { id } = req.query;

    // GET returns a signed download URL (read access — broker owner or staff)
    if (req.method === "GET") return await signedUrl(req, res, id);

    const deal = await loadDealForWrite(req, id);
    if (req.method === "POST") return await upload(req, res, deal);
    if (req.method === "DELETE") return await remove(req, res, deal);
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).end();
  } catch (e) {
    sendError(res, e);
  }
}

async function signedUrl(req, res, id) {
  const user = await requireUser(req);
  const slot = req.query.slot;
  if (!VALID_SLOTS.has(slot)) throw new HttpError(400, "Invalid slot");

  const { data: deal, error } = await supabase
    .from("deal_sheets").select("id, created_by, status").eq("id", id).single();
  if (error || !deal) throw new HttpError(404, "Deal sheet not found");

  const isOwner = deal.created_by === user.oid;
  const isStaff = ["accounts", "manager"].includes(user.role) && deal.status !== "draft";
  if (!isOwner && !isStaff) throw new HttpError(403, "Not permitted");

  const { data: rows } = await supabase.from("deal_sheet_attachments")
    .select("storage_path, file_name").eq("deal_id", id).eq("slot", slot);
  if (!rows || !rows.length) throw new HttpError(404, "No file for that slot");

  const { data: signed, error: sErr } = await supabase.storage
    .from(BUCKET).createSignedUrl(rows[0].storage_path, 300, { download: rows[0].file_name });
  if (sErr) throw new HttpError(500, "Could not create download link");

  return res.status(200).json({ url: signed.signedUrl, name: rows[0].file_name });
}

async function loadDealForWrite(req, id) {
  const user = await requireUser(req);
  const { data: deal, error } = await supabase
    .from("deal_sheets").select("id, created_by, status").eq("id", id).single();
  if (error || !deal) throw new HttpError(404, "Deal sheet not found");

  const isOwnerDraft = deal.created_by === user.oid && deal.status === "draft";
  const isStaff = ["accounts", "manager"].includes(user.role) && deal.status !== "draft";
  if (!isOwnerDraft && !isStaff)
    throw new HttpError(403, "Not permitted to change attachments on this deal");
  return deal;
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers, limits: { fileSize: MAX_BYTES, files: 1 } });
    const fields = {};
    let fileBuf = null, fileName = null, fileType = null, tooBig = false;

    bb.on("field", (name, val) => { fields[name] = val; });
    bb.on("file", (_name, stream, info) => {
      fileName = info.filename; fileType = info.mimeType;
      const chunks = [];
      stream.on("data", (c) => chunks.push(c));
      stream.on("limit", () => { tooBig = true; stream.resume(); });
      stream.on("end", () => { fileBuf = Buffer.concat(chunks); });
    });
    bb.on("close", () => {
      if (tooBig) return reject(new HttpError(413, "File exceeds 20 MB limit"));
      resolve({ fields, fileBuf, fileName, fileType });
    });
    bb.on("error", reject);
    req.pipe(bb);
  });
}

async function upload(req, res, deal) {
  const { fields, fileBuf, fileName, fileType } = await parseMultipart(req);
  const slot = fields.slot;

  if (!VALID_SLOTS.has(slot)) throw new HttpError(400, "Invalid attachment slot");
  if (!fileBuf || !fileName) throw new HttpError(400, "No file provided");
  if (!ALLOWED.has(fileType)) throw new HttpError(415, "File type not allowed (PDF, Word, Excel or image only)");

  const safeName = fileName.replace(/[^\w.\-]+/g, "_").slice(-120);
  const path = `${deal.id}/${slot}/${safeName}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, fileBuf, { contentType: fileType, upsert: true });
  if (upErr) throw new HttpError(500, `Storage upload failed: ${upErr.message}`);

  // Track it (one row per slot — replace any existing for this slot)
  await supabase.from("deal_sheet_attachments").delete()
    .eq("deal_id", deal.id).eq("slot", slot);
  const { error: dbErr } = await supabase.from("deal_sheet_attachments").insert({
    deal_id: deal.id, slot, file_name: fileName, storage_path: path,
    content_type: fileType, size_bytes: fileBuf.length,
  });
  if (dbErr) throw new HttpError(500, "Attachment record failed");

  return res.status(200).json({ slot, name: fileName, path, size: fileBuf.length });
}

async function remove(req, res, deal) {
  const slot = req.query.slot;
  if (!VALID_SLOTS.has(slot)) throw new HttpError(400, "Invalid slot");

  const { data: rows } = await supabase.from("deal_sheet_attachments")
    .select("storage_path").eq("deal_id", deal.id).eq("slot", slot);
  if (rows && rows.length) {
    await supabase.storage.from(BUCKET).remove(rows.map((r) => r.storage_path));
    await supabase.from("deal_sheet_attachments").delete()
      .eq("deal_id", deal.id).eq("slot", slot);
  }
  return res.status(200).json({ ok: true });
}
