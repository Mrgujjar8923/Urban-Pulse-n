import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { Server } from "socket.io";
import { User } from "../models/User.js";
import { isAllowedOrigin } from "../config/cors.js";

let io;

const userRoom = (userId) => `user:${userId.toString()}`;

const getToken = (socket) => {
  const token = socket.handshake.auth?.token;
  if (typeof token === "string" && token) return token;

  const authorization = socket.handshake.headers?.authorization;
  return authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
};

const authenticateSocket = async (socket, next) => {
  try {
    const token = getToken(socket);
    if (!token) return next(new Error("Authentication required"));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");
    if (!user || user.status !== "active") return next(new Error("Invalid or inactive user"));

    socket.data.user = user;
    return next();
  } catch {
    return next(new Error("Invalid or expired token"));
  }
};

export const initializeNotificationSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) return callback(null, true);
        return callback(new Error("Origin not allowed"));
      },
    },
  });

  io.use(authenticateSocket);
  io.on("connection", (socket) => {
    socket.join(userRoom(socket.data.user._id));
  });

  return io;
};

const isPersistedSlaNotification = (notification) => Boolean(
  notification?._id
  && notification.isNew !== true
  && notification.meta?.type === "sla_overdue"
  && typeof notification.meta.department === "string"
  && notification.meta.department.length > 0
);

const getSlaRecipient = async (notification) => {
  if (!mongoose.Types.ObjectId.isValid(notification.userId)) return null;

  return User.findById(notification.userId)
    .select("_id role department status")
    .lean();
};

export const emitNotificationToUser = async (notification) => {
  if (!io || !notification?.userId) return false;

  let recipientId = notification.userId;
  if (notification.meta?.type === "sla_overdue") {
    if (!isPersistedSlaNotification(notification)) return false;

    const recipient = await getSlaRecipient(notification);
    const isAuthorizedRecipient = recipient
      && recipient.status === "active"
      && (
        recipient.role === "admin"
        || (
          recipient.role === "department"
          && recipient.department === notification.meta.department
        )
      );

    if (!isAuthorizedRecipient) return false;
    recipientId = recipient._id;
  }

  io.to(userRoom(recipientId)).emit("new-notification", notification.toObject
    ? notification.toObject()
    : notification);
  return true;
};

export const emitNotificationReadToUser = (userId, notificationId, read) => {
  if (!io || !userId || !notificationId) return false;
  io.to(userRoom(userId)).emit("notification-read", {
    id: notificationId.toString(),
    read: Boolean(read),
  });
  return true;
};

export const emitNotificationReadAllToUser = (userId) => {
  if (!io || !userId) return false;
  io.to(userRoom(userId)).emit("notifications-read-all", {
    userId: userId.toString(),
  });
  return true;
};

export const emitNotificationClearedToUser = (userId) => {
  if (!io || !userId) return false;
  io.to(userRoom(userId)).emit("notifications-cleared", {
    userId: userId.toString(),
  });
  return true;
};

export const setSocketServerForTesting = (mockIo) => {
  io = mockIo;
};

export const closeNotificationSocket = async () => {
  if (io) {
    await new Promise((resolve) => {
      io.close((err) => {
        if (err) console.warn("[Socket.IO] Error closing server:", err.message);
        resolve();
      });
    });
    io = null;
  }
};

export {
  authenticateSocket,
  userRoom,
  isPersistedSlaNotification,
  getSlaRecipient,
};
