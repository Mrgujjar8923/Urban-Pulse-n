export const SLA_DURATION_MINUTES = Object.freeze({
  Critical: 4 * 60,
  High: 24 * 60,
  Medium: 72 * 60,
  Low: 168 * 60,
});

export const getSlaDurationMinutes = (priority) => SLA_DURATION_MINUTES[priority] ?? null;
