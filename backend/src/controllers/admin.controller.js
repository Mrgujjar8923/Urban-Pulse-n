import { Complaint } from "../models/Complaint.js";
import { User, DEPARTMENTS } from "../models/User.js";
import { Feedback } from "../models/Feedback.js";
import { Member } from "../models/Member.js";

export const VALID_DATE_RANGES = ["allTime", "last7Days", "last30Days", "last6Months", "thisYear"];

export const buildDateFilter = (dateRange, startDate, endDate) => {
  const filter = {};
  const now = new Date();

  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) {
      const parsedStart = new Date(startDate);
      if (!Number.isNaN(parsedStart.getTime())) {
        filter.createdAt.$gte = parsedStart;
      }
    }
    if (endDate) {
      const parsedEnd = new Date(endDate);
      if (!Number.isNaN(parsedEnd.getTime())) {
        filter.createdAt.$lte = parsedEnd;
      }
    }
    if (Object.keys(filter.createdAt).length === 0) {
      delete filter.createdAt;
    }
    return filter;
  }

  if (!dateRange || dateRange === "allTime") {
    return filter;
  }

  let cutoff = null;
  if (dateRange === "last7Days" || dateRange === "7d") {
    cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (dateRange === "last30Days" || dateRange === "30d") {
    cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  } else if (dateRange === "last6Months" || dateRange === "6m") {
    cutoff = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  } else if (dateRange === "thisYear" || dateRange === "1y") {
    cutoff = new Date(now.getFullYear(), 0, 1);
  }

  if (cutoff) {
    filter.createdAt = { $gte: cutoff };
  }

  return filter;
};

