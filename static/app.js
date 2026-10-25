const students = [
  {
    id: "maya",
    name: "Maya",
    strengths: ["research", "writing"],
    prefers: ["research"],
    avoids: ["presentation"],
    available: ["Thu 5:30 PM", "Sun 6:00 PM"],
    capacity: 3,
    private_note: "Job interview Tuesday; do not share why Tuesday is blocked.",
    private_calendar: ["CHM 113 lab", "work shift", "interview prep"],
  },
  {
    id: "jordan",
    name: "Jordan",
    strengths: ["design", "presentation"],
    prefers: ["research"],
    avoids: ["slides"],
    available: ["Thu 5:30 PM", "Sat 11:00 AM"],
    capacity: 3,
    private_note: "Working extra shifts this week; keep the reason private.",
    private_calendar: ["SOC 101", "work shift", "commute"],
  },
  {
    id: "leo",
    name: "Leo",
    strengths: ["analysis", "coding"],
    prefers: ["research"],
    avoids: ["slides"],
    available: ["Thu 5:30 PM", "Sun 6:00 PM"],
    capacity: 3,
    private_note: "Family commitment Saturday; share only availability.",
    private_calendar: ["CSE 310", "tutoring", "family commitment"],
  },
];

let session = null;

const $ = (selector) => document.querySelector(selector);

function renderAgents() {
  $("#agent-grid").innerHTML = students.map((student) => `
    <article class="agent-card" data-initial="${student.name[0]}">
      <div class="agent-head">
        <div class="avatar">${student.name[0]}</div>
        <div><h3>${student.name}'s agent</h3><span>personal context vault</span></div>
      </div>
      <dl class="agent-facts">
        <div class="fact"><dt>Strong at</dt><dd>${student.strengths.join(", ")}</dd></div>
        <div class="fact"><dt>Wants</dt><dd>${student.prefers.join(", ")}</dd></div>
        <div class="fact"><dt>Avoids</dt><dd>${student.avoids.join(", ")}</dd></div>
        <div class="fact"><dt>Capacity</dt><dd>${student.capacity} effort points</dd></div>
      </dl>
      <div class="private-chip">🔒 ${student.private_calendar.length} private calendar details withheld</div>
    </article>
  `).join("");
}

async function request(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "The agents lost the thread.");
  return data;
}

async function startNegotiation() {
  const button = $("#start-button");
  button.disabled = true;
  button.textContent = "Agents are bargaining…";
  try {
    session = await request("/api/negotiate", { students });
    $("#empty-state").classList.add("hidden");
    $("#workspace-content").classList.remove("hidden");
    renderSession();
    $("#workspace").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = "Negotiate again <span>→</span>";
  }
}

function renderSession() {
  const proposal = session.proposal;
  $("#round-number").textContent = session.round;
  $("#fairness-score").textContent = proposal.fairness_score;
  $("#meeting-time").textContent = proposal.meeting.slot || "No shared slot";
  $("#meeting-note").textContent = proposal.meeting.needs_confirmation
    ? `${proposal.meeting.attendance}/${students.length} can attend · needs human choice`
    : `all ${students.length} agents found this slot`;

  const statusPill = $("#status-pill");
  statusPill.textContent = session.status === "signed" ? "Treaty signed" : "Awaiting confirmation";
  statusPill.classList.toggle("signed", session.status === "signed");

  $("#conflict-box").innerHTML = proposal.collisions.length
    ? `<strong>Preference collision:</strong> ${proposal.collisions.join(" · ")}. Agents used skills, capacity, and fairness as tiebreakers.`
    : `<strong>Clean negotiation:</strong> no role preference collisions this round.`;

  $("#conversation").innerHTML = proposal.log.map((entry) => `
    <div class="message"><strong>${entry.speaker}</strong><span>${entry.message}</span></div>
  `).join("");

  $("#assignments").innerHTML = proposal.assignments.map((assignment) => `
    <div class="assignment">
      <div><h4>${assignment.role}</h4><p>${assignment.effort} effort ${assignment.effort === 1 ? "point" : "points"} · ${assignment.reason}</p></div>
      <span class="owner">${assignment.owner}</span>
    </div>
  `).join("");

  renderApprovals();
}

function renderApprovals() {
  if (session.status === "signed") {
    $("#consent-title").textContent = "Treaty signed. The group can finally start.";
    $("#consent-description").textContent = "Every student approved the same roles and meeting time. The agents can now carry the plan back to their owners.";
  } else {
    $("#consent-title").textContent = "Three signatures. Zero surprise labor.";
    $("#consent-description").textContent = "Each agent brings the proposal back to its student. One rejection reopens the whole negotiation without exposing why.";
  }

  $("#approval-grid").innerHTML = students.map((student) => {
    const state = session.approvals[student.id];
    if (state === "approved" || session.status === "signed") {
      return `<div class="approval-row resolved"><div><strong>${student.name}</strong><span>student confirmation</span></div><div class="approval-state">✓ approved</div></div>`;
    }
    return `
      <div class="approval-row">
        <div><strong>${student.name}</strong><span>student confirmation</span></div>
        <button class="reject" data-student="${student.id}" data-approved="false">Reject privately</button>
        <button class="approve" data-student="${student.id}" data-approved="true">Approve</button>
      </div>
    `;
  }).join("");

  document.querySelectorAll("[data-student]").forEach((button) => {
    button.addEventListener("click", () => respond(button.dataset.student, button.dataset.approved === "true"));
  });
}

async function respond(studentId, approved) {
  document.querySelectorAll("[data-student]").forEach((button) => { button.disabled = true; });
  try {
    session = await request("/api/confirm", {
      session_id: session.session_id,
      student_id: studentId,
      approved,
    });
    renderSession();
  } catch (error) {
    alert(error.message);
    renderApprovals();
  }
}

function resetDemo() {
  session = null;
  $("#workspace-content").classList.add("hidden");
  $("#empty-state").classList.remove("hidden");
  $("#start-button").innerHTML = "Negotiate the prenup <span>→</span>";
}

renderAgents();
$("#start-button").addEventListener("click", startNegotiation);
$("#reset-button").addEventListener("click", resetDemo);
