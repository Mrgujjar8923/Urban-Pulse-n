import { validationResult } from "express-validator";
import mongoose from "mongoose";
import { Complaint, STATUS } from "../models/Complaint.js";
import { Member } from "../models/Member.js";
import { Feedback } from "../models/Feedback.js";
import { Notification } from "../models/Notification.js";
import { User, DEPARTMENTS } from "../models/User.js";
import {
  generateGeminiText,
  GEMINI_MODEL,
  GeminiServiceError,
  sanitizeProviderMessage,
} from "../services/gemini.service.js";
import {
  uploadEvidenceFile,
  getEvidenceFile,
  deleteEvidenceFile,
} from "../services/evidenceStorage.service.js";
import { getSlaDurationMinutes } from "../config/sla.js";
import { withCalculatedSla } from "../services/sla.service.js";
import {
  notifyComplaintAssignment,
  notifyComplaintStatusChanged,
  notifyDepartmentUsers,
} from "../services/complaintNotification.service.js";
import {
  validateStatusTransition,
} from "../services/complaintWorkflow.service.js";
import {
  buildDepartmentComplaintFilter,
  buildOfficerComplaintFilter,
  canAccessDepartmentComplaint,
  isDepartmentAuthority,
  isDepartmentOfficer,
} from "../services/complaintAccess.service.js";
import {
  parsePagination,
  formatPaginatedResponse,
} from "../utils/pagination.js";

const complaintPopulate = [
  { path: "assignedTo", select: "name department userId" },
  { path: "createdBy", select: "name email role department status" },
  { path: "feedback", select: "rating comment image workCompleted percentDone resolutionId history createdAt updatedAt" },
  { path: "resolutionHistory.resolvedBy", select: "name email role department" },
];

const AI_PRIORITIES = ["Low", "Medium", "High", "Critical"];

const createTimelineEvent = ({ eventType, label, status, note }) => ({
  eventType,
  label,
  ...(status ? { status } : {}),
  timestamp: new Date(),
  ...(note ? { note } : {}),
});

export const createSla = (
  priority = "Medium",
  { startedAt: customStartedAt, resolvedAt } = {}
) => {
  const effectivePriority = AI_PRIORITIES.includes(priority) ? priority : "Medium";
  const durationMinutes = getSlaDurationMinutes(effectivePriority);
  if (!durationMinutes) {
    throw new Error("Cannot initialize SLA for an unsupported priority.");
  }

  const startedAt = customStartedAt instanceof Date
    ? customStartedAt
    : customStartedAt
      ? new Date(customStartedAt)
      : new Date();

  const deadline = new Date(startedAt.getTime() + durationMinutes * 60 * 1000);

  return {
    startedAt,
    durationMinutes,
    deadline,
    ...(resolvedAt ? { resolvedAt: new Date(resolvedAt) } : {}),
  };
};

export const buildComplaintAnalysisPrompt = ({ title, description }) =>
  [
    "Analyze the following civic complaint.",
    "The complaint may be written in English, Hindi, Hinglish, or a mixture of these languages.",
    "Detect the input language, preserve the original meaning in englishTranslation, and return the same JSON structure for every language.",
    "Return only a valid JSON object, with no markdown fences or additional text.",
    `The category and recommendedDepartment values must each be exactly one of: ${DEPARTMENTS.join(", ")}.`,
    `The priority value must be exactly one of: ${AI_PRIORITIES.join(", ")}.`,
    "urgencyScore must be a number from 1 to 10, and confidence must be a number from 0 to 1.",
    "Use these exact JSON keys: detectedLanguage, englishTranslation, category, priority, urgencyScore, confidence, reasoning, detectedIssue, affectedArea, recommendedDepartment, recommendedAction.",
    "",
    `Title: ${title}`,
    `Description: ${description}`,
  ].join("\n");

const extractJsonObjects = (responseText) => {
  const candidates = [];
  for (let firstObjectStart = responseText.indexOf("{");
    firstObjectStart !== -1;
    firstObjectStart = responseText.indexOf("{", firstObjectStart + 1)) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = firstObjectStart; index < responseText.length; index += 1) {
    const character = responseText[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === "\"") {
        inString = false;
      }
      continue;
    }

    if (character === "\"") {
      inString = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        candidates.push(responseText.slice(firstObjectStart, index + 1));
        break;
      }
    }
  }
  }

  return candidates;
};

const isInvalidAnalysisJsonError = (error) =>
  error?.message === "Gemini returned invalid complaint analysis JSON.";

