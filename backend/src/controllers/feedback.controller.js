import { validationResult } from "express-validator";
import { Feedback } from "../models/Feedback.js";
import { Complaint } from "../models/Complaint.js";
import { notifyFeedbackReceived } from "../services/complaintNotification.service.js";

export const submitFeedback = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { complaintId, rating, comment, image, workCompleted, percentDone } = req.body;

    const complaint = await Complaint.findById(complaintId);
    if (!complaint) return res.status(404).json({ message: "Complaint not found" });

    const ownerId = (complaint.createdBy?._id || complaint.createdBy)?.toString();
    if (ownerId !== req.user._id.toString()) {
      return res.status(403).json({ message: "Cannot submit feedback for this complaint" });
    }

    if (complaint.status !== "Resolved") {
      return res.status(400).json({ message: "Feedback allowed only when resolved" });
    }

    const latestResolution = complaint.resolutionHistory?.length > 0
      ? complaint.resolutionHistory[complaint.resolutionHistory.length - 1]
      : null;
    const currentResolutionId = latestResolution?._id || null;

    let feedback = await Feedback.findOne({ complaintId });

    if (feedback) {
      // Prevent duplicate feedback for the exact same resolution attempt
      if (currentResolutionId && feedback.resolutionId?.toString() === currentResolutionId.toString()) {
        return res.status(400).json({ message: "Feedback has already been submitted for this resolution attempt." });
      }

      // Archive previous feedback before updating for the new resolution
      feedback.history = feedback.history || [];
      feedback.history.push({
        rating: feedback.rating,
        comment: feedback.comment || "",
        image: feedback.image || "",
        workCompleted: feedback.workCompleted,
        percentDone: feedback.percentDone || 0,
        resolutionId: feedback.resolutionId || null,
        submittedAt: feedback.updatedAt || feedback.createdAt || new Date(),
      });

      feedback.rating = rating;
      feedback.comment = comment || "";
      feedback.image = image || "";
      feedback.workCompleted = workCompleted;
      feedback.percentDone = percentDone || 0;
      feedback.resolutionId = currentResolutionId;

      await feedback.save();
    } else {
      feedback = await Feedback.create({
        complaintId,
        userId: req.user._id,
        rating,
        comment: comment || "",
        image: image || "",
        workCompleted,
        percentDone: percentDone || 0,
        resolutionId: currentResolutionId,
        history: [],
      });
    }

    complaint.feedback = feedback._id;
    await complaint.save();
    await notifyFeedbackReceived(complaint, feedback);

    return res.status(201).json(feedback);
  } catch (error) {
    return res.status(500).json({ message: "Failed to submit feedback", error: error.message });
  }
};
