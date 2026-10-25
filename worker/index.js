import { negotiate } from "../static/negotiator.js";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });
}

async function body(request) {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > 64_000) throw new HttpError(413, "Request is too large.");
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "Send a valid JSON body.");
  }
}

function cleanText(value, maxLength = 80) {
  return String(value || "").trim().slice(0, maxLength);
}

function cleanList(value, maxItems = 12) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => cleanText(item, 80)).filter(Boolean))].slice(0, maxItems);
}

function safeProfile(input, participantId) {
  const name = cleanText(input.name, 40);
  if (!name) throw new HttpError(400, "Tell us the student's name.");
  return {
    id: participantId,
    name,
    strengths: cleanList(input.strengths),
    prefers: cleanList(input.prefers),
    avoids: cleanList(input.avoids),
    declined_roles: [],
    available: cleanList(input.available, 10),
    capacity: Math.max(1, Math.min(6, Number(input.capacity) || 3)),
    private_note: "",
    private_calendar: [],
  };
}

function randomString(length, alphabet = CODE_ALPHABET) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}

async function tokenHash(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function createRoom(request, env) {
  const input = await body(request);
  const title = cleanText(input.title, 80);
  const expectedMembers = Math.max(2, Math.min(6, Number(input.expected_members) || 3));
  if (!title) throw new HttpError(400, "Give the project a short name.");

  let code;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    code = randomString(6);
    const exists = await env.DB.prepare("SELECT id FROM rooms WHERE id = ?").bind(code).first();
    if (!exists) break;
  }
  await env.DB.prepare(
    "INSERT INTO rooms (id, title, expected_members) VALUES (?, ?, ?)",
  ).bind(code, title, expectedMembers).run();
  const joinUrl = new URL("/room", request.url);
  joinUrl.searchParams.set("room", code);
  return json({ room_code: code, join_url: joinUrl.toString() }, 201);
}

async function participantsFor(roomId, env) {
  const result = await env.DB.prepare(
    "SELECT id, name, profile_json, approval, joined_at FROM participants WHERE room_id = ? ORDER BY joined_at, id",
  ).bind(roomId).all();
  return result.results || [];
}

async function roomView(roomId, env) {
  const room = await env.DB.prepare(
    "SELECT id, title, expected_members, status, round, proposal_json, created_at FROM rooms WHERE id = ?",
  ).bind(roomId).first();
  if (!room) throw new HttpError(404, "That room does not exist.");
  const participants = await participantsFor(roomId, env);
  return {
    room_code: room.id,
    title: room.title,
    expected_members: room.expected_members,
    status: room.status,
    round: room.round,
    proposal: room.proposal_json ? JSON.parse(room.proposal_json) : null,
    participants: participants.map(({ id, name, approval }) => ({ id, name, approval })),
    spots_left: Math.max(0, room.expected_members - participants.length),
    created_at: room.created_at,
  };
}

async function buildProposal(roomId, env, round) {
  const participants = await participantsFor(roomId, env);
  const result = negotiate(participants.map((participant) => JSON.parse(participant.profile_json)));
  delete result.students;
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE rooms SET status = 'awaiting_confirmation', round = ?, proposal_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).bind(round, JSON.stringify(result), roomId),
    env.DB.prepare("UPDATE participants SET approval = 'pending' WHERE room_id = ?").bind(roomId),
  ]);
}

async function joinRoom(request, env, roomId) {
  const room = await env.DB.prepare("SELECT expected_members, status FROM rooms WHERE id = ?").bind(roomId).first();
  if (!room) throw new HttpError(404, "That room does not exist.");
  if (room.status !== "lobby") throw new HttpError(409, "Negotiation has already started for this room.");
  const existing = await participantsFor(roomId, env);
  if (existing.length >= room.expected_members) throw new HttpError(409, "That room is full.");

  const input = await body(request);
  const participantId = crypto.randomUUID();
  const profile = safeProfile(input, participantId);
  if (existing.some((participant) => participant.name.toLowerCase() === profile.name.toLowerCase())) {
    throw new HttpError(409, "Someone with that name already joined this room.");
  }
  const token = `${roomId}.${randomString(36, `${CODE_ALPHABET.toLowerCase()}${CODE_ALPHABET}`)}`;
  const hash = await tokenHash(token);
  await env.DB.prepare(
    "INSERT INTO participants (room_id, id, token_hash, name, profile_json) VALUES (?, ?, ?, ?, ?)",
  ).bind(roomId, participantId, hash, profile.name, JSON.stringify(profile)).run();

  if (existing.length + 1 === room.expected_members) await buildProposal(roomId, env, 1);
  return json({ participant_id: participantId, participant_token: token, room: await roomView(roomId, env) }, 201);
}