export const parseComplaintAnalysis = (responseText) => {
  if (typeof responseText !== "string") {
    throw new Error("Gemini returned invalid complaint analysis JSON.");
  }

  const trimmedResponse = responseText.replace(/^\uFEFF/, "").trim();
  const fencedMatch = trimmedResponse.match(/```(?:json|javascript|js)?\s*([\s\S]*?)\s*```/i);
  const candidateText = (fencedMatch ? fencedMatch[1] : trimmedResponse).trim();
  const jsonCandidates = (candidateText.startsWith("{") && candidateText.endsWith("}"))
    ? [candidateText]
    : extractJsonObjects(candidateText);

  let analysis;
  for (const jsonCandidate of jsonCandidates) {
    try {
      analysis = JSON.parse(jsonCandidate);
      break;
    } catch {
      // Try the next balanced object when surrounding prose contains braces.
    }
  }

  if (!analysis) {
    throw new Error("Gemini returned invalid complaint analysis JSON.");
  }

  if (!analysis || typeof analysis !== "object" || Array.isArray(analysis)) {
    throw new Error("Gemini returned an invalid complaint analysis object.");
  }

  const textFields = [
    "detectedLanguage",
    "englishTranslation",
    "reasoning",
    "detectedIssue",
    "affectedArea",
    "recommendedAction",
  ];

  if (textFields.some((field) => typeof analysis[field] !== "string" || !analysis[field].trim())) {
    throw new GeminiServiceError(
      "Gemini returned incomplete complaint analysis text.",
      "MALFORMED_ANALYSIS",
      422
    );
  }

  if (typeof analysis.category !== "string" || !analysis.category.trim()) {
    throw new GeminiServiceError(
      "Gemini returned missing complaint category.",
      "MALFORMED_ANALYSIS",
      422
    );
  }

  if (!AI_PRIORITIES.includes(analysis.priority)) {
    throw new GeminiServiceError(
      "Gemini returned an invalid complaint priority.",
      "INVALID_PRIORITY",
      422
    );
  }

  if (!Number.isFinite(analysis.urgencyScore) || analysis.urgencyScore < 1 || analysis.urgencyScore > 10) {
    throw new GeminiServiceError(
      "Gemini returned an invalid urgency score.",
      "INVALID_URGENCY",
      422
    );
  }

  if (!Number.isFinite(analysis.confidence) || analysis.confidence < 0 || analysis.confidence > 1) {
    throw new GeminiServiceError(
      "Gemini returned an invalid confidence score.",
      "INVALID_CONFIDENCE",
      422
    );
  }

  if (typeof analysis.recommendedDepartment !== "string" || !analysis.recommendedDepartment.trim()) {
    throw new GeminiServiceError(
      "Gemini returned missing recommended department.",
      "MALFORMED_ANALYSIS",
      422
    );
  }

  return {
    detectedLanguage: analysis.detectedLanguage.trim(),
    englishTranslation: analysis.englishTranslation.trim(),
    category: analysis.category.trim(),
    priority: analysis.priority,
    urgencyScore: analysis.urgencyScore,
    confidence: analysis.confidence,
    reasoning: analysis.reasoning.trim(),
    detectedIssue: analysis.detectedIssue.trim(),
    affectedArea: analysis.affectedArea.trim(),
    recommendedDepartment: analysis.recommendedDepartment.trim(),
    recommendedAction: analysis.recommendedAction.trim(),
    analyzedAt: new Date(),
  };
};

const generateComplaintAnalysis = async (prompt) => {
  const requestOptions = {
    contents: [{
      role: "user",
      parts: [{ text: "Return the complaint analysis JSON now." }],
    }],
    generationConfig: {
      temperature: 0.2,
      topP: 0.9,
      maxOutputTokens: 600,
      responseMimeType: "application/json",
    },
    attempt: 1,
  };

  try {
    return parseComplaintAnalysis(await generateGeminiText(prompt, requestOptions));
  } catch (error) {
    if (!isInvalidAnalysisJsonError(error)) throw error;

    return parseComplaintAnalysis(await generateGeminiText(
      `${prompt}\nThe previous response was incomplete. Return one complete JSON object with every required key before stopping. Do not truncate the response.`,
      {
        ...requestOptions,
        attempt: 2,
        generationConfig: {
          ...requestOptions.generationConfig,
          temperature: 0.1,
          maxOutputTokens: 900,
        },
      }
    ));
  }
};

