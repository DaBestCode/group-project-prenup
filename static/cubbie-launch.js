export const SKILL_URL = "https://github.com/DaBestCode/group-project-prenup/tree/main/skills/group-project-prenup";

export function buildCubbiePrompt({ roomCode, title, roomUrl }) {
  return [
    "Install or update Group Project Prenup and connect me to my personal backend agent.",
    `Project: ${title || "our group project"}`,
    `Room code: ${roomCode}`,
    `Room: ${roomUrl}`,
    `Skill: ${SKILL_URL}`,
    "Ask before launching my agent with the redacted profile, then watch its inbox and text me when I need to approve.",
  ].join("\n");
}

export function buildSmsUrl(message, recipient = "") {
  return `sms:${recipient}?body=${encodeURIComponent(message)}`;
}