async function authenticatedParticipant(request, roomId, env) {
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) throw new HttpError(401, "This action needs the participant token returned when you joined.");
  const hash = await tokenHash(token);
  const participant = await env.DB.prepare(
    "SELECT id, name, profile_json, approval FROM participants WHERE room_id = ? AND token_hash = ?",
  ).bind(roomId, hash).first();
  if (!participant) throw new HttpError(403, "That participant token is invalid for this room.");
  return participant;
}

async function confirmRoom(request, env, roomId) {
  const room = await env.DB.prepare("SELECT status, round, proposal_json FROM rooms WHERE id = ?").bind(roomId).first();
  if (!room) throw new HttpError(404, "That room does not exist.");
  if (room.status === "signed") return json(await roomView(roomId, env));
  if (room.status !== "awaiting_confirmation" || !room.proposal_json) throw new HttpError(409, "The room is still waiting for teammates.");
  const participant = await authenticatedParticipant(request, roomId, env);
  const input = await body(request);

  if (input.approved === true) {
    await env.DB.prepare("UPDATE participants SET approval = 'approved' WHERE room_id = ? AND id = ?").bind(roomId, participant.id).run();
    const pending = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM participants WHERE room_id = ? AND approval != 'approved'",
    ).bind(roomId).first();
    if (Number(pending.count) === 0) {
      await env.DB.prepare("UPDATE rooms SET status = 'signed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(roomId).run();
    }
    return json(await roomView(roomId, env));
  }
  if (input.approved !== false) throw new HttpError(400, "approved must be true or false.");

  const proposal = JSON.parse(room.proposal_json);
  const assignedRoles = proposal.assignments.filter((item) => item.owner_id === participant.id).map((item) => item.role_id);
  const profile = JSON.parse(participant.profile_json);
  profile.declined_roles = [...new Set([...(profile.declined_roles || []), ...assignedRoles])].sort();
  await env.DB.prepare("UPDATE participants SET profile_json = ? WHERE room_id = ? AND id = ?")
    .bind(JSON.stringify(profile), roomId, participant.id).run();
  await buildProposal(roomId, env, Number(room.round) + 1);
  const updated = await env.DB.prepare("SELECT proposal_json FROM rooms WHERE id = ?").bind(roomId).first();
  const revised = JSON.parse(updated.proposal_json);
  revised.log.unshift({
    speaker: `${participant.name}'s agent`,
    message: "Student rejected privately. Shared only the newly unavailable role, then reopened bargaining.",
  });
  await env.DB.prepare("UPDATE rooms SET proposal_json = ? WHERE id = ?").bind(JSON.stringify(revised), roomId).run();
  return json(await roomView(roomId, env));
}

async function api(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method === "GET" && path === "/api/health") return json({ ok: true, storage: "d1" });
  if (request.method === "POST" && path === "/api/rooms") return createRoom(request, env);

  const match = path.match(/^\/api\/rooms\/([A-Z2-9]{6})(?:\/(join|confirm))?$/);
  if (!match) throw new HttpError(404, "API route not found.");
  const roomId = match[1];
  if (request.method === "GET" && !match[2]) return json(await roomView(roomId, env));
  if (request.method === "POST" && match[2] === "join") return joinRoom(request, env, roomId);
  if (request.method === "POST" && match[2] === "confirm") return confirmRoom(request, env, roomId);
  throw new HttpError(405, "Method not allowed.");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) return await api(request, env);
      return env.ASSETS.fetch(request);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      console.error(error);
      return json({ error: "The coordinator hit an unexpected problem." }, 500);
    }
  },
};

export { api, cleanList, safeProfile, tokenHash };
