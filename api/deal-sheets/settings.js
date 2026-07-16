// /api/deal-sheets/settings.js
//
// GET    /api/deal-sheets/settings?type=brokers   — list brokers (any signed-in user)
// GET    /api/deal-sheets/settings?type=admins    — list office admins (accounts/manager)
// POST   /api/deal-sheets/settings                — add/update (accounts/manager)
//          { type:'broker', code, firstName, email }
//          { type:'admin',  oid, email, displayName }
// DELETE /api/deal-sheets/settings?type=broker&code=OS   — deactivate (accounts/manager)
// DELETE /api/deal-sheets/settings?type=admin&oid=...    — deactivate (accounts/manager)
//
// Removal is a soft deactivate (active=false), never a hard delete —
// past deal sheets reference these people and must stay readable.

import { requireUser, sendError, HttpError } from "../_lib/auth.js";
import { supabase } from "../_lib/supabase.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") return await list(req, res);
    if (req.method === "POST") return await upsert(req, res);
    if (req.method === "DELETE") return await deactivate(req, res);
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).end();
  } catch (e) {
    sendError(res, e);
  }
}

async function list(req, res) {
  const type = req.query.type;

  if (type === "brokers") {
    // Any signed-in user — the deal sheet form needs this list.
    await requireUser(req);
    const { data, error } = await supabase
      .from("brokers")
      .select("code, first_name, email, active")
      .eq("active", true)
      .order("first_name");
    if (error) throw new HttpError(500, "Broker list failed");
    return res.status(200).json(data);
  }

  if (type === "allBrokers") {
    // Settings view — includes deactivated.
    await requireUser(req, ["accounts", "manager"]);
    const { data, error } = await supabase
      .from("brokers")
      .select("code, first_name, email, active")
      .order("first_name");
    if (error) throw new HttpError(500, "Broker list failed");
    return res.status(200).json(data);
  }

  if (type === "admins") {
    await requireUser(req, ["accounts", "manager"]);
    const { data, error } = await supabase
      .from("app_users")
      .select("oid, email, display_name, role, active")
      .in("role", ["office_admin", "accounts", "manager"])
      .order("display_name");
    if (error) throw new HttpError(500, "User list failed");
    return res.status(200).json(data);
  }

  throw new HttpError(400, "Unknown type");
}

async function upsert(req, res) {
  await requireUser(req, ["accounts", "manager"]);
  const b = req.body || {};

  if (b.type === "broker") {
    const code = (b.code || "").trim().toUpperCase();
    const firstName = (b.firstName || "").trim();
    if (!code || !firstName) throw new HttpError(400, "Code and first name are required");
    if (!/^[A-Z]{1,4}$/.test(code)) throw new HttpError(400, "Code must be 1-4 letters");

    const { error } = await supabase.from("brokers").upsert({
      code,
      first_name: firstName,
      email: (b.email || "").trim() || null,
      active: true,
    });
    if (error) throw new HttpError(500, "Save failed");
    return res.status(200).json({ ok: true });
  }

  if (b.type === "admin") {
    const oid = (b.oid || "").trim();
    if (!oid) throw new HttpError(400, "Object ID is required");
    const role = b.role || "office_admin";
    if (!["office_admin", "accounts", "manager"].includes(role))
      throw new HttpError(400, "Invalid role");

    const { error } = await supabase.from("app_users").upsert({
      oid,
      email: (b.email || "").trim() || null,
      display_name: (b.displayName || "").trim() || null,
      role,
      active: true,
    });
    if (error) throw new HttpError(500, "Save failed");
    return res.status(200).json({ ok: true });
  }

  throw new HttpError(400, "Unknown type");
}

async function deactivate(req, res) {
  const user = await requireUser(req, ["accounts", "manager"]);
  const type = req.query.type;

  if (type === "broker") {
    const code = (req.query.code || "").toUpperCase();
    if (!code) throw new HttpError(400, "code required");
    const { error } = await supabase.from("brokers")
      .update({ active: false }).eq("code", code);
    if (error) throw new HttpError(500, "Remove failed");
    return res.status(200).json({ ok: true });
  }

  if (type === "admin") {
    const oid = req.query.oid;
    if (!oid) throw new HttpError(400, "oid required");
    if (oid === user.oid) throw new HttpError(400, "You can't remove your own access");
    const { error } = await supabase.from("app_users")
      .update({ active: false }).eq("oid", oid);
    if (error) throw new HttpError(500, "Remove failed");
    return res.status(200).json({ ok: true });
  }

  throw new HttpError(400, "Unknown type");
}
