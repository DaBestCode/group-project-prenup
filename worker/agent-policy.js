import { roles } from "../static/negotiator.js";

function createAgentPolicy(profile) {
  return {
    strengths: [...profile.strengths],
    prefers: [...profile.prefers],
    avoids: [...profile.avoids],
    available: [...profile.available],
    capacity: profile.capacity,
    declined_roles: [...(profile.declined_roles || [])],
  };
}

function buildRoleBid(profile) {
  return roles.map((role) => {
    let score = 0;
    const signals = [];
    if (profile.prefers.includes(role.id)) {
      score += 9;
      signals.push("owner preference");
    }
    if (profile.strengths.includes(role.skill)) {
      score += 7;
      signals.push("skill match");
    }
    if (profile.avoids.includes(role.id)) {
      score -= 40;
      signals.push("owner constraint");
    }
    if ((profile.declined_roles || []).includes(role.id)) {
      score -= 1000;
      signals.push("declined in an earlier round");
    }
    return { role_id: role.id, role: role.label, score, willing: score > -40, signals };
  });
}

function evaluateProposal(profile, proposal) {
  const assignments = proposal.assignments.filter((assignment) => assignment.owner_id === profile.id);
  const assignedRoleIds = assignments.map((assignment) => assignment.role_id);
  const unavailableRoles = assignedRoleIds.filter(
    (roleId) => profile.avoids.includes(roleId) || (profile.declined_roles || []).includes(roleId),
  );
  const load = assignments.reduce((total, assignment) => total + assignment.effort, 0);
  const overloaded = load > profile.capacity;
  const meetingConflict = Boolean(proposal.meeting.slot && !profile.available.includes(proposal.meeting.slot));
  const matchingRoles = assignments.filter(
    (assignment) => profile.prefers.includes(assignment.role_id)
      || profile.strengths.includes(roles.find((role) => role.id === assignment.role_id)?.skill),
  ).length;

  if (unavailableRoles.length || overloaded) {
    const reasons = [];
    if (unavailableRoles.length) reasons.push(`${unavailableRoles.length} role constraint${unavailableRoles.length === 1 ? "" : "s"}`);
    if (overloaded) reasons.push(`load ${load} exceeds capacity ${profile.capacity}`);
    return {
      recommendation: "counter",
      unavailable_roles: unavailableRoles,
      load,
      capacity: profile.capacity,
      meeting_conflict: meetingConflict,
      public_reason: `Countered because ${reasons.join(" and ")}.`,
    };
  }

  return {
    recommendation: meetingConflict ? "owner_tradeoff" : "recommend_accept",
    unavailable_roles: [],
    load,
    capacity: profile.capacity,
    meeting_conflict: meetingConflict,
    public_reason: meetingConflict
      ? "The role split works, but the proposed meeting is outside this owner's availability."
      : `Recommends accepting: ${matchingRoles} ${matchingRoles === 1 ? "assignment matches" : "assignments match"} owner signals and load ${load}/${profile.capacity} stays within capacity.`,
  };
}

export { buildRoleBid, createAgentPolicy, evaluateProposal };
