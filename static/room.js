const $ = (selector) => document.querySelector(selector);
const params = new URLSearchParams(window.location.search);
const roomCode = (params.get("room") || "").toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6);
const apiBase = (params.get("api") || window.location.origin).replace(/\/$/, "");
let room = null;
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

async function loadRoom() {
  room = await request(`/api/rooms/${roomCode}`);
  const mine = membership();
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
    <div class="member-row"><span>${escapeHtml(participant.name)}${mine?.participant_id === participant.id ? " (you)" : ""}</span><b>${participant.approval === "approved" ? "✓ approved" : room.proposal ? "reviewing" : "joined"}</b></div>
  `).join("") + Array.from({ length: room.spots_left }, () => '<div class="member-row empty-member"><span>Invite pending</span><b>···</b></div>').join("");

  if (!room.proposal) {
    $("#proposal-area").classList.add("hidden");
    return;
  }
  $("#proposal-area").classList.remove("hidden");
  $("#shared-round").textContent = room.round;
  $("#shared-fairness").textContent = room.proposal.fairness_score;
  $("#shared-meeting").textContent = room.proposal.meeting.slot || "Needs a human choice";
  $("#shared-status").textContent = room.status === "signed" ? "Treaty signed" : "Awaiting confirmation";
  $("#shared-status").classList.toggle("signed", room.status === "signed");
  $("#shared-log").innerHTML = room.proposal.log.map((entry) => `<div class="message"><strong>${escapeHtml(entry.speaker)}</strong><span>${escapeHtml(entry.message)}</span></div>`).join("");
  $("#shared-assignments").innerHTML = room.proposal.assignments.map((assignment) => `<div class="assignment"><div><h4>${escapeHtml(assignment.role)}</h4><p>${assignment.effort} effort ${assignment.effort === 1 ? "point" : "points"} · ${escapeHtml(assignment.reason)}</p></div><span class="owner">${escapeHtml(assignment.owner)}</span></div>`).join("");
  renderActions(mine);
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
  $("#shared-consent-copy").textContent = "A private no starts a fresh round without explaining why.";
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
    $("#join-screen").classList.add("hidden");
    $("#room-screen").classList.remove("hidden");
    renderRoom();
    pollTimer = setTimeout(loadRoom, 2500);
  } catch (error) { showAlert(error.message); }
});

$("input[name=capacity]").addEventListener("input", (event) => { $("#capacity-output").textContent = event.target.value; });
$("#copy-invite").addEventListener("click", async () => {
  const invite = new URL(window.location.href);
  invite.searchParams.set("room", room.room_code);
  await navigator.clipboard.writeText(invite.toString());
  $("#copy-invite").textContent = "Copied ✓";
});

if (roomCode.length === 6) loadRoom().catch((error) => showAlert(error.message));