export const createComplaint = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const {
      title,
      description,
      category,
      location,
      image,
      latitude,
      longitude,
      clientRequestId,
    } = req.body;

    if (!DEPARTMENTS.includes(category)) {
      return res.status(400).json({ message: "Invalid category" });
    }

    const trimmedTitle = typeof title === "string" ? title.trim() : "";
    const trimmedDescription = typeof description === "string" ? description.trim() : "";

    // 1. Idempotency Check: explicit clientRequestId
    if (clientRequestId && typeof clientRequestId === "string" && clientRequestId.trim()) {
      const existing = await Complaint.findOne({
        createdBy: req.user._id,
        clientRequestId: clientRequestId.trim(),
      }).populate(complaintPopulate);

      if (existing) {
        return res.status(200).json(withCalculatedSla(existing));
      }
    }

    // 2. Duplicate submission protection: rapid duplicate within 30 seconds
    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
    const recentDuplicate = await Complaint.findOne({
      createdBy: req.user._id,
      title: trimmedTitle,
      description: trimmedDescription,
      category,
      createdAt: { $gte: thirtySecondsAgo },
    }).populate(complaintPopulate);

    if (recentDuplicate) {
      return res.status(200).json(withCalculatedSla(recentDuplicate));
    }

    const parseCoordinate = (coord) => {
      if (typeof coord === "number" && !isNaN(coord)) return coord;
      if (typeof coord === "string" && coord.trim() !== "" && !isNaN(Number(coord))) return Number(coord);
      return null;
    };

    // Initialize baseline SLA with standard Medium priority (72h)
    const initialSla = createSla("Medium");

    const initialTimeline = [
      createTimelineEvent({
        eventType: "complaint_created",
        label: "Complaint Created",
        status: "Pending",
      }),
      createTimelineEvent({
        eventType: "department_assigned",
        label: "Department Assigned",
        note: category,
      }),
      createTimelineEvent({
        eventType: "sla_started",
        label: "SLA Started",
        note: "Standard SLA initialized",
      }),
    ];

    // 3. Persist complaint safely FIRST (with atomic database-level concurrency protection)
    let storedEvidence = null;
    let evidenceStorageKey = (typeof image === "string" && image.trim()) ? image.trim() : "";

    if (req.file?.buffer) {
      storedEvidence = await uploadEvidenceFile(req.file.buffer, {
        originalname: req.file.originalname,
        userId: req.user._id?.toString(),
      });
      evidenceStorageKey = storedEvidence.storageKey;
    }

    let complaint;
    try {
      complaint = await Complaint.create({
        title: trimmedTitle,
        description: trimmedDescription,
        category,
        location: location || "",
        latitude: parseCoordinate(latitude),
        longitude: parseCoordinate(longitude),
        image: evidenceStorageKey || "",
        createdBy: req.user._id,
        status: "Pending",
        sla: initialSla,
        timeline: initialTimeline,
        clientRequestId: clientRequestId?.trim() || null,
        aiAnalysis: {
          status: "pending",
          model: GEMINI_MODEL,
          lastAttemptAt: new Date(),
          retryCount: 0,
        },
      });
    } catch (insertError) {
      if (storedEvidence?.storageKey) {
        await deleteEvidenceFile(storedEvidence.storageKey);
      }
      if (insertError?.code === 11000 && clientRequestId) {
        const existing = await Complaint.findOne({
          clientRequestId: clientRequestId.trim(),
        }).populate(complaintPopulate);
        if (existing) {
          return res.status(200).json(withCalculatedSla(existing));
        }
      }
      return res.status(500).json({ message: "Failed to persist complaint", error: insertError.message });
    }

    // 4. Attempt Gemini AI analysis safely (isolated; failure does not invalidate saved complaint)
    let aiOutcome = { status: "pending" };
    try {
      const rawAiAnalysis = await generateComplaintAnalysis(
        buildComplaintAnalysisPrompt({ title: trimmedTitle, description: trimmedDescription })
      );

      const isCategoryValid = DEPARTMENTS.includes(rawAiAnalysis.category);
      if (!isCategoryValid) {
        complaint.aiAnalysis = {
          ...rawAiAnalysis,
          status: "manual_review_required",
          errorCategory: "INVALID_CATEGORY",
          errorMessage: "AI returned unsupported department category.",
          retryCount: 1,
          lastAttemptAt: new Date(),
          model: GEMINI_MODEL,
        };
        complaint.timeline.push(
          createTimelineEvent({
            eventType: "ai_manual_review_required",
            label: "Manual Review Required",
            note: "AI category could not be verified; citizen-selected department preserved.",
          })
        );
        aiOutcome = { status: "manual_review_required", errorCategory: "INVALID_CATEGORY" };
      } else {
        complaint.aiAnalysis = {
          ...rawAiAnalysis,
          status: "completed",
          model: GEMINI_MODEL,
          lastAttemptAt: new Date(),
          retryCount: 1,
        };

        if (rawAiAnalysis.priority && AI_PRIORITIES.includes(rawAiAnalysis.priority)) {
          const originalStartedAt = complaint.sla?.startedAt || complaint.createdAt || new Date();
          complaint.sla = createSla(rawAiAnalysis.priority, {
            startedAt: originalStartedAt,
          });
        }

        complaint.timeline.push(
          createTimelineEvent({
            eventType: "ai_category_classified",
            label: "AI Category Classified",
            note: rawAiAnalysis.category,
          }),
          createTimelineEvent({
            eventType: "ai_priority_detected",
            label: "AI Priority Detected",
            note: rawAiAnalysis.priority,
          })
        );
        aiOutcome = { status: "completed" };
      }
      await complaint.save();
    } catch (aiError) {
      const errorCategory = aiError?.code || "AI_SERVICE_UNAVAILABLE";
      const sanitizedMessage = sanitizeProviderMessage(aiError?.message) || "AI analysis service is temporarily unavailable.";

      console.warn("[Complaint AI analysis] Fallback triggered", {
        complaintId: complaint._id.toString(),
        code: errorCategory,
        message: sanitizedMessage,
      });

      const isManualReview = errorCategory === "INVALID_CATEGORY";
      const status = isManualReview ? "manual_review_required" : "failed";

      complaint.aiAnalysis = {
        status,
        errorCategory,
        errorMessage: sanitizedMessage,
        retryCount: 1,
        lastAttemptAt: new Date(),
        model: GEMINI_MODEL,
      };

      complaint.timeline.push(
        createTimelineEvent({
          eventType: isManualReview ? "ai_manual_review_required" : "ai_analysis_unavailable",
          label: isManualReview ? "Manual Review Required" : "AI Analysis Unavailable",
          note: isManualReview
            ? "AI category could not be verified; citizen-selected department preserved."
            : "Complaint recorded with citizen-selected category and standard SLA.",
        })
      );
      aiOutcome = { status, errorCategory };
      try {
        await complaint.save();
      } catch (saveError) {
        console.warn("[Complaint AI analysis] Failed to save fallback metadata", {
          complaintId: complaint._id.toString(),
          error: saveError.message,
        });
      }
    }

    // 5. Notify department users safely (isolated; secondary failure does not compromise saved complaint)
    let notificationDelivery = "delivered";
    try {
      await notifyDepartmentUsers(complaint);
    } catch (notifyError) {
      notificationDelivery = "failed";
      console.error("[Complaint Intake] Secondary department notification failed", {
        complaintId: complaint._id.toString(),
        error: notifyError.message,
      });
    }

    // 6. Return populated complaint with HTTP 201 Created (isolated population fallback)
    let populatedComplaint = complaint;
    try {
      populatedComplaint = await Complaint.findById(complaint._id).populate(complaintPopulate) || complaint;
    } catch (populateError) {
      console.error("[Complaint Intake] Population query failed, using base document", {
        complaintId: complaint._id.toString(),
        error: populateError.message,
      });
    }

    const resultData = withCalculatedSla(populatedComplaint);

    return res.status(201).json({
      ...resultData,
      _submissionMeta: {
        aiStatus: aiOutcome.status,
        ...(aiOutcome.errorCategory ? { errorCategory: aiOutcome.errorCategory } : {}),
        ...(notificationDelivery === "failed" ? { notificationDelivery: "failed" } : {}),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create complaint", error: error.message });
  }
};

export const retryComplaintAiAnalysis = async (req, res) => {
  try {
    const { id } = req.params;
    const complaint = await Complaint.findById(id);

    if (!complaint) {
      return res.status(404).json({ message: "Complaint not found" });
    }

    // RBAC: Only Admin or Department Authority belonging to the complaint's department
    const isAdmin = req.user.role === "admin";
    const isDeptAuthority =
      req.user.role === "department" &&
      req.user.departmentRole === "authority" &&
      req.user.department === complaint.category;

    if (!isAdmin && !isDeptAuthority) {
      return res.status(403).json({
        message: "Only the department authority or an administrator can retry AI analysis.",
      });
    }

    // If already completed, avoid duplicate AI processing
    if (complaint.aiAnalysis?.status === "completed") {
      const populated = await Complaint.findById(id).populate(complaintPopulate);
      return res.status(200).json({
        message: "AI analysis is already completed for this complaint.",
        complaint: withCalculatedSla(populated),
      });
    }

    // Rate-limit check: enforce 10 seconds between attempts
    const lastAttempt = complaint.aiAnalysis?.lastAttemptAt
      ? new Date(complaint.aiAnalysis.lastAttemptAt).getTime()
      : 0;
    if (Date.now() - lastAttempt < 10000) {
      return res.status(429).json({
        message: "Please wait a few seconds before retrying AI analysis.",
      });
    }

    // Perform analysis
    try {
      const rawAnalysis = await generateComplaintAnalysis(
        buildComplaintAnalysisPrompt({
          title: complaint.title,
          description: complaint.description,
        })
      );

      const isCategoryValid = DEPARTMENTS.includes(rawAnalysis.category);
      if (!isCategoryValid) {
        complaint.aiAnalysis = {
          ...rawAnalysis,
          status: "manual_review_required",
          errorCategory: "INVALID_CATEGORY",
          errorMessage: "AI returned unsupported department category.",
          retryCount: (complaint.aiAnalysis?.retryCount || 0) + 1,
          lastAttemptAt: new Date(),
          model: GEMINI_MODEL,
        };
        complaint.timeline.push(
          createTimelineEvent({
            eventType: "ai_manual_review_required",
            label: "Manual Review Required",
            note: "AI category could not be verified; citizen-selected department preserved.",
          })
        );
      } else {
        complaint.aiAnalysis = {
          ...rawAnalysis,
          status: "completed",
          model: GEMINI_MODEL,
          lastAttemptAt: new Date(),
          retryCount: (complaint.aiAnalysis?.retryCount || 0) + 1,
        };

        if (rawAnalysis.priority && AI_PRIORITIES.includes(rawAnalysis.priority)) {
          // Preserve original startedAt anchor; do not overwrite resolved SLA
          if (complaint.status !== "Resolved" && !complaint.sla?.resolvedAt) {
            const originalStartedAt = complaint.sla?.startedAt || complaint.createdAt || new Date();
            complaint.sla = createSla(rawAnalysis.priority, {
              startedAt: originalStartedAt,
              resolvedAt: complaint.sla?.resolvedAt,
            });
          }
        }

        complaint.timeline.push(
          createTimelineEvent({
            eventType: "ai_analysis_retried",
            label: "AI Analysis Completed",
            note: `Analysis retried: ${rawAnalysis.category} • ${rawAnalysis.priority}`,
          })
        );
      }

      await complaint.save();
      const populated = await Complaint.findById(id).populate(complaintPopulate);
      return res.status(200).json(withCalculatedSla(populated));
    } catch (aiError) {
      const errorCategory = aiError?.code || "AI_SERVICE_UNAVAILABLE";
      const sanitizedMessage = sanitizeProviderMessage(aiError?.message) || "AI analysis retry failed.";

      complaint.aiAnalysis = {
        ...(complaint.aiAnalysis?.toObject ? complaint.aiAnalysis.toObject() : complaint.aiAnalysis || {}),
        status: "failed",
        errorCategory,
        errorMessage: sanitizedMessage,
        retryCount: (complaint.aiAnalysis?.retryCount || 0) + 1,
        lastAttemptAt: new Date(),
        model: GEMINI_MODEL,
      };

      complaint.timeline.push(
        createTimelineEvent({
          eventType: "ai_analysis_retried",
          label: "AI Analysis Retry Failed",
          note: `Retry attempt failed (${errorCategory}).`,
        })
      );

      await complaint.save();
      return res.status(502).json({
        message: `AI analysis retry failed: ${sanitizedMessage}`,
        errorCategory,
      });
    }
  } catch (error) {
    return res.status(500).json({ message: "Failed to retry AI analysis", error: error.message });
  }
};

export const getMyComplaints = async (req, res) => {
  try {
    const filter = { createdBy: req.user._id };
    const { isPaginated, page, limit, skip } = parsePagination(req.query);
    const total = await Complaint.countDocuments(filter);

    const queryChain = Complaint.find(filter)
      .populate(complaintPopulate)
      .sort({ createdAt: -1, _id: -1 });

    if (isPaginated) {
      queryChain.skip(skip).limit(limit);
    }

    const complaints = await queryChain;
    const enriched = complaints.map((complaint) => withCalculatedSla(complaint));

    if (isPaginated) {
      return res.json(formatPaginatedResponse(enriched, total, page, limit));
    }

    res.set("X-Total-Count", String(total));
    return res.json(enriched);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch complaints", error: error.message });
  }
};

export const getMyAssignedComplaints = async (req, res) => {
  try {
    if (!isDepartmentOfficer(req.user)) {
      return res.status(403).json({ message: "Only department officers can access assigned complaints" });
    }
    if (!DEPARTMENTS.includes(req.user.department)) {
      return res.status(403).json({ message: "Department identity is missing or invalid" });
    }

    const member = await Member.findOne({ userId: req.user._id, department: req.user.department })
      .select("_id")
      .lean();
    if (!member) {
      return res.status(403).json({ message: "No officer Member profile is linked to this account" });
    }

    const filter = buildOfficerComplaintFilter(req.user.department, member._id);
    const { isPaginated, page, limit, skip } = parsePagination(req.query);
    const total = await Complaint.countDocuments(filter);

    const queryChain = Complaint.find(filter)
      .populate(complaintPopulate)
      .sort({ createdAt: -1, _id: -1 });

    if (isPaginated) {
      queryChain.skip(skip).limit(limit);
    }

    const complaints = await queryChain;
    const enriched = complaints.map((complaint) => withCalculatedSla(complaint));

    if (isPaginated) {
      return res.json(formatPaginatedResponse(enriched, total, page, limit));
    }

    res.set("X-Total-Count", String(total));
    return res.json(enriched);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch assigned complaints", error: error.message });
  }
};

export const getAllComplaints = async (req, res) => {
  try {
    const filter = {};
    const { department, status, priority } = req.query;
    if (department && department !== "All Departments" && department !== "All") {
      filter.category = department;
    }
    if (status && status !== "All") {
      filter.status = status;
    }
    if (priority && priority !== "All") {
      filter["aiAnalysis.priority"] = priority;
    }

    const { isPaginated, page, limit, skip } = parsePagination(req.query);
    const total = await Complaint.countDocuments(filter);

    const queryChain = Complaint.find(filter)
      .populate(complaintPopulate)
      .sort({ createdAt: -1, _id: -1 });

    if (isPaginated) {
      queryChain.skip(skip).limit(limit);
    }

    const complaints = await queryChain;
    const enriched = complaints.map((complaint) => withCalculatedSla(complaint));

    if (isPaginated) {
      return res.json(formatPaginatedResponse(enriched, total, page, limit));
    }

    res.set("X-Total-Count", String(total));
    return res.json(enriched);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch complaints", error: error.message });
  }
};

export const getComplaintById = async (req, res) => {
  try {
    const { id } = req.params;
    const complaint = await Complaint.findById(id).populate(complaintPopulate);

    if (!complaint) return res.status(404).json({ message: "Complaint not found" });

    // Admin has full access across all departments and complaints
    if (req.user.role === "admin") {
      return res.json(withCalculatedSla(complaint));
    }

    // Citizen can only access complaints they created
    if (req.user.role === "citizen") {
      const isCitizenOwner = complaint.createdBy?._id?.toString() === req.user._id.toString();
      if (!isCitizenOwner) {
        return res.status(403).json({ message: "Forbidden" });
      }
      return res.json(withCalculatedSla(complaint));
    }

    // Department user access
    if (req.user.role === "department") {
      if (complaint.category !== req.user.department) {
        return res.status(403).json({ message: "Forbidden: Cannot access complaints from another department" });
      }

      const linkedMember = isDepartmentOfficer(req.user)
        ? await Member.findOne({ userId: req.user._id, department: req.user.department }).select("_id").lean()
        : null;
      if (!canAccessDepartmentComplaint({ user: req.user, complaint, memberId: linkedMember?._id })) {
        return res.status(403).json({ message: "Forbidden: Complaint is outside this department role's access" });
      }
      return res.json(withCalculatedSla(complaint));
    }

    return res.status(403).json({ message: "Forbidden" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch complaint", error: error.message });
  }
};

export const getComplaintEvidence = async (req, res) => {
  try {
    const { id } = req.params;
    const complaint = await Complaint.findById(id).populate(complaintPopulate);

    if (!complaint) return res.status(404).json({ message: "Complaint not found" });

    // Authorization checks matching getComplaintById
    if (req.user.role === "admin") {
      // Admin has full access
    } else if (req.user.role === "citizen") {
      const isCitizenOwner = complaint.createdBy?._id?.toString() === req.user._id.toString();
      if (!isCitizenOwner) {
        return res.status(403).json({ message: "Forbidden" });
      }
    } else if (req.user.role === "department") {
      if (complaint.category !== req.user.department) {
        return res.status(403).json({ message: "Forbidden: Cannot access complaints from another department" });
      }

      const linkedMember = isDepartmentOfficer(req.user)
        ? await Member.findOne({ userId: req.user._id, department: req.user.department }).select("_id").lean()
        : null;
      if (!canAccessDepartmentComplaint({ user: req.user, complaint, memberId: linkedMember?._id })) {
        return res.status(403).json({ message: "Forbidden: Complaint is outside this department role's access" });
      }
    } else {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (!complaint.image || complaint.image === "uploaded" || !complaint.image.trim()) {
      return res.status(404).json({ message: "No evidence image available for this complaint" });
    }

    const evidence = await getEvidenceFile(complaint.image);
    if (!evidence) {
      return res.status(404).json({ message: "Evidence image file not found" });
    }

    res.set({
      "Content-Type": evidence.mimeType,
      "Content-Length": evidence.size,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-transform, max-age=86400",
    });

    return res.send(evidence.buffer);
  } catch (error) {
    return res.status(500).json({ message: "Failed to retrieve evidence", error: error.message });
  }
};

export const getComplaintResolutionEvidence = async (req, res) => {
  try {
    const { id } = req.params;
    const { entryId } = req.query;

    const complaint = await Complaint.findById(id).populate(complaintPopulate);
    if (!complaint) return res.status(404).json({ message: "Complaint not found" });

    // Authorization checks matching getComplaintById & getComplaintEvidence
    if (req.user.role === "admin") {
      // Admin has full access
    } else if (req.user.role === "citizen") {
      const isCitizenOwner = complaint.createdBy?._id?.toString() === req.user._id.toString();
      if (!isCitizenOwner) {
        return res.status(403).json({ message: "Forbidden" });
      }
    } else if (req.user.role === "department") {
      if (complaint.category !== req.user.department) {
        return res.status(403).json({ message: "Forbidden: Cannot access complaints from another department" });
      }

      const linkedMember = isDepartmentOfficer(req.user)
        ? await Member.findOne({ userId: req.user._id, department: req.user.department }).select("_id").lean()
        : null;
      if (!canAccessDepartmentComplaint({ user: req.user, complaint, memberId: linkedMember?._id })) {
        return res.status(403).json({ message: "Forbidden: Complaint is outside this department role's access" });
      }
    } else {
      return res.status(403).json({ message: "Forbidden" });
    }

    const history = complaint.resolutionHistory || [];
    let targetEntry = null;

    if (entryId && typeof entryId === "string" && entryId.trim()) {
      targetEntry = history.find((e) => e._id?.toString() === entryId.trim() || e.id?.toString() === entryId.trim());
    } else {
      // Default to the latest resolution entry that has an evidence file
      for (let i = history.length - 1; i >= 0; i -= 1) {
        if (history[i].evidence && history[i].evidence.trim()) {
          targetEntry = history[i];
          break;
        }
      }
      if (!targetEntry && history.length > 0) {
        targetEntry = history[history.length - 1];
      }
    }

    if (!targetEntry || !targetEntry.evidence || !targetEntry.evidence.trim()) {
      return res.status(404).json({ message: "No resolution evidence image available for this complaint" });
    }

    const evidence = await getEvidenceFile(targetEntry.evidence);
    if (!evidence) {
      return res.status(404).json({ message: "Resolution evidence file not found" });
    }

    res.set({
      "Content-Type": evidence.mimeType,
      "Content-Length": evidence.size,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-transform, max-age=86400",
    });

    return res.send(evidence.buffer);
  } catch (error) {
    return res.status(500).json({ message: "Failed to retrieve resolution evidence", error: error.message });
  }
};

const isTransactionUnsupported = (error) => (
  error?.code === 20
  || error?.code === 263
  || error?.codeName === "IllegalOperation"
  || /transaction numbers are only allowed|does not support transactions/i.test(error?.message || "")
);

const deleteComplaintRecords = async (complaintId, session) => {
  const options = session ? { session } : undefined;
  await Feedback.deleteMany({ complaintId }, options);
  await Notification.deleteMany({
    $or: [
      { "meta.complaintId": complaintId },
      { "meta.complaintId": complaintId.toString() },
    ],
  }, options);
  const deletedComplaint = await Complaint.findOneAndDelete({ _id: complaintId }, options);
  if (!deletedComplaint) {
    throw new Error("Complaint was not found during deletion.");
  }
};

export const deleteComplaint = async (req, res) => {
  const { id } = req.params;

  try {
    const complaint = await Complaint.findById(id);
    if (!complaint) {
      return res.status(404).json({ message: "Complaint not found" });
    }

    const isCitizenOwner = req.user.role === "citizen"
      && complaint.createdBy?.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    if (!isCitizenOwner && !isAdmin) {
      return res.status(403).json({ message: "You are not authorized to delete this complaint" });
    }

    // Collect physical evidence keys for cleanup after database deletion
    const evidenceKeysToDelete = [];
    if (typeof complaint.image === "string" && complaint.image.trim()) {
      evidenceKeysToDelete.push(complaint.image.trim());
    }
    if (Array.isArray(complaint.resolutionHistory)) {
      for (const entry of complaint.resolutionHistory) {
        if (typeof entry?.evidence === "string" && entry.evidence.trim()) {
          evidenceKeysToDelete.push(entry.evidence.trim());
        }
      }
    }

    const session = await mongoose.startSession();
    try {
      try {
        await session.withTransaction(async () => {
          await deleteComplaintRecords(complaint._id, session);
        });
      } catch (error) {
        if (!isTransactionUnsupported(error)) {
          throw error;
        }

        console.warn("[Complaint deletion] MongoDB transactions are unavailable; using ordered cleanup fallback.");
        await deleteComplaintRecords(complaint._id);
      }
    } finally {
      await session.endSession();
    }

    // Physical evidence cleanup after successful database record deletion
    for (const key of evidenceKeysToDelete) {
      try {
        await deleteEvidenceFile(key);
      } catch (cleanupErr) {
        console.warn("[Complaint deletion] Non-critical error deleting physical evidence file", {
          key,
          complaintId: complaint._id.toString(),
          error: cleanupErr.message,
        });
      }
    }

    return res.status(204).send();
  } catch (error) {
    console.error("[Complaint deletion] Failed", {
      code: error.code || "DELETE_FAILED",
      message: error.message,
      complaintId: id,
    });
    return res.status(500).json({ message: "Failed to delete complaint" });
  }
};

export const getDepartmentComplaints = async (req, res) => {
  try {
    if (req.user.role === "department" && !DEPARTMENTS.includes(req.user.department)) {
      return res.status(403).json({ message: "Department identity is missing or invalid" });
    }

    const department = req.user.role === "admin" ? req.query.department : req.user.department;
    if (req.user.role === "admin" && department && !DEPARTMENTS.includes(department)) {
      return res.status(400).json({ message: "Invalid department" });
    }
    const filter = department ? buildDepartmentComplaintFilter(department) : {};

    if (req.user.role === "department") {
      if (!isDepartmentAuthority(req.user)) {
        return res.status(403).json({ message: "Department complaint management is restricted to authorities" });
      }
    }

    const { isPaginated, page, limit, skip } = parsePagination(req.query);
    const total = await Complaint.countDocuments(filter);

    const queryChain = Complaint.find(filter)
      .populate(complaintPopulate)
      .sort({ createdAt: -1, _id: -1 });

    if (isPaginated) {
      queryChain.skip(skip).limit(limit);
    }

    const complaints = await queryChain;
    const enriched = complaints.map((complaint) => withCalculatedSla(complaint));

    if (isPaginated) {
      return res.json(formatPaginatedResponse(enriched, total, page, limit));
    }

    res.set("X-Total-Count", String(total));
    return res.json(enriched);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch complaints", error: error.message });
  }
};

export const updateComplaintStatus = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  const { status, remarks } = req.body;

  let storedEvidence = null;

  try {
    if (!STATUS.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const complaint = await Complaint.findById(id);
    if (!complaint) {
      return res.status(404).json({ message: "Complaint not found" });
    }

    if (req.user.role === "department") {
      const linkedMember = isDepartmentOfficer(req.user)
        ? await Member.findOne({ userId: req.user._id, department: req.user.department }).select("_id").lean()
        : null;
      if (!canAccessDepartmentComplaint({ user: req.user, complaint, memberId: linkedMember?._id })) {
        return res.status(403).json({ message: "Forbidden: Complaint is outside this department role's access" });
      }
    }

    if (complaint.status === status) {
      const populated = await Complaint.findById(id).populate(complaintPopulate);
      return res.json(withCalculatedSla(populated));
    }

    const statusError = validateStatusTransition(complaint.status, status, complaint.assignedTo);
    if (statusError) {
      return res.status(400).json({ message: statusError });
    }

    const wasResolved = complaint.status === "Resolved";
    const previousStatus = complaint.status;

    let resolutionEvidenceKey = "";
    let trimmedRemarks = "";

    if (status === "Resolved") {
      trimmedRemarks = typeof remarks === "string" ? remarks.trim() : "";
      if (!trimmedRemarks) {
        return res.status(400).json({ message: "Resolution remarks are required when resolving a complaint." });
      }
      if (trimmedRemarks.length > 2000) {
        return res.status(400).json({ message: "Resolution remarks cannot exceed 2000 characters." });
      }

      if (req.file?.buffer) {
        storedEvidence = await uploadEvidenceFile(req.file.buffer, {
          originalname: req.file.originalname,
          userId: req.user._id?.toString(),
          complaintId: complaint._id.toString(),
          context: "resolution",
        });
        resolutionEvidenceKey = storedEvidence.storageKey;
      }

      const resolutionEntry = {
        remarks: trimmedRemarks,
        evidence: resolutionEvidenceKey || "",
        resolvedAt: new Date(),
        resolvedBy: req.user._id,
      };

      complaint.resolutionHistory = complaint.resolutionHistory || [];
      complaint.resolutionHistory.push(resolutionEntry);

      if (complaint.sla) {
        complaint.sla.resolvedAt = new Date();
      }
    } else if (status !== "Resolved" && wasResolved) {
      // Reopening clears the prior resolution SLA marker but deliberately preserves
      // the original SLA start, duration, and deadline.
      if (complaint.sla?.resolvedAt) {
        complaint.sla.resolvedAt = undefined;
      }
      // Note: resolutionHistory and uploaded evidence files are preserved for historical audit.
    }

    complaint.status = status;
    complaint.timeline.push(createTimelineEvent({
      eventType: "status_changed",
      label: status === "Resolved" ? "Complaint Resolved" : "Status Changed",
      status,
      note: status === "Resolved" ? trimmedRemarks : status,
    }));

    await complaint.save();
    await notifyComplaintStatusChanged(complaint, previousStatus);

    const populated = await Complaint.findById(id).populate(complaintPopulate);

    return res.json(withCalculatedSla(populated));
  } catch (error) {
    if (storedEvidence?.storageKey) {
      await deleteEvidenceFile(storedEvidence.storageKey);
    }
    return res.status(500).json({ message: "Failed to update status", error: error.message });
  }
};

export const assignComplaint = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  const { memberId } = req.body;

  try {
    const complaint = await Complaint.findById(id);
    if (!complaint) {
      return res.status(404).json({ message: "Complaint not found" });
    }

    if (req.user.role === "department") {
      if (!isDepartmentAuthority(req.user)) {
        return res.status(403).json({ message: "Officers are not authorized to assign or reassign complaints" });
      }

      if (complaint.category !== req.user.department) {
        return res.status(403).json({ message: "Cannot modify other departments" });
      }
    }

    const member = await Member.findById(memberId);
    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    if (member.department !== complaint.category) {
      return res.status(400).json({ message: "Member belongs to a different department" });
    }

    if (!member.userId) {
      return res.status(400).json({ message: "Cannot assign to an unlinked officer. Please link a user account first." });
    }

    const linkedUser = await User.findById(member.userId)
      .select("status role departmentRole department")
      .lean();
    if (!linkedUser || linkedUser.status !== "active") {
      return res.status(400).json({ message: "Cannot assign to an officer whose linked account is inactive" });
    }

    if (linkedUser.role !== "department" || linkedUser.departmentRole !== "officer") {
      return res.status(400).json({ message: "Cannot assign to an account that is not a department officer" });
    }

    if (linkedUser.department !== complaint.category) {
      return res.status(400).json({ message: "Linked officer account belongs to a different department" });
    }

    const previousAssignee = complaint.assignedTo;
    const wasResolved = complaint.status === "Resolved";
    complaint.assignedTo = member._id;
    complaint.status = "Assigned";
    if (wasResolved && complaint.sla?.resolvedAt) {
      // Assignment reopens a resolved complaint without resetting its SLA deadline.
      complaint.sla.resolvedAt = undefined;
    }
    complaint.timeline.push(createTimelineEvent({
      eventType: previousAssignee ? "officer_reassigned" : "officer_assigned",
      label: previousAssignee ? "Officer Reassigned" : "Officer Assigned",
      status: "Assigned",
      note: member.name,
    }));
    await complaint.save();
    await notifyComplaintAssignment(complaint, previousAssignee);

    const populated = await Complaint.findById(id).populate(complaintPopulate);

    return res.json(withCalculatedSla(populated));
  } catch (error) {
    return res.status(500).json({ message: "Failed to assign complaint", error: error.message });
  }
};
