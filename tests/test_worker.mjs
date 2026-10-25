import assert from "node:assert/strict";
import { cleanList, discordMessageUrl, safeProfile } from "../worker/index.js";

assert.deepEqual(cleanList(["research", "research", "  slides  "]), ["research", "slides"]);
const profile = safeProfile({
  name: " Maya ",
  strengths: ["research"],
  private_note: "Do not share this",
  private_calendar: [{ title: "Therapy" }],
  capacity: 99,
}, "student-1");
assert.equal(profile.name, "Maya");
assert.equal(profile.capacity, 6);
assert.equal(profile.private_note, "");
assert.deepEqual(profile.private_calendar, []);
assert.equal(JSON.stringify(profile).includes("Therapy"), false);
assert.equal(discordMessageUrl("300", "200", "101"), "https://discord.com/channels/300/200/101");
assert.equal(discordMessageUrl("bad", "200", "101"), null);
console.log("worker privacy tests passed");
