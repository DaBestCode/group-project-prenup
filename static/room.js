import { buildCubbiePrompt, buildSmsUrl } from "./cubbie-launch.js";

const $ = (selector) => document.querySelector(selector);
const params = new URLSearchParams(window.location.search);
const roomCode = (params.get("room") || "").toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6);
const apiBase = (params.get("api") || window.location.origin).replace(/\/$/, "");
let room = null;
let agentInbox = null;
let pollTimer = null;

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character]));
}

function values(value) {
  return [...new Set(String(value || "").split(/[,\n]/).map((item) => item.trim().toLowerCase()).filter(Boolean))];
}

function membership(code = roomCode) {
  try { return JSON.parse(localStorage.getItem(`prenup:${code}`) || "null"); } catch { return null; }
}

function showAlert(message) {
  $("#room-alert").textContent = message;
  $("#room-alert").classList.remove("hidden");
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  let data;
  try { data = await response.json(); } catch { throw new Error("The shared coordinator is not deployed at this address yet."); }
  if (!response.ok) throw new Error(data.error || "The shared coordinator could not finish that request.");
  return data;
}

function goToRoom(code) {
  const next = new URL("./room", window.location.href);
  next.searchParams.set("room", code);
  if (params.get("api")) next.searchParams.set("api", apiBase);
  window.location.href = next.toString();
}

function roomInviteUrl(code = roomCode) {
  const invite = new URL("./room", window.location.href);
  invite.search = "";
  invite.searchParams.set("room", code);
  return invite.toString();
}

function renderCubbieLaunch() {
  if (roomCode.length !== 6) return;
  const prompt = buildCubbiePrompt({ roomCode, title: room?.title, roomUrl: roomInviteUrl() });
  $("#cubbie-launch-card").classList.remove("hidden");
  $("#cubbie-message").value = prompt;
  $("#open-in-cubbie").href = buildSmsUrl(prompt);
}

async function loadRoom() {
  room = await request(`/api/rooms/${roomCode}`);
  const mine = membership();
  agentInbox = mine ? await request(`/api/rooms/${roomCode}/inbox`, { headers: { Authorization: `Bearer ${mine.token}` } }) : null;
  renderCubbieLaunch();
  $("#start-screen").classList.add("hidden");
  if (!mine && room.status === "lobby" && room.spots_left > 0) {
    $("#join-screen").classList.remove("hidden");
    $("#room-screen").classList.add("hidden");
    $("#join-title").textContent = room.title;
    $("#join-code").textContent = room.room_code;
    return;
  }
  $("#join-screen").classList.add("hidden");
  $("#room-screen").classList.remove("hidden");
  renderRoom();
  clearTimeout(pollTimer);
  pollTimer = setTimeout(loadRoom, room.status === "signed" ? 15000 : 2500);
}

function renderRoom() {
  const mine = membership();
  $("#dashboard-code").textContent = room.room_code;
  $("#dashboard-title").textContent = room.title;
  $("#lobby-message").textContent = room.spots_left
    ? `${room.spots_left} ${room.spots_left === 1 ? "agent" : "agents"} still need to join`
    : "Every agent is here";
  $("#member-list").innerHTML = room.participants.map((participant) => `
    <div class="member-row"><span>${escapeHtml(participant.name)}${mine?.participant_id === participant.id ? " (you)" : ""}</span><b>${escapeHtml(agentStateLabel(participant))}</b></div>
  `).join("") + Array.from({ length: room.spots_left }, () => '<div class="member-row empty-member"><span>Invite pending</span><b>···</b></div>').join("");
  renderAgentInbox(mine);

  if (!room.proposal) {
    $("#proposal-area").classList.add("hidden");
    return;
  }
  $("#proposal-area").classList.remove("hidden");
  $("#shared-round").textContent = room.round;
  $("#shared-fairness").textContent = room.proposal.fairness_score;
  $("#shared-meeting").textContent = room.proposal.meeting.slot || "Needs a human choice";
  $("#shared-status").textContent = room.status === "signed"
    ? "Treaty signed"
    : room.proposal.requires_owner_tradeoff ? "Owner tradeoff needed" : "Agents recommend approval";
  $("#shared-status").classList.toggle("signed", room.status === "signed");
  renderDiscordRelay();
  renderDiscordChat();
  renderProtocolTrace();
  $("#shared-assignments").innerHTML = room.proposal.assignments.map((assignment) => `<div class="assignment"><div><h4>${escapeHtml(assignment.role)}</h4><p>${assignment.effort} effort ${assignment.effort === 1 ? "point" : "points"} · ${escapeHtml(assignment.reason)}</p></div><span class="owner">${escapeHtml(assignment.owner)}</span></div>`).join("");
  renderActions(mine);
}

