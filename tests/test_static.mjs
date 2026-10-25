import assert from "node:assert/strict";
import { confirmSession, createSession } from "../static/negotiator.js";
import { buildCubbiePrompt, buildSmsUrl, SKILL_URL } from "../static/cubbie-launch.js";

const students = [
  { id: "maya", name: "Maya", strengths: ["research"], prefers: ["research"], avoids: ["presentation"], available: ["Thu"], capacity: 3 },
  { id: "jordan", name: "Jordan", strengths: ["design", "presentation"], prefers: ["research"], avoids: ["slides"], available: ["Thu"], capacity: 3 },
  { id: "leo", name: "Leo", strengths: ["analysis"], prefers: ["research"], avoids: ["slides"], available: ["Thu"], capacity: 3 },
];

const first = createSession(students);
assert.equal(first.proposal.assignments.length, 4);
assert.equal(first.proposal.meeting.slot, "Thu");
assert.equal(first.proposal.meeting.attendance, 3);

const previousRoles = first.proposal.assignments.filter((item) => item.owner_id === "jordan").map((item) => item.role_id);
const revised = confirmSession(first, "jordan", false);
const revisedRoles = revised.proposal.assignments.filter((item) => item.owner_id === "jordan").map((item) => item.role_id);
assert.equal(revised.round, 2);
assert.ok(previousRoles.every((role) => !revisedRoles.includes(role)));

let signed = confirmSession(revised, "maya", true);
signed = confirmSession(signed, "jordan", true);
signed = confirmSession(signed, "leo", true);
assert.equal(signed.status, "signed");
console.log("static negotiator: all assertions passed");

const launchMessage = buildCubbiePrompt({ roomCode: "ABC234", title: "CSE 412 Final", roomUrl: "https://example.test/room?room=ABC234" });
assert.match(launchMessage, /Room code: ABC234/);
assert.match(launchMessage, /CSE 412 Final/);
assert.ok(launchMessage.includes(SKILL_URL));
assert.equal(buildSmsUrl(launchMessage).startsWith("sms:?body="), true);
assert.equal(decodeURIComponent(buildSmsUrl(launchMessage).split("?body=")[1]), launchMessage);
console.log("Cubbie launch: all assertions passed");
