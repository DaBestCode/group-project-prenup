export const SKILL_URL = "https://github.com/DaBestCode/group-project-prenup/tree/main/skills/group-project-prenup";

export function buildCubbiePrompt({ roomCode, title, roomUrl, profile }) {
  const message = [
    "Install or update Group Project Prenup and join this project room as my personal agent.",
    `Project: ${title || "our group project"}`,
    `Room code: ${roomCode}`,
    `Room: ${roomUrl}`,
    `Skill: ${SKILL_URL}`,
  ];
  if (profile) {
    message.push(
      "Shareable profile draft:",
      `Name: ${profile.name}`,
      `Strengths: ${profile.strengths.join(", ") || "none listed"}`,
      `Preferred roles: ${profile.prefers.join(", ") || "none listed"}`,
      `Roles to avoid: ${profile.avoids.join(", ") || "none listed"}`,
      `Available times: ${profile.available.join(" | ") || "none listed"}`,
      `Workload capacity: ${profile.capacity} effort points`,
    );
  }
  message.push("Show me the exact shareable profile and ask before joining. Then watch the agent inbox and text me when I need to approve.");
  return message.join("\n");
}

export function buildSmsUrl(message, recipient = "") {
  return `sms:${recipient}?body=${encodeURIComponent(message)}`;
}