function renderDiscordChat() {
  const trace = room.proposal.protocol_trace || [];
  $("#discord-chat").innerHTML = trace.map((event) => {
    const coordinator = event.actor === "Coordinator";
    const initial = coordinator ? "GP" : event.actor.trim().charAt(0).toUpperCase();
    return `<div class="discord-chat-message">
      <span class="discord-avatar ${coordinator ? "coordinator-avatar" : ""}">${escapeHtml(initial)}</span>
      <div><div class="discord-message-head"><strong>${escapeHtml(coordinator ? "Prenup Coordinator" : event.actor)}</strong><span>${event.round ? `Round ${event.round}` : "Setup"}</span></div><b>${escapeHtml(event.action)}</b><p>${escapeHtml(event.outcome)}</p></div>
    </div>`;
  }).join("");
}

function renderDiscordRelay() {
  const status = $("#discord-relay-status");
  const link = $("#discord-room-link");
  status.textContent = room.discord?.connected ? "Discord relay live" : "Discord preview";
  if (room.discord?.channel_url) {
    link.href = room.discord.channel_url;
    link.classList.remove("hidden");
  } else {
    link.classList.add("hidden");
  }
}

function renderProtocolTrace() {
  const trace = room.proposal.protocol_trace || [];
  $("#protocol-trace").innerHTML = trace.map((event, index) => `
    <div class="trace-event">
      <span class="trace-index">${String(index + 1).padStart(2, "0")}</span>
      <div><b>${escapeHtml(event.action)}</b><strong>${escapeHtml(event.actor)}</strong></div>
      <p>${escapeHtml(event.outcome)}</p>
      <span class="trace-round">${event.round ? `ROUND ${event.round}` : "SETUP"}</span>
    </div>
  `).join("");
}

function agentStateLabel(participant) {
  if (participant.approval === "approved") return "✓ owner approved";
  const labels = {
    online: "agent online",
    evaluating: "agent evaluating",
    countering: "agent countering",
    awaiting_owner: "waiting for owner",
    owner_approved: "✓ owner approved",
    signed: "✓ signed",
  };
  return labels[participant.agent_state] || "agent joining";
}

function agentMessageText(entry) {
  if (entry.kind === "agent_online") return "Your personal agent came online with permission to bid, evaluate, counter, and escalate.";
  if (entry.kind === "constraints_offer") return "Sent the approved constraint envelope to the coordinator.";
  if (entry.kind === "role_bid") return `Submitted scored bids for ${entry.message.bids.length} roles without sharing private notes.`;
  if (entry.kind === "proposal_evaluation") return entry.message.public_reason;
  if (entry.kind === "counter_offer") return "Countered automatically with only the role or workload limit the coordinator needs.";
  if (entry.kind === "owner_confirmation_needed" || entry.kind === "proposal_ready") {
    const roles = entry.message.assignments.map((assignment) => assignment.role).join(" + ");
    return `Received round ${entry.message.round}: ${roles || "no role yet"}. ${entry.message.tradeoff ? "Your judgment is needed for a tradeoff." : "Your agent recommends approval; final consent is yours."}`;
  }
  if (entry.kind === "owner_approved") return `Told the coordinator you approved round ${entry.message.round}.`;
  if (entry.kind === "owner_rejected") return `Asked for a new round. Your private reason stayed private.`;
  if (entry.kind === "treaty_signed") return "Received the unanimous signed treaty.";
  return "Agent protocol message received.";
}

function renderAgentInbox(mine) {
  const card = $("#personal-agent-card");
  if (!mine || !agentInbox) {
    card.classList.add("hidden");
    return;
  }
  card.classList.remove("hidden");
  $("#agent-inbox").innerHTML = agentInbox.messages.slice(-5).reverse().map((entry) => `
    <div class="agent-message"><b>${escapeHtml(entry.sender)} → ${escapeHtml(entry.recipient)}</b><span>${escapeHtml(agentMessageText(entry))}</span></div>
  `).join("");
}

