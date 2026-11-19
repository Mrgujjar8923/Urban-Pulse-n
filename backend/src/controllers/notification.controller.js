import mongoose from "mongoose";
import { Notification } from "../models/Notification.js";
import { parsePagination, formatPaginatedResponse } from "../utils/pagination.js";
import {
  emitNotificationReadToUser,
  emitNotificationReadAllToUser,
  emitNotificationClearedToUser,
} from "../services/notificationSocket.service.js";

export const listNotifications = async (req, res) => {
  try {
    const { isPaginated, page, limit, skip } = parsePagination(req.query, 20, 100);

    if (isPaginated) {
      const total = await Notification.countDocuments({ userId: req.user._id });
      const notifications = await Notification.find({ userId: req.user._id })
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit);
      res.set("X-Total-Count", String(total));
      return res.json(formatPaginatedResponse(notifications, total, page, limit));
    }

    const notifications = await Notification.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);
    return res.json(notifications);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch notifications", error: error.message });
  }
};

const getNotificationId = (req) => (
  mongoose.isValidObjectId(req.params.id) ? req.params.id : null
);

export const updateNotificationReadState = async (req, res) => {
  const notificationId = getNotificationId(req);
  if (!notificationId) return res.status(400).json({ message: "Invalid notification id" });

  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId: req.user._id },
      { $set: { read: Boolean(req.body?.read ?? true) } },
      { new: true }
    );
    if (!notification) return res.status(404).json({ message: "Notification not found" });

    emitNotificationReadToUser(req.user._id, notification._id, notification.read);

    return res.json(notification);
  } catch (error) {
    return res.status(500).json({ message: "Failed to update notification", error: error.message });
  }
};

export const markAllNotificationsRead = async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user._id }, { $set: { read: true } });
    emitNotificationReadAllToUser(req.user._id);
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ message: "Failed to update notifications", error: error.message });
  }
};

export const clearNotifications = async (req, res) => {
  try {
    await Notification.deleteMany({ userId: req.user._id });
    emitNotificationClearedToUser(req.user._id);
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ message: "Failed to clear notifications", error: error.message });
  }
};
