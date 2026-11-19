import { Complaint } from "../models/Complaint.js";
import { Member } from "../models/Member.js";
import { DEPARTMENTS } from "../models/User.js";
import { generateGeminiText, GEMINI_MODEL } from "../services/gemini.service.js";
import {
  buildDepartmentComplaintFilter,
  buildOfficerComplaintFilter,
  isDepartmentOfficer,
} from "../services/complaintAccess.service.js";

const ROLE_LABELS = {
  citizen: "citizen",
  department: "department user",
  admin: "admin",
};

const buildComplaintSummary = (complaints) => {
  const totalsByStatus = complaints.reduce((acc, complaint) => {
    acc[complaint.status] = (acc[complaint.status] || 0) + 1;
    return acc;
  }, {});

  const totalsByCategory = complaints.reduce((acc, complaint) => {
    acc[complaint.category] = (acc[complaint.category] || 0) + 1;
    return acc;
  }, {});

  const recentItems = complaints.slice(0, 8).map((complaint) => {
    const assignedTo = complaint.assignedTo?.name ? ` assigned to ${complaint.assignedTo.name}` : "";
    const location = complaint.location ? ` at ${complaint.location}` : "";

    return [
      `- ${complaint.title}`,
      `(${complaint.category}, ${complaint.status}${assignedTo}${location}, created ${new Date(complaint.createdAt).toLocaleDateString("en-US")})`,
    ].join(" ");
  });

  return {
    total: complaints.length,
    totalsByStatus,
    totalsByCategory,
    recentItems,
  };
};

const buildSystemInstruction = ({ user, summary }) => {
  const statusLine = Object.entries(summary.totalsByStatus)
    .map(([status, count]) => `${status}: ${count}`)
    .join(", ") || "No complaints found";

  const categoryLine = Object.entries(summary.totalsByCategory)
    .map(([category, count]) => `${category}: ${count}`)
    .join(", ") || "No category data";

  const recentLine = summary.recentItems.length
    ? summary.recentItems.join("\n")
    : "- No recent complaints available.";

  return [
    "You are GovAI Assistant for a civic complaint-resolution platform.",
    `The current signed-in user is a ${ROLE_LABELS[user.role] || user.role} named ${user.name}.`,
    "Only answer using the complaint-governance context below and general product guidance for this app.",
    "If the user asks for data you do not have, say that clearly instead of inventing information.",
    "Keep answers practical, concise, and easy to scan.",
    "When relevant, suggest the next best action inside the app.",
    "",
    `Visible complaint count: ${summary.total}`,
    `Status breakdown: ${statusLine}`,
    `Category breakdown: ${categoryLine}`,
    "Recent visible complaints:",
    recentLine,
  ].join("\n");
};

const fetchVisibleComplaints = async (user) => {
  const baseQuery = Complaint.find({})
    .populate({ path: "assignedTo", select: "name department" })
    .sort({ createdAt: -1 })
    .limit(user.role === "admin" ? 40 : 20);

  if (user.role === "citizen") {
    return baseQuery.where({ createdBy: user._id });
  }

  if (user.role === "department") {
    if (!DEPARTMENTS.includes(user.department)) {
      return [];
    }
    if (user.departmentRole === "authority") {
      return baseQuery.where(buildDepartmentComplaintFilter(user.department));
    }
    if (isDepartmentOfficer(user)) {
      const member = await Member.findOne({ userId: user._id, department: user.department })
        .select("_id")
        .lean();
      if (!member) return [];
      return baseQuery.where(buildOfficerComplaintFilter(user.department, member._id));
    }
    return [];
  }

  return baseQuery;
};

export const chatWithAssistant = async (req, res) => {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];

  if (!messages.length) {
    return res.status(400).json({ message: "At least one message is required." });
  }

  const normalizedMessages = messages
    .filter((message) => typeof message?.text === "string" && message.text.trim())
    .slice(-12)
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.text.trim() }],
    }));

  if (!normalizedMessages.length) {
    return res.status(400).json({ message: "No valid message text was provided." });
  }

  try {
    const visibleComplaints = await fetchVisibleComplaints(req.user);
    const summary = buildComplaintSummary(visibleComplaints);
    const systemInstruction = buildSystemInstruction({ user: req.user, summary });

    const reply = await generateGeminiText(systemInstruction, {
      contents: normalizedMessages,
      generationConfig: {
        temperature: 0.4,
        topP: 0.9,
        maxOutputTokens: 500,
      },
    });

    return res.json({
      reply,
      model: GEMINI_MODEL,
      complaintCount: summary.total,
    });
  } catch (error) {
    if (error.code === "MISSING_API_KEY") {
      return res.status(503).json({
        message: "Assistant is not configured yet. Add GEMINI_API_KEY to backend/.env and restart the server.",
      });
    }

    if (error.statusCode === 502) {
      return res.status(502).json({ message: error.message });
    }

    return res.status(500).json({
      message: "Failed to generate assistant response.",
      error: error.message,
    });
  }
};
