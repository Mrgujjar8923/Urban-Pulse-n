const VALID_SLA_STATES = ["Resolved", "Overdue", "Due Soon", "On Track", "Unavailable"];

const toDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const calculateSlaState = (complaint, now = new Date()) => {
  if (complaint?.status === "Resolved") {
    return {
      slaStatus: "Resolved",
      remainingMs: 0,
      isOverdue: false,
    };
  }

  const deadline = toDate(complaint?.sla?.deadline);
  const durationMinutes = Number(complaint?.sla?.durationMinutes);
  if (!deadline || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return {
      slaStatus: "Unavailable",
      remainingMs: null,
      isOverdue: false,
    };
  }

  const remainingMs = deadline.getTime() - now.getTime();
  const durationMs = durationMinutes * 60 * 1000;
  const isOverdue = remainingMs < 0;

  return {
    slaStatus: isOverdue
      ? "Overdue"
      : remainingMs <= durationMs * 0.2
        ? "Due Soon"
        : "On Track",
    remainingMs,
    isOverdue,
  };
};

export const withCalculatedSla = (complaint, now = new Date()) => {
  const data = typeof complaint?.toObject === "function" ? complaint.toObject() : { ...complaint };
  return {
    ...data,
    ...(data.sla
      ? { sla: { ...data.sla, ...calculateSlaState(data, now) } }
      : { sla: { ...calculateSlaState(data, now) } }),
  };
};

export { VALID_SLA_STATES };
