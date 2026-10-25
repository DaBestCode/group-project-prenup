import assert from "node:assert/strict";
import { discordEvents, discordPayload, relayTrace, validDiscordWebhook } from "../worker/discord-relay.js";

const webhook = "https://discord.com/api/webhooks/123456789/token_value";
assert.equal(validDiscordWebhook(webhook), true);
assert.equal(validDiscordWebhook("https://example.com/api/webhooks/123/token"), false);

const trace = [
  { round: 0, actor: "Maya's agent", action: "BID SUBMITTED", outcome: "Top bid: Research." },
  { round: 1, actor: "Coordinator", action: "DRAFT CREATED", outcome: "Draft one." },
  { round: 1, actor: "Maya's agent", action: "DRAFT REJECTED", outcome: "Countering." },
  { round: 1, actor: "Maya's agent", action: "COUNTER SENT", outcome: "Removed slides." },
  { round: 2, actor: "Maya's agent", action: "DRAFT ACCEPTABLE", outcome: "Acceptable." },
  { round: 2, actor: "Coordinator", action: "OWNER HANDOFF", outcome: "Please approve." },
];
assert.equal(discordEvents(trace).length, 5);
const payload = discordPayload(trace[0], { code: "ABC234", url: "https://example.test/room?room=ABC234" });
assert.equal(payload.username, "Maya's agent");
assert.equal(payload.allowed_mentions.parse.length, 0);
assert.match(payload.avatar_url, /agent-avatar/);

const sent = [];
let messageId = 100;
const receipts = await relayTrace(webhook, trace, { code: "ABC234", url: "https://example.test/room?room=ABC234" }, {
  fetchImpl: async (url, options) => {
    sent.push({ url, payload: JSON.parse(options.body) });
    messageId += 1;
    return { ok: true, status: 200, json: async () => ({ id: String(messageId), channel_id: "200", guild_id: "300" }) };
  },
});
assert.equal(receipts.length, 5);
assert.equal(receipts[0].message.guild_id, "300");
assert.equal(sent[0].payload.username, "Maya's agent");
assert.equal(JSON.stringify(sent).includes("token_value"), true);
assert.equal(JSON.stringify(sent).includes("private"), false);

const forumSent = [];
await relayTrace(webhook, [
  { round: 0, actor: "Coordinator", action: "ROOM OPENED", outcome: "Waiting for agents." },
  { round: 0, actor: "Maya's agent", action: "BID SUBMITTED", outcome: "Top bid: Research." },
], { code: "ABC234", url: "https://example.test/room?room=ABC234" }, {
  threadName: "CSE 412 · ABC234",
  fetchImpl: async (url, options) => {
    forumSent.push({ url, payload: JSON.parse(options.body) });
    return { ok: true, status: 200, json: async () => ({ id: String(++messageId), channel_id: "777", guild_id: "300" }) };
  },
});
assert.equal(forumSent[0].payload.thread_name, "CSE 412 · ABC234");
assert.equal(new URL(forumSent[1].url).searchParams.get("thread_id"), "777");
assert.equal(forumSent[1].payload.thread_name, undefined);
console.log("Discord agent relay: all assertions passed");
