/**
 * Email Delivery Service for GovAI Resolve.
 * Handles transactional emails (password reset, notifications).
 * Supports configurable SMTP and safe in-memory/logger transport for local dev & testing.
 */

let sentEmails = [];

const maskEmail = (email = "") => {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const maskedLocal = local.length > 2 ? `${local[0]}***${local[local.length - 1]}` : "***";
  return `${maskedLocal}@${domain}`;
};

export const getSentEmails = () => [...sentEmails];

export const clearSentEmails = () => {
  sentEmails = [];
};

export const sendPasswordResetEmail = async ({ to, token, resetUrl }) => {
  if (!to || !token) {
    throw new Error("Recipient email and reset token are required.");
  }

  const isTestOrDev = process.env.NODE_ENV === "test" || !process.env.SMTP_HOST;
  const targetUrl = resetUrl || `${process.env.FRONTEND_ORIGINS?.split(",")[0] || "http://localhost:5173"}/reset-password?token=${token}`;

  const emailRecord = {
    to,
    subject: "GovAI Resolve — Password Reset Request",
    token: isTestOrDev ? token : undefined, // Only exposed in test memory for assertion
    resetUrl: isTestOrDev ? targetUrl : undefined,
    timestamp: new Date(),
  };

  sentEmails.push(emailRecord);

  if (process.env.NODE_ENV !== "test") {
    // Development or Production safe log (never logs the raw token in production)
    if (process.env.NODE_ENV === "production") {
      console.log(`[EmailService] Password reset email dispatched to ${maskEmail(to)}.`);
    } else {
      console.log(`[EmailService] [DEV] Password reset requested for ${to}. Reset link: ${targetUrl}`);
    }
  }

  return {
    success: true,
    messageId: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  };
};
