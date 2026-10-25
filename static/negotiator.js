const roles = [
    { id: "research", label: "Research lead", skill: "research", effort: 2 },
    { id: "analysis", label: "Analysis + build", skill: "analysis", effort: 3 },
    { id: "slides", label: "Slide architect", skill: "design", effort: 2 },
    { id: "presentation", label: "Presentation lead", skill: "presentation", effort: 1 },
  ];

  const copy = (value) => JSON.parse(JSON.stringify(value));

  function assignmentReason(student, role) {
    if (student.prefers.includes(role.id) && student.strengths.includes(role.skill)) return "preferred role + strongest skill match";
    if (student.strengths.includes(role.skill)) return "strongest skill match";
    if (student.prefers.includes(role.id)) return "preferred role";
    return "best remaining fairness fit";
  }

  function compareArrays(left, right) {
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] > right[index]) return 1;
      if (left[index] < right[index]) return -1;
    }
    return 0;
  }

  function chooseAssignments(students) {
    let best = null;
    const ownerChoices = students.length ** roles.length;
    for (let choice = 0; choice < ownerChoices; choice += 1) {
      let cursor = choice;
      const owners = [];
      for (let roleIndex = 0; roleIndex < roles.length; roleIndex += 1) {
        owners.push(cursor % students.length);
        cursor = Math.floor(cursor / students.length);
      }

      let score = 0;
      const loads = Object.fromEntries(students.map((student) => [student.id, 0]));
      const compromises = [];
      roles.forEach((role, roleIndex) => {
        const student = students[owners[roleIndex]];
        loads[student.id] += role.effort;
        if (student.prefers.includes(role.id)) score += 9;
        if (student.strengths.includes(role.skill)) score += 7;
        if (student.avoids.includes(role.id)) {
          score -= 14;
          compromises.push(`${student.name} received ${role.label} despite avoiding it`);
        }
        if (student.declined_roles.includes(role.id)) score -= 1000;
      });
      students.forEach((student) => { score -= Math.max(0, loads[student.id] - student.capacity) * 20; });
      const loadValues = students.map((student) => loads[student.id]);
      score -= (Math.max(...loadValues) - Math.min(...loadValues)) * 3;

      const tieBreak = [
        ...loadValues.map((load) => -load),
        ...owners.map((owner) => students[owner].id),
      ];
      if (!best || score > best.score || (score === best.score && compareArrays(tieBreak, best.tieBreak) > 0)) {
        best = { score, tieBreak, owners, loads, compromises };
      }
    }

    return {
      assignments: roles.map((role, index) => {
        const owner = students[best.owners[index]];
        return {
          role_id: role.id,
          role: role.label,
          owner_id: owner.id,
          owner: owner.name,
          effort: role.effort,
          reason: assignmentReason(owner, role),
        };
      }),
      loads: best.loads,
      compromises: best.compromises,
    };
  }

  function chooseMeeting(students) {
    const counts = new Map();
    students.forEach((student) => student.available.forEach((slot) => counts.set(slot, (counts.get(slot) || 0) + 1)));
    const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
    if (!ranked.length) return { slot: null, attendance: 0, needs_confirmation: true };
    return { slot: ranked[0][0], attendance: ranked[0][1], needs_confirmation: ranked[0][1] !== students.length };
  }

  function negotiate(rawStudents) {
    const students = copy(rawStudents).map((student) => ({ ...student, declined_roles: student.declined_roles || [] }));
    const { assignments, loads, compromises } = chooseAssignments(students);
    const collisions = roles.flatMap((role) => {
      const count = students.filter((student) => student.prefers.includes(role.id)).length;
      return count > 1 ? [`${count} agents requested ${role.label}`] : [];
    });
    const loadValues = Object.values(loads);
    const fairness = Math.max(0, Math.min(100, 100 - (Math.max(...loadValues) - Math.min(...loadValues)) * 12 - compromises.length * 6));
    const log = students.map((student) => ({
      speaker: `${student.name}'s agent`,
      message: `Shared role signals, ${student.capacity} effort points, and ${student.available.length} possible meeting slots. Private details stayed private.`,
    }));
    if (collisions.length) log.push({ speaker: "Negotiator", message: `Conflict found: ${collisions.join("; ")}.` });
    if (compromises.length) log.push({ speaker: "Negotiator", message: "No perfect split exists. Proposed the least costly compromise and flagged it for consent." });
    log.push({ speaker: "Negotiator", message: "Drafted a balanced treaty. Nothing becomes final until every student approves." });
    return { students, assignments, loads, compromises, collisions, meeting: chooseMeeting(students), fairness_score: fairness, log };
  }

  function createSession(rawStudents) {
    const result = negotiate(rawStudents);
    const sessionStudents = result.students;
    delete result.students;
    return {
      session_id: "browser-demo",
      round: 1,
      status: "awaiting_confirmation",
      approvals: Object.fromEntries(rawStudents.map((student) => [student.id, "pending"])),
      proposal: result,
      _students: sessionStudents,
    };
  }

  function confirmSession(session, studentId, approved) {
    const next = copy(session);
    if (!(studentId in next.approvals)) throw new Error("That student is not part of this negotiation.");
    if (approved) {
      next.approvals[studentId] = "approved";
      if (Object.values(next.approvals).every((value) => value === "approved")) next.status = "signed";
      return next;
    }

    const assignedRoles = next.proposal.assignments.filter((item) => item.owner_id === studentId).map((item) => item.role_id);
    const student = next._students.find((item) => item.id === studentId);
    student.declined_roles = [...new Set([...student.declined_roles, ...assignedRoles])].sort();
    const result = negotiate(next._students);
    next._students = result.students;
    delete result.students;
    result.log.unshift({ speaker: `${student.name}'s agent`, message: "Student rejected privately. Shared only the newly unavailable role, then reopened bargaining." });
    next.proposal = result;
    next.round += 1;
    next.status = "awaiting_confirmation";
    next.approvals = Object.fromEntries(Object.keys(next.approvals).map((id) => [id, "pending"]));
    return next;
  }

export { confirmSession, createSession, negotiate };
