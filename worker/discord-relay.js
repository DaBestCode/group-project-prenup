const DISCORD_WEBHOOK_PATTERN = /^https:\/\/(?:canary\.|ptb\.)?(?:discord(?:app)?\.com)\/api(?:\/v\d+)?\/webhooks\/\d+\/[A-Za-z0-9._-]+$/;

function validDiscordWebhook(url) {
  return DISCORD_WEBHOOK_PATTERN.test(String(url || "").replace(/\/$/, ""));
}

function displayName(actor) {
  const clean = String(actor || "Prenup Agent").replace(/discord/gi, "agent").slice(0, 70);
  return clean === "Coordinator" ? "Prenup Coordinator" : clean;
}

function avatarUrl(origin, actor) {
  return `${origin}/api/agent-avatar/${encodeURIComponent(actor)}`;
}

function discordPayload(event, room) {
  const color = event.actor === "Coordinator" ? 0xd9ff4f : 0x4f68ff;
  return {
    username: displayName(event.actor),
    avatar_url: avatarUrl(new URL(room.url).origin, event.actor),
    content: `**${event.action}** · Room \`${room.code}\`${event.round ? ` · Round ${event.round}` : ""}`,
    embeds: [{
      description: event.outcome,
      color,
      footer: { text: "Group Project Prenup · autonomous agent protocol" },
      url: room.url,
    }],
    allowed_mentions: { parse: [] },
  };
}

function discordEvents(trace) {
  const finalRound = Math.max(0, ...trace.map((event) => Number(event.round) || 0));
  return trace.filter((event) => (
    event.action === "ROOM OPENED"
    || event.action === "BID SUBMITTED"
    || event.action === "DRAFT CREATED"
    || event.action === "COUNTER SENT"
    || event.action === "OWNER HANDOFF"
    || event.action === "OWNER APPROVED"
    || event.action === "TREATY SIGNED"
    || (event.round === finalRound && ["DRAFT ACCEPTABLE", "TRADEOFF FLAGGED", "DRAFT REJECTED"].includes(event.action))
  ));
}

async function postDiscord(webhookUrl, payload, fetchImpl = fetch, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), threadId = null) {
  const endpoint = new URL(webhookUrl.replace(/\/$/, ""));
  endpoint.searchParams.set("wait", "true");
  if (threadId) endpoint.searchParams.set("thread_id", threadId);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetchImpl(endpoint.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (response.ok) return response.json();
    if (response.status !== 429) throw new Error(`Discord webhook returned ${response.status}.`);
    const rateLimit = await response.json().catch(() => ({}));
    await wait(Math.max(250, Math.ceil(Number(rateLimit.retry_after || 1) * 1000)));
  }
  throw new Error("Discord webhook stayed rate limited after three attempts.");
}

async function relayTrace(webhookUrl, trace, room, options = {}) {
  if (!validDiscordWebhook(webhookUrl)) throw new Error("DISCORD_WEBHOOK_URL is not a valid Discord webhook URL.");
  const events = discordEvents(trace);
  const receipts = [];
  let threadId = options.threadId || null;
  for (const event of events) {
    const payload = discordPayload(event, room);
    if (!threadId && options.threadName) payload.thread_name = options.threadName;
    const message = await postDiscord(webhookUrl, payload, options.fetchImpl, options.wait, threadId);
    if (!threadId && options.threadName && /^\d+$/.test(String(message?.channel_id || ""))) threadId = String(message.channel_id);
    receipts.push({ event, message });
  }
  return receipts;
}

export { discordEvents, discordPayload, relayTrace, validDiscordWebhook };