export const getAdminOverviewStats = async (req, res) => {
  try {
    const { dateRange, department, startDate, endDate } = req.query;

    const matchQuery = buildDateFilter(dateRange, startDate, endDate);

    if (department && department !== "All Departments") {
      if (!DEPARTMENTS.includes(department)) {
        return res.status(400).json({ message: "Invalid department filter." });
      }
      matchQuery.category = department;
    }

    const now = new Date();

    // 1. Complaint aggregation with facet
    const [complaintStats] = await Complaint.aggregate([
      { $match: matchQuery },
      {
        $facet: {
          byStatus: [
            { $group: { _id: "$status", count: { $sum: 1 } } },
          ],
          overdue: [
            {
              $match: {
                status: { $ne: "Resolved" },
                "sla.deadline": { $exists: true, $ne: null, $lt: now },
              },
            },
            { $count: "count" },
          ],
          total: [
            { $count: "count" },
          ],
          byDepartment: [
            {
              $group: {
                _id: { category: "$category", status: "$status" },
                count: { $sum: 1 },
              },
            },
          ],
        },
      },
    ]);

    // 2. User aggregation with facet
    const [userStats] = await User.aggregate([
      {
        $facet: {
          citizens: [
            { $match: { role: "citizen" } },
            { $count: "count" },
          ],
          authorities: [
            { $match: { role: "department", departmentRole: "authority" } },
            { $count: "count" },
          ],
          officers: [
            { $match: { role: "department", departmentRole: "officer" } },
            { $count: "count" },
          ],
          total: [
            { $count: "count" },
          ],
        },
      },
    ]);

    // Parse complaint status counts
    const statusMap = (complaintStats?.byStatus || []).reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});

    const totalComplaints = complaintStats?.total?.[0]?.count || 0;
    const pendingComplaints = statusMap["Pending"] || 0;
    const assignedComplaints = statusMap["Assigned"] || 0;
    const inProgressComplaints = statusMap["In Progress"] || 0;
    const resolvedComplaints = statusMap["Resolved"] || 0;
    const overdueComplaints = complaintStats?.overdue?.[0]?.count || 0;

    const resolutionRate = totalComplaints > 0
      ? Number(((resolvedComplaints / totalComplaints) * 100).toFixed(1))
      : 0;

    // Parse user counts
    const totalCitizens = userStats?.citizens?.[0]?.count || 0;
    const totalAuthorities = userStats?.authorities?.[0]?.count || 0;
    const totalOfficers = userStats?.officers?.[0]?.count || 0;
    const totalUsers = userStats?.total?.[0]?.count || 0;

    // Department breakdown
    const deptMap = {};
    for (const dept of DEPARTMENTS) {
      deptMap[dept] = {
        department: dept,
        total: 0,
        pending: 0,
        assigned: 0,
        inProgress: 0,
        resolved: 0,
        resolutionRate: 0,
      };
    }

    for (const entry of complaintStats?.byDepartment || []) {
      const deptName = entry._id?.category;
      const statusName = entry._id?.status;
      if (deptMap[deptName]) {
        deptMap[deptName].total += entry.count;
        if (statusName === "Pending") deptMap[deptName].pending += entry.count;
        if (statusName === "Assigned") deptMap[deptName].assigned += entry.count;
        if (statusName === "In Progress") deptMap[deptName].inProgress += entry.count;
        if (statusName === "Resolved") deptMap[deptName].resolved += entry.count;
      }
    }

    const departmentBreakdown = Object.values(deptMap).map((d) => ({
      ...d,
      resolutionRate: d.total > 0 ? Number(((d.resolved / d.total) * 100).toFixed(1)) : 0,
    }));

    // Status distribution
    const statusDistribution = [
      { name: "Pending", value: pendingComplaints },
      { name: "Assigned", value: assignedComplaints },
      { name: "In Progress", value: inProgressComplaints },
      { name: "Resolved", value: resolvedComplaints },
    ];

    // Monthly trends (last 6 months)
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const trendMatches = { createdAt: { $gte: sixMonthsAgo } };
    if (department && department !== "All Departments") {
      trendMatches.category = department;
    }

    const trendAgg = await Complaint.aggregate([
      { $match: trendMatches },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            status: "$status",
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthsTrend = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const yr = d.getFullYear();
      const mo = d.getMonth() + 1; // 1-12
      const label = `${monthNames[mo - 1]} ${yr}`;
      monthsTrend.push({
        year: yr,
        month: mo,
        label,
        submitted: 0,
        resolved: 0,
      });
    }

    for (const t of trendAgg) {
      const matchMonth = monthsTrend.find((m) => m.year === t._id.year && m.month === t._id.month);
      if (matchMonth) {
        matchMonth.submitted += t.count;
        if (t._id.status === "Resolved") {
          matchMonth.resolved += t.count;
        }
      }
    }

    return res.status(200).json({
      metrics: {
        totalComplaints,
        pendingComplaints,
        assignedComplaints,
        inProgressComplaints,
        resolvedComplaints,
        overdueComplaints,
        resolutionRate,
        totalCitizens,
        totalAuthorities,
        totalOfficers,
        totalUsers,
      },
      departmentBreakdown,
      statusDistribution,
      monthlyTrend: monthsTrend,
      appliedFilters: {
        dateRange: dateRange || "allTime",
        department: department || "All Departments",
      },
    });
  } catch (error) {
    console.error("[Admin API] Failed to fetch overview statistics", error);
    return res.status(500).json({ message: "Failed to fetch admin overview statistics", error: error.message });
  }
};