function renderActions(mine) {
  const actions = $("#shared-actions");
  if (room.status === "signed") {
    $("#shared-consent-title").textContent = "Treaty signed. Screenshot this beauty.";
    $("#shared-consent-copy").textContent = "Every student approved the same plan.";
    actions.innerHTML = '<div class="signed-seal">✓ UNANIMOUSLY UN-CURSED</div>';
    return;
  }
  if (!mine) {
    $("#shared-consent-title").textContent = "You are viewing this room";
    $("#shared-consent-copy").textContent = "Only joined participants can approve or reject.";
    actions.innerHTML = '<div class="signed-seal">READ ONLY</div>';
    return;
  }
  const me = room.participants.find((participant) => participant.id === mine.participant_id);
  if (me?.approval === "approved") {
    $("#shared-consent-title").textContent = "Your agent approved this round";
    $("#shared-consent-copy").textContent = "Waiting for the rest of the group.";
    actions.innerHTML = '<div class="signed-seal">✓ YOUR SIGNATURE IS IN</div>';
    return;
  }
  $("#shared-consent-title").textContent = "Approve your assignment?";
  $("#shared-consent-copy").textContent = room.proposal.requires_owner_tradeoff
    ? "The agents could not resolve every constraint. Review the flagged tradeoff before deciding."
    : "Your agent recommends this plan. A private no starts a fresh bargaining round.";
  actions.innerHTML = '<button class="button button-ghost" id="reject-shared">Reject privately</button><button class="button button-primary" id="approve-shared">Approve treaty →</button>';
  $("#reject-shared").addEventListener("click", () => confirm(false));
  $("#approve-shared").addEventListener("click", () => confirm(true));
}

async function confirm(approved) {
  const mine = membership();
  try {
    room = await request(`/api/rooms/${roomCode}/confirm`, {
      method: "POST",
      headers: { Authorization: `Bearer ${mine.token}` },
      body: JSON.stringify({ approved }),
    });
    renderRoom();
  } catch (error) { showAlert(error.message); }
}

$("#create-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const result = await request("/api/rooms", { method: "POST", body: JSON.stringify({ title: form.get("title"), expected_members: Number(form.get("expected_members")) }) });
    goToRoom(result.room_code);
  } catch (error) { showAlert(error.message); }
});

$("#code-form").addEventListener("submit", (event) => {
  event.preventDefault();
  goToRoom(new FormData(event.currentTarget).get("code").toUpperCase().replace(/[^A-Z2-9]/g, ""));
});

$("#join-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const result = await request(`/api/rooms/${roomCode}/join`, {
      method: "POST",
      body: JSON.stringify({
        name: form.get("name"), strengths: values(form.get("strengths")), prefers: values(form.get("prefers")),
        avoids: values(form.get("avoids")), available: values(form.get("available")), capacity: Number(form.get("capacity")),
      }),
    });
    localStorage.setItem(`prenup:${roomCode}`, JSON.stringify({ participant_id: result.participant_id, token: result.participant_token }));
    room = result.room;
    agentInbox = await request(`/api/rooms/${roomCode}/inbox`, { headers: { Authorization: `Bearer ${result.participant_token}` } });
    $("#join-screen").classList.add("hidden");
    $("#room-screen").classList.remove("hidden");
    renderRoom();
    pollTimer = setTimeout(loadRoom, 2500);
  } catch (error) { showAlert(error.message); }
});

$("input[name=capacity]").addEventListener("input", (event) => { $("#capacity-output").textContent = event.target.value; });
$("#copy-invite").addEventListener("click", async () => {
  const url = roomInviteUrl(room.room_code);
  if (navigator.share) {
    try { await navigator.share({ title: `${room.title} · Group Project Prenup`, text: "Join our agent negotiation room:", url }); }
    catch (error) { if (error.name !== "AbortError") showAlert("The share sheet could not open."); }
  } else {
    await navigator.clipboard.writeText(url);
    $("#copy-invite").textContent = "Copied ✓";
  }
});

$("#share-cubbie-invite").addEventListener("click", async () => {
  const text = $("#cubbie-message").value;
  if (navigator.share) {
    try { await navigator.share({ title: `${room?.title || "Group project"} · Cubbie agent invite`, text }); }
    catch (error) { if (error.name !== "AbortError") showAlert("The share sheet could not open."); }
  } else {
    await navigator.clipboard.writeText(text);
    $("#share-cubbie-invite").textContent = "Message copied ✓";
  }
});

if (roomCode.length === 6) {
  renderCubbieLaunch();
  loadRoom().catch((error) => showAlert(error.message));
}
