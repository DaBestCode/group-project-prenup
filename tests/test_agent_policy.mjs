import assert from "node:assert/strict";
import { buildRoleBid, createAgentPolicy, evaluateProposal } from "../worker/agent-policy.js";

const maya = {
  id: "maya",
  name: "Maya",
  strengths: ["research"],
  prefers: ["research"],
  avoids: ["presentation"],
  declined_roles: [],
  available: ["Thu"],
  capacity: 3,
  private_note: "Never share me",
};

const policy = createAgentPolicy(maya);
assert.equal(JSON.stringify(policy).includes("Never share me"), false);
const bids = buildRoleBid(maya);
assert.ok(bids.find((bid) => bid.role_id === "research").score > 0);
assert.equal(bids.find((bid) => bid.role_id === "presentation").willing, false);

const acceptable = evaluateProposal(maya, {
  assignments: [{ owner_id: "maya", role_id: "research", effort: 2 }],
  meeting: { slot: "Thu" },
});
assert.equal(acceptable.recommendation, "recommend_accept");

const counter = evaluateProposal(maya, {
  assignments: [{ owner_id: "maya", role_id: "presentation", effort: 1 }],
  meeting: { slot: "Thu" },
});
assert.equal(counter.recommendation, "counter");
assert.deepEqual(counter.unavailable_roles, ["presentation"]);
assert.equal(JSON.stringify(counter).includes("Never share me"), false);

const overloaded = evaluateProposal(maya, {
  assignments: [
    { owner_id: "maya", role_id: "analysis", effort: 3 },
    { owner_id: "maya", role_id: "slides", effort: 2 },
  ],
  meeting: { slot: "Thu" },
});
assert.equal(overloaded.recommendation, "counter");
console.log("personal agent policy: all assertions passed");
