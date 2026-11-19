const OFFICER_REQUIRED_STATUSES = new Set(["Assigned", "In Progress"]);

const VALID_STATUS_TRANSITIONS = {
  Pending: new Set(["Assigned"]),
  Assigned: new Set(["In Progress", "Resolved"]),
  "In Progress": new Set(["Assigned", "Resolved"]),
  Resolved: new Set(["Assigned", "In Progress"]),
};

export const validateStatusTransition = (currentStatus, nextStatus, assignedTo) => {
  if (currentStatus === nextStatus) {
    return null;
  }

  const allowedTargets = VALID_STATUS_TRANSITIONS[currentStatus];
  if (!allowedTargets || !allowedTargets.has(nextStatus)) {
    return `Cannot transition complaint status from "${currentStatus}" to "${nextStatus}".`;
  }

  if (OFFICER_REQUIRED_STATUSES.has(nextStatus) && !assignedTo) {
    return `An officer must be assigned before a complaint can be marked ${nextStatus}.`;
  }

  return null;
};

export const validateComplaintStatus = (status, assignedTo, currentStatus) => {
  if (currentStatus) {
    return validateStatusTransition(currentStatus, status, assignedTo);
  }

  if (OFFICER_REQUIRED_STATUSES.has(status) && !assignedTo) {
    return `An officer must be assigned before a complaint can be marked ${status}.`;
  }

  return null;
};

export { OFFICER_REQUIRED_STATUSES, VALID_STATUS_TRANSITIONS };

