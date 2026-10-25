const assert = require("node:assert/strict");
require("../static/negotiator.js");

const students = [
  { id: "maya", name: "Maya", strengths: ["research"], prefers: ["research"], avoids: ["presentation"], available: ["Thu"], capacity: 3 },
  { id: "jordan", name: "Jordan", strengths: ["design", "presentation"], prefers: ["research"], avoids: ["slides"], available: ["Thu"], capacity: 3 },
  { id: "leo", name: "Leo", strengths: ["analysis"], prefers: ["research"], avoids: ["slides"], available: ["Thu"], capacity: 3 },
];

const first = PrenupEngine.createSession(students);
assert.equal(first.proposal.assignments.length, 4);
assert.equal(first.proposal.meeting.slot, "Thu");
assert.equal(first.proposal.meeting.attendance, 3);

const previousRoles = first.proposal.assignments.filter((item) => item.owner_id === "jordan").map((item) => item.role_id);
const revised = PrenupEngine.confirmSession(first, "jordan", false);
const revisedRoles = revised.proposal.assignments.filter((item) => item.owner_id === "jordan").map((item) => item.role_id);
assert.equal(revised.round, 2);
assert.ok(previousRoles.every((role) => !revisedRoles.includes(role)));

let signed = PrenupEngine.confirmSession(revised, "maya", true);
signed = PrenupEngine.confirmSession(signed, "jordan", true);
signed = PrenupEngine.confirmSession(signed, "leo", true);
assert.equal(signed.status, "signed");
console.log("static negotiator: all assertions passed");