export const getAdminDepartmentPerformance = async (req, res) => {
  try {
    const now = new Date();

    const departments = await Promise.all(
      DEPARTMENTS.map(async (department) => {
        const [stats] = await Complaint.aggregate([
          { $match: { category: department } },
          {
            $facet: {
              byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
              overdue: [
                {
                  $match: {
                    status: { $ne: "Resolved" },
                    "sla.deadline": { $exists: true, $ne: null, $lt: now },
                  },
                },
                { $count: "count" },
              ],
              total: [{ $count: "count" }],
              resolvedWithTimes: [
                {
                  $match: {
                    status: "Resolved",
                    "sla.startedAt": { $exists: true, $ne: null },
                    "sla.resolvedAt": { $exists: true, $ne: null },
                  },
                },
                {
                  $project: {
                    durationHours: {
                      $divide: [
                        { $subtract: ["$sla.resolvedAt", "$sla.startedAt"] },
                        1000 * 60 * 60,
                      ],
                    },
                  },
                },
              ],
            },
          },
        ]);

        const statusMap = (stats?.byStatus || []).reduce((acc, curr) => {
          acc[curr._id] = curr.count;
          return acc;
        }, {});

        const total = stats?.total?.[0]?.count || 0;
        const pending = statusMap["Pending"] || 0;
        const assigned = statusMap["Assigned"] || 0;
        const inProgress = statusMap["In Progress"] || 0;
        const resolved = statusMap["Resolved"] || 0;
        const overdue = stats?.overdue?.[0]?.count || 0;
        const resolutionRate = total > 0 ? Number(((resolved / total) * 100).toFixed(1)) : 0;

        const resolvedTimes = stats?.resolvedWithTimes || [];
        const avgResolutionHours = resolvedTimes.length > 0
          ? Number((resolvedTimes.reduce((sum, item) => sum + item.durationHours, 0) / resolvedTimes.length).toFixed(1))
          : 0;

        // Feedback stats for this department
        const complaintsWithFeedback = await Complaint.find({ category: department, feedback: { $ne: null } })
          .populate("feedback")
          .select("feedback");

        let avgRating = 0;
        if (complaintsWithFeedback.length > 0) {
          const totalRating = complaintsWithFeedback.reduce((sum, c) => sum + (c.feedback?.rating || 0), 0);
          avgRating = Number((totalRating / complaintsWithFeedback.length).toFixed(1));
        }

        // Active members count
        const membersCount = await Member.countDocuments({ department });

        return {
          department,
          total,
          pending,
          assigned,
          inProgress,
          resolved,
          overdue,
          resolutionRate,
          avgResolutionHours,
          feedbackCount: complaintsWithFeedback.length,
          avgRating,
          membersCount,
        };
      })
    );

    return res.status(200).json(departments);
  } catch (error) {
    console.error("[Admin API] Failed to fetch department performance", error);
    return res.status(500).json({ message: "Failed to fetch department performance", error: error.message });
  }
};

export const getAdminFeedback = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const { department, minRating } = req.query;

    const filter = {};
    if (department && department !== "All Departments") {
      if (!DEPARTMENTS.includes(department)) {
        return res.status(400).json({ message: "Invalid department filter" });
      }
      filter.category = department;
    }

    const parsedMinRating = Number(minRating);
    const hasMinRating = !Number.isNaN(parsedMinRating) && parsedMinRating >= 1 && parsedMinRating <= 5;

    if (hasMinRating) {
      const matchingFeedbackIds = await Feedback.find({
        rating: { $gte: parsedMinRating },
      }).distinct("_id");
      filter.feedback = { $in: matchingFeedbackIds };
    } else {
      // Complaints that have feedback
      filter.feedback = { $ne: null };
    }

    const totalCount = await Complaint.countDocuments(filter);

    const complaints = await Complaint.find(filter)
      .populate("feedback")
      .populate("createdBy", "name email")
      .populate("assignedTo", "name department")
      .sort({ updatedAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit);

    res.set("X-Total-Count", String(totalCount));

    // Calculate rating overview
    const allFeedbacks = await Feedback.find({});
    const totalFeedbacks = allFeedbacks.length;
    const avgRating = totalFeedbacks > 0
      ? Number((allFeedbacks.reduce((sum, f) => sum + (f.rating || 0), 0) / totalFeedbacks).toFixed(1))
      : 0;

    const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let completedCount = 0;
    for (const f of allFeedbacks) {
      if (ratingDistribution[f.rating] !== undefined) {
        ratingDistribution[f.rating] += 1;
      }
      if (f.workCompleted) {
        completedCount += 1;
      }
    }

    const percentSatisfied = totalFeedbacks > 0
      ? Number(((completedCount / totalFeedbacks) * 100).toFixed(1))
      : 0;

    return res.status(200).json({
      summary: {
        totalFeedbacks,
        avgRating,
        percentSatisfied,
        completedCount,
        ratingDistribution,
      },
      feedbacks: complaints.map((c) => ({
        complaintId: c._id,
        title: c.title,
        category: c.category,
        location: c.location,
        citizen: c.createdBy ? { name: c.createdBy.name, email: c.createdBy.email } : null,
        assignedOfficer: c.assignedTo ? { name: c.assignedTo.name, department: c.assignedTo.department } : null,
        rating: c.feedback?.rating || 0,
        comment: c.feedback?.comment || "",
        workCompleted: Boolean(c.feedback?.workCompleted),
        percentDone: c.feedback?.percentDone || 0,
        image: c.feedback?.image || "",
        createdAt: c.feedback?.createdAt || c.updatedAt,
      })),
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error("[Admin API] Failed to fetch feedback", error);
    return res.status(500).json({ message: "Failed to fetch feedback", error: error.message });
  }
};

