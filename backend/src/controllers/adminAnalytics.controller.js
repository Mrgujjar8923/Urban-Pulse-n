import { Complaint } from "../models/Complaint.js";
import { DEPARTMENTS } from "../models/User.js";
import { buildDateFilter } from "./admin.controller.js";

/**
 * Helper to compute previous period date filter for comparative analytics.
 */
export const getPreviousPeriodDates = (dateRange, startDate, endDate) => {
  const now = new Date();

  if (startDate || endDate) {
    const start = startDate ? new Date(startDate) : new Date(0);
    const end = endDate ? new Date(endDate) : now;
    const duration = end.getTime() - start.getTime();
    if (duration > 0) {
      const prevEnd = new Date(start.getTime());
      const prevStart = new Date(start.getTime() - duration);
      return { prevStart, prevEnd };
    }
    return null;
  }

  if (!dateRange || dateRange === "allTime") {
    return null;
  }

  let durationMs = 0;
  if (dateRange === "last7Days" || dateRange === "7d") {
    durationMs = 7 * 24 * 60 * 60 * 1000;
  } else if (dateRange === "last30Days" || dateRange === "30d") {
    durationMs = 30 * 24 * 60 * 60 * 1000;
  } else if (dateRange === "last6Months" || dateRange === "6m") {
    durationMs = 180 * 24 * 60 * 60 * 1000;
  } else if (dateRange === "thisYear" || dateRange === "1y") {
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    durationMs = now.getTime() - startOfYear.getTime();
  }

  if (durationMs > 0) {
    const prevEnd = new Date(now.getTime() - durationMs);
    const prevStart = new Date(prevEnd.getTime() - durationMs);
    return { prevStart, prevEnd };
  }

  return null;
};

/**
 * Build match filters for analytics queries with department and date range validation.
 */
export const buildAnalyticsMatch = (query) => {
  const { dateRange, department, startDate, endDate } = query;

  if (department && department !== "All Departments" && !DEPARTMENTS.includes(department)) {
    const error = new Error(`Invalid department '${department}'. Allowed: ${DEPARTMENTS.join(", ")}`);
    error.status = 400;
    throw error;
  }

  const match = buildDateFilter(dateRange, startDate, endDate);

  if (department && department !== "All Departments") {
    match.category = department;
  }

  return match;
};

/**
 * 1. Trend Analytics Controller
 * Supports daily, weekly, monthly interval grouping and period-over-period comparison.
 */
export const getAdminAnalyticsTrends = async (req, res) => {
  try {
    const match = buildAnalyticsMatch(req.query);
    const { interval = "monthly", dateRange, startDate, endDate, department } = req.query;

    const validIntervals = ["daily", "weekly", "monthly"];
    const activeInterval = validIntervals.includes(interval) ? interval : "monthly";

    // Format specifiers for MongoDB $dateToString
    let dateToStringFormat = "%Y-%m";
    if (activeInterval === "daily") {
      dateToStringFormat = "%Y-%m-%d";
    } else if (activeInterval === "weekly") {
      dateToStringFormat = "%G-W%V"; // ISO standard year-week
    }

    const trendAggregation = await Complaint.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            period: { $dateToString: { format: dateToStringFormat, date: "$createdAt" } },
            status: "$status",
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.period": 1 } },
    ]);

    // Reshape into period-level objects
    const periodMap = new Map();
    trendAggregation.forEach((item) => {
      const period = item._id.period;
      if (!periodMap.has(period)) {
        periodMap.set(period, {
          period,
          submitted: 0,
          resolved: 0,
          pending: 0,
          inProgress: 0,
          assigned: 0,
        });
      }
      const entry = periodMap.get(period);
      entry.submitted += item.count;
      if (item._id.status === "Resolved") entry.resolved += item.count;
      if (item._id.status === "Pending") entry.pending += item.count;
      if (item._id.status === "In Progress") entry.inProgress += item.count;
      if (item._id.status === "Assigned") entry.assigned += item.count;
    });

    const points = Array.from(periodMap.values()).sort((a, b) => a.period.localeCompare(b.period));

    // Previous period comparison
    const prevDates = getPreviousPeriodDates(dateRange, startDate, endDate);
    let comparison = null;

    if (prevDates) {
      const prevMatch = {
        createdAt: { $gte: prevDates.prevStart, $lte: prevDates.prevEnd },
      };
      if (department && department !== "All Departments") {
        prevMatch.category = department;
      }

      const prevCount = await Complaint.countDocuments(prevMatch);
      const currentCount = points.reduce((sum, p) => sum + p.submitted, 0);

      let percentChange = 0;
      if (prevCount > 0) {
        percentChange = Number((((currentCount - prevCount) / prevCount) * 100).toFixed(1));
      } else if (currentCount > 0) {
        percentChange = 100;
      }

      let trendDirection = "flat";
      if (percentChange > 0) trendDirection = "up";
      else if (percentChange < 0) trendDirection = "down";

      comparison = {
        currentPeriodSubmitted: currentCount,
        previousPeriodSubmitted: prevCount,
        percentChange,
        trendDirection,
        previousPeriodStart: prevDates.prevStart.toISOString(),
        previousPeriodEnd: prevDates.prevEnd.toISOString(),
      };
    }

    return res.status(200).json({
      interval: activeInterval,
      points,
      comparison,
      appliedFilters: {
        dateRange: dateRange || "allTime",
        department: department || "All Departments",
        interval: activeInterval,
      },
    });
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({ message: error.message });
    }
    console.error("[Admin Analytics] Failed to compute trends", error);
    return res.status(500).json({ message: "Failed to compute complaint trends", error: error.message });
  }
};

/**
 * 2. Department Analytics Controller
 * Department-wise breakdown, resolution %, SLA compliance, and workload share.
 */
export const getAdminAnalyticsDepartments = async (req, res) => {
  try {
    const match = buildAnalyticsMatch(req.query);
    const now = new Date();

    const [facetResult] = await Complaint.aggregate([
      { $match: match },
      {
        $facet: {
          byDeptAndStatus: [
            {
              $group: {
                _id: { category: "$category", status: "$status" },
                count: { $sum: 1 },
              },
            },
          ],
          overdueByDept: [
            {
              $match: {
                status: { $ne: "Resolved" },
                "sla.deadline": { $exists: true, $ne: null, $lt: now },
              },
            },
            {
              $group: {
                _id: "$category",
                count: { $sum: 1 },
              },
            },
          ],
          resolvedTimesByDept: [
            {
              $match: {
                status: "Resolved",
              },
            },
            {
              $project: {
                category: 1,
                resolvedAt: { $ifNull: ["$sla.resolvedAt", "$updatedAt"] },
                startedAt: { $ifNull: ["$sla.startedAt", "$createdAt"] },
                deadline: "$sla.deadline",
              },
            },
          ],
          slaComplianceByDept: [
            {
              $match: {
                "sla.deadline": { $exists: true, $ne: null },
              },
            },
            {
              $project: {
                category: 1,
                status: 1,
                deadline: "$sla.deadline",
                resolvedAt: { $ifNull: ["$sla.resolvedAt", "$updatedAt"] },
                isCompliant: {
                  $cond: [
                    { $eq: ["$status", "Resolved"] },
                    { $lte: [{ $ifNull: ["$sla.resolvedAt", "$updatedAt"] }, "$sla.deadline"] },
                    { $gte: ["$sla.deadline", now] },
                  ],
                },
              },
            },
          ],
          totalSystemCount: [
            { $count: "count" },
          ],
        },
      },
    ]);

    const totalSystemComplaints = facetResult?.totalSystemCount?.[0]?.count || 0;

    // Index aggregations
    const overdueMap = (facetResult?.overdueByDept || []).reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});

    // Duration computation per department
    const deptDurations = {};
    for (const d of DEPARTMENTS) deptDurations[d] = [];

    for (const r of facetResult?.resolvedTimesByDept || []) {
      if (r.resolvedAt && r.startedAt && deptDurations[r.category]) {
        const durationHours = (new Date(r.resolvedAt).getTime() - new Date(r.startedAt).getTime()) / (1000 * 60 * 60);
        if (durationHours >= 0 && Number.isFinite(durationHours)) {
          deptDurations[r.category].push(durationHours);
        }
      }
    }

    // SLA compliance per department
    const deptSla = {};
    for (const d of DEPARTMENTS) deptSla[d] = { totalWithSla: 0, compliant: 0 };

    for (const s of facetResult?.slaComplianceByDept || []) {
      if (deptSla[s.category]) {
        deptSla[s.category].totalWithSla += 1;
        if (s.isCompliant) {
          deptSla[s.category].compliant += 1;
        }
      }
    }

    // Initialize all 4 departments
    const deptData = {};
    for (const dept of DEPARTMENTS) {
      deptData[dept] = {
        department: dept,
        total: 0,
        pending: 0,
        assigned: 0,
        inProgress: 0,
        resolved: 0,
        overdue: overdueMap[dept] || 0,
        resolutionRate: 0,
        slaComplianceRate: 100, // Default to 100% if no SLA tracked
        avgResolutionHours: 0,
        workloadShare: 0,
      };
    }

    for (const entry of facetResult?.byDeptAndStatus || []) {
      const cat = entry._id?.category;
      const st = entry._id?.status;
      if (deptData[cat]) {
        deptData[cat].total += entry.count;
        if (st === "Pending") deptData[cat].pending += entry.count;
        if (st === "Assigned") deptData[cat].assigned += entry.count;
        if (st === "In Progress") deptData[cat].inProgress += entry.count;
        if (st === "Resolved") deptData[cat].resolved += entry.count;
      }
    }

    // Compute derived metrics
    const departments = DEPARTMENTS.map((dept) => {
      const d = deptData[dept];
      d.resolutionRate = d.total > 0 ? Number(((d.resolved / d.total) * 100).toFixed(1)) : 0;
      d.workloadShare = totalSystemComplaints > 0 ? Number(((d.total / totalSystemComplaints) * 100).toFixed(1)) : 0;

      const slaInfo = deptSla[dept];
      if (slaInfo && slaInfo.totalWithSla > 0) {
        d.slaComplianceRate = Number(((slaInfo.compliant / slaInfo.totalWithSla) * 100).toFixed(1));
      } else {
        d.slaComplianceRate = 100;
      }

      const durations = deptDurations[dept] || [];
      if (durations.length > 0) {
        const sum = durations.reduce((a, b) => a + b, 0);
        d.avgResolutionHours = Number((sum / durations.length).toFixed(1));
      } else {
        d.avgResolutionHours = 0;
      }

      return d;
    });

    return res.status(200).json({
      departments,
      totalComplaints: totalSystemComplaints,
    });
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({ message: error.message });
    }
    console.error("[Admin Analytics] Failed to compute department comparison", error);
    return res.status(500).json({ message: "Failed to compute department performance", error: error.message });
  }
};

/**
 * 3. Resolution Efficiency & Ageing Controller
 * Computes average, median resolution times, fastest/slowest departments, and ageing distribution.
 */
export const getAdminAnalyticsResolution = async (req, res) => {
  try {
    const match = buildAnalyticsMatch(req.query);
    const now = new Date();

    // 1. Resolved complaints duration
    const resolvedComplaints = await Complaint.find({
      ...match,
      status: "Resolved",
    }).select("category sla createdAt updatedAt");

    const durations = [];
    const deptDurationMap = {};
    for (const d of DEPARTMENTS) deptDurationMap[d] = [];

    resolvedComplaints.forEach((c) => {
      const resolvedAt = c.sla?.resolvedAt ? new Date(c.sla.resolvedAt) : new Date(c.updatedAt);
      const startedAt = c.sla?.startedAt ? new Date(c.sla.startedAt) : new Date(c.createdAt);
      const hours = (resolvedAt.getTime() - startedAt.getTime()) / (1000 * 60 * 60);

      if (hours >= 0 && Number.isFinite(hours)) {
        durations.push(hours);
        if (deptDurationMap[c.category]) {
          deptDurationMap[c.category].push(hours);
        }
      }
    });

    // Average resolution time
    const avgResolutionHours = durations.length > 0
      ? Number((durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1))
      : 0;

    // Median resolution time
    let medianResolutionHours = 0;
    if (durations.length > 0) {
      const sorted = [...durations].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      if (sorted.length % 2 === 0) {
        medianResolutionHours = Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(1));
      } else {
        medianResolutionHours = Number(sorted[mid].toFixed(1));
      }
    }

    // Fastest and slowest department
    let fastestDepartment = null;
    let slowestDepartment = null;
    let minAvg = Infinity;
    let maxAvg = -Infinity;

    DEPARTMENTS.forEach((dept) => {
      const dList = deptDurationMap[dept];
      if (dList && dList.length > 0) {
        const avg = dList.reduce((a, b) => a + b, 0) / dList.length;
        if (avg < minAvg) {
          minAvg = avg;
          fastestDepartment = { department: dept, avgHours: Number(avg.toFixed(1)) };
        }
        if (avg > maxAvg) {
          maxAvg = avg;
          slowestDepartment = { department: dept, avgHours: Number(avg.toFixed(1)) };
        }
      }
    });

    // 2. Unresolved complaint ageing buckets
    const openComplaints = await Complaint.find({
      ...match,
      status: { $ne: "Resolved" },
    }).select("createdAt category");

    const ageingCounts = {
      under24Hours: 0,
      oneToThreeDays: 0,
      threeToSevenDays: 0,
      overSevenDays: 0,
    };

    const totalOpen = openComplaints.length;

    openComplaints.forEach((c) => {
      const ageHours = (now.getTime() - new Date(c.createdAt).getTime()) / (1000 * 60 * 60);
      if (ageHours < 24) {
        ageingCounts.under24Hours += 1;
      } else if (ageHours < 72) {
        ageingCounts.oneToThreeDays += 1;
      } else if (ageHours < 168) {
        ageingCounts.threeToSevenDays += 1;
      } else {
        ageingCounts.overSevenDays += 1;
      }
    });

    const ageingBuckets = [
      {
        range: "< 24 Hours",
        count: ageingCounts.under24Hours,
        percentage: totalOpen > 0 ? Number(((ageingCounts.under24Hours / totalOpen) * 100).toFixed(1)) : 0,
      },
      {
        range: "1 - 3 Days",
        count: ageingCounts.oneToThreeDays,
        percentage: totalOpen > 0 ? Number(((ageingCounts.oneToThreeDays / totalOpen) * 100).toFixed(1)) : 0,
      },
      {
        range: "3 - 7 Days",
        count: ageingCounts.threeToSevenDays,
        percentage: totalOpen > 0 ? Number(((ageingCounts.threeToSevenDays / totalOpen) * 100).toFixed(1)) : 0,
      },
      {
        range: "> 7 Days",
        count: ageingCounts.overSevenDays,
        percentage: totalOpen > 0 ? Number(((ageingCounts.overSevenDays / totalOpen) * 100).toFixed(1)) : 0,
      },
    ];

    return res.status(200).json({
      avgResolutionHours,
      avgResolutionDays: Number((avgResolutionHours / 24).toFixed(1)),
      medianResolutionHours,
      medianResolutionDays: Number((medianResolutionHours / 24).toFixed(1)),
      resolvedCount: durations.length,
      fastestDepartment,
      slowestDepartment,
      unresolvedCount: totalOpen,
      ageingBuckets,
    });
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({ message: error.message });
    }
    console.error("[Admin Analytics] Failed to compute resolution analytics", error);
    return res.status(500).json({ message: "Failed to compute resolution efficiency", error: error.message });
  }
};

/**
 * 4. SLA Compliance & Escalation Controller
 */
export const getAdminAnalyticsSla = async (req, res) => {
  try {
    const match = buildAnalyticsMatch(req.query);
    const now = new Date();

    const complaints = await Complaint.find(match).select("status category sla timeline updatedAt");

    let totalTracked = 0;
    let withinSla = 0;
    let breached = 0;
    let overdueUnresolved = 0;
    let resolvedWithinSla = 0;
    let resolvedBreached = 0;
    let totalEscalations = 0;

    const deptMap = {};
    for (const d of DEPARTMENTS) {
      deptMap[d] = {
        department: d,
        totalWithSla: 0,
        withinSla: 0,
        breached: 0,
        overdueUnresolved: 0,
        complianceRate: 100,
        escalations: 0,
      };
    }

    complaints.forEach((c) => {
      // Check escalations in timeline
      const hasEscalation = (c.timeline || []).some((evt) => {
        const text = `${evt.eventType || ""} ${evt.status || ""} ${evt.label || ""} ${evt.note || ""}`.toLowerCase();
        return text.includes("escalat");
      });

      if (hasEscalation) {
        totalEscalations += 1;
        if (deptMap[c.category]) {
          deptMap[c.category].escalations += 1;
        }
      }

      // Check SLA status
      if (c.sla?.deadline) {
        totalTracked += 1;
        const dObj = deptMap[c.category];
        if (dObj) dObj.totalWithSla += 1;

        const deadline = new Date(c.sla.deadline);

        if (c.status === "Resolved") {
          const resolvedAt = c.sla.resolvedAt ? new Date(c.sla.resolvedAt) : new Date(c.updatedAt);
          if (resolvedAt <= deadline) {
            withinSla += 1;
            resolvedWithinSla += 1;
            if (dObj) dObj.withinSla += 1;
          } else {
            breached += 1;
            resolvedBreached += 1;
            if (dObj) dObj.breached += 1;
          }
        } else {
          // Open complaint
          if (now <= deadline) {
            withinSla += 1;
            if (dObj) dObj.withinSla += 1;
          } else {
            overdueUnresolved += 1;
            breached += 1;
            if (dObj) {
              dObj.overdueUnresolved += 1;
              dObj.breached += 1;
            }
          }
        }
      }
    });

    // Compute rates
    const overallComplianceRate = totalTracked > 0
      ? Number(((withinSla / totalTracked) * 100).toFixed(1))
      : 100;

    const resolvedWithSlaTotal = resolvedWithinSla + resolvedBreached;
    const resolvedComplianceRate = resolvedWithSlaTotal > 0
      ? Number(((resolvedWithinSla / resolvedWithSlaTotal) * 100).toFixed(1))
      : 100;

    const departmentCompliance = DEPARTMENTS.map((dept) => {
      const d = deptMap[dept];
      d.complianceRate = d.totalWithSla > 0
        ? Number(((d.withinSla / d.totalWithSla) * 100).toFixed(1))
        : 100;
      return d;
    });

    return res.status(200).json({
      totalTracked,
      withinSla,
      breached,
      overdueUnresolved,
      resolvedWithinSla,
      resolvedBreached,
      overallComplianceRate,
      resolvedComplianceRate,
      totalEscalations,
      departmentCompliance,
    });
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({ message: error.message });
    }
    console.error("[Admin Analytics] Failed to compute SLA analytics", error);
    return res.status(500).json({ message: "Failed to compute SLA compliance", error: error.message });
  }
};

/**
 * 5. Priority & Urgency Distribution Controller
 */
export const getAdminAnalyticsPriority = async (req, res) => {
  try {
    const match = buildAnalyticsMatch(req.query);
    const now = new Date();

    const complaints = await Complaint.find(match).select(
      "status category aiAnalysis sla createdAt updatedAt"
    );

    const PRIORITY_LEVELS = ["Critical", "High", "Medium", "Low", "Unknown"];

    const priorityMap = {};
    PRIORITY_LEVELS.forEach((level) => {
      priorityMap[level] = {
        priority: level,
        count: 0,
        percentage: 0,
        resolved: 0,
        overdue: 0,
        resolutionRate: 0,
        durations: [],
        avgResolutionHours: 0,
      };
    });

    const deptMatrix = {};
    for (const d of DEPARTMENTS) {
      deptMatrix[d] = {
        department: d,
        Critical: 0,
        High: 0,
        Medium: 0,
        Low: 0,
        Unknown: 0,
        total: 0,
        totalUrgencyScore: 0,
        urgencyCount: 0,
        avgUrgencyScore: 0,
      };
    }

    let overallUrgencySum = 0;
    let overallUrgencyCount = 0;

    complaints.forEach((c) => {
      let prio = c.aiAnalysis?.priority;
      if (!prio || !["Critical", "High", "Medium", "Low"].includes(prio)) {
        prio = "Unknown";
      }

      const pEntry = priorityMap[prio];
      pEntry.count += 1;

      // Urgency score
      if (typeof c.aiAnalysis?.urgencyScore === "number" && !Number.isNaN(c.aiAnalysis.urgencyScore)) {
        overallUrgencySum += c.aiAnalysis.urgencyScore;
        overallUrgencyCount += 1;
        if (deptMatrix[c.category]) {
          deptMatrix[c.category].totalUrgencyScore += c.aiAnalysis.urgencyScore;
          deptMatrix[c.category].urgencyCount += 1;
        }
      }

      // Department matrix
      if (deptMatrix[c.category]) {
        deptMatrix[c.category][prio] += 1;
        deptMatrix[c.category].total += 1;
      }

      // Resolution & Overdue
      if (c.status === "Resolved") {
        pEntry.resolved += 1;
        const resolvedAt = c.sla?.resolvedAt ? new Date(c.sla.resolvedAt) : new Date(c.updatedAt);
        const startedAt = c.sla?.startedAt ? new Date(c.sla.startedAt) : new Date(c.createdAt);
        const hours = (resolvedAt.getTime() - startedAt.getTime()) / (1000 * 60 * 60);
        if (hours >= 0 && Number.isFinite(hours)) {
          pEntry.durations.push(hours);
        }
      } else if (c.sla?.deadline && new Date(c.sla.deadline) < now) {
        pEntry.overdue += 1;
      }
    });

    const totalComplaints = complaints.length;

    const priorityBreakdown = PRIORITY_LEVELS.map((level) => {
      const p = priorityMap[level];
      p.percentage = totalComplaints > 0 ? Number(((p.count / totalComplaints) * 100).toFixed(1)) : 0;
      p.resolutionRate = p.count > 0 ? Number(((p.resolved / p.count) * 100).toFixed(1)) : 0;
      if (p.durations.length > 0) {
        const sum = p.durations.reduce((a, b) => a + b, 0);
        p.avgResolutionHours = Number((sum / p.durations.length).toFixed(1));
      } else {
        p.avgResolutionHours = 0;
      }
      delete p.durations;
      return p;
    });

    const departmentMatrix = DEPARTMENTS.map((dept) => {
      const d = deptMatrix[dept];
      d.avgUrgencyScore = d.urgencyCount > 0 ? Number((d.totalUrgencyScore / d.urgencyCount).toFixed(1)) : 0;
      delete d.totalUrgencyScore;
      delete d.urgencyCount;
      return d;
    });

    const avgUrgencyScore = overallUrgencyCount > 0
      ? Number((overallUrgencySum / overallUrgencyCount).toFixed(1))
      : 0;

    return res.status(200).json({
      totalComplaints,
      avgUrgencyScore,
      priorityBreakdown,
      departmentMatrix,
    });
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({ message: error.message });
    }
    console.error("[Admin Analytics] Failed to compute priority distribution", error);
    return res.status(500).json({ message: "Failed to compute priority distribution", error: error.message });
  }
};

/**
 * 6. Unified Consolidated Analytics Controller
 * Gathers KPI summary, trends, department stats, resolution metrics, SLA, and priorities into a single payload.
 */
export const getAdminAnalytics = async (req, res) => {
  try {
    const match = buildAnalyticsMatch(req.query);
    const { interval = "monthly", dateRange, startDate, endDate, department } = req.query;
    const now = new Date();

    // 1. Fetch complaints matching the active scope
    const complaints = await Complaint.find(match).select(
      "title category status priority sla aiAnalysis timeline createdAt updatedAt"
    );

    const totalComplaints = complaints.length;
    let resolvedCount = 0;
    let pendingCount = 0;
    let inProgressCount = 0;
    let assignedCount = 0;
    let overdueCount = 0;
    let criticalCount = 0;
    let totalEscalations = 0;
    let totalWithSla = 0;
    let compliantWithSla = 0;

    const durations = [];
    const deptDurationMap = {};
    for (const d of DEPARTMENTS) deptDurationMap[d] = [];

    const deptMap = {};
    for (const d of DEPARTMENTS) {
      deptMap[d] = {
        department: d,
        total: 0,
        pending: 0,
        assigned: 0,
        inProgress: 0,
        resolved: 0,
        overdue: 0,
        resolutionRate: 0,
        slaComplianceRate: 100,
        avgResolutionHours: 0,
        workloadShare: 0,
        slaTotal: 0,
        slaCompliant: 0,
      };
    }

    const PRIORITY_LEVELS = ["Critical", "High", "Medium", "Low", "Unknown"];
    const priorityMap = {};
    PRIORITY_LEVELS.forEach((level) => {
      priorityMap[level] = {
        priority: level,
        count: 0,
        percentage: 0,
        resolved: 0,
        overdue: 0,
        resolutionRate: 0,
        durations: [],
        avgResolutionHours: 0,
      };
    });

    const ageingCounts = {
      under24Hours: 0,
      oneToThreeDays: 0,
      threeToSevenDays: 0,
      overSevenDays: 0,
    };

    let overallUrgencySum = 0;
    let overallUrgencyCount = 0;

    complaints.forEach((c) => {
      const cat = c.category;
      const st = c.status;
      const dObj = deptMap[cat];

      if (dObj) {
        dObj.total += 1;
        if (st === "Pending") dObj.pending += 1;
        if (st === "Assigned") dObj.assigned += 1;
        if (st === "In Progress") dObj.inProgress += 1;
        if (st === "Resolved") dObj.resolved += 1;
      }

      if (st === "Pending") pendingCount += 1;
      else if (st === "Assigned") assignedCount += 1;
      else if (st === "In Progress") inProgressCount += 1;
      else if (st === "Resolved") resolvedCount += 1;

      // Priority calculation
      let prio = c.aiAnalysis?.priority;
      if (!prio || !["Critical", "High", "Medium", "Low"].includes(prio)) {
        prio = "Unknown";
      }
      if (prio === "Critical") criticalCount += 1;
      priorityMap[prio].count += 1;

      // Urgency score
      if (typeof c.aiAnalysis?.urgencyScore === "number" && !Number.isNaN(c.aiAnalysis.urgencyScore)) {
        overallUrgencySum += c.aiAnalysis.urgencyScore;
        overallUrgencyCount += 1;
      }

      // Escalation in timeline
      const hasEscalation = (c.timeline || []).some((evt) => {
        const text = `${evt.eventType || ""} ${evt.status || ""} ${evt.label || ""} ${evt.note || ""}`.toLowerCase();
        return text.includes("escalat");
      });
      if (hasEscalation) totalEscalations += 1;

      // SLA handling
      const deadline = c.sla?.deadline ? new Date(c.sla.deadline) : null;
      if (deadline) {
        totalWithSla += 1;
        if (dObj) dObj.slaTotal += 1;

        if (st === "Resolved") {
          const resolvedAt = c.sla.resolvedAt ? new Date(c.sla.resolvedAt) : new Date(c.updatedAt);
          if (resolvedAt <= deadline) {
            compliantWithSla += 1;
            if (dObj) dObj.slaCompliant += 1;
          }
        } else {
          // Open
          if (now <= deadline) {
            compliantWithSla += 1;
            if (dObj) dObj.slaCompliant += 1;
          } else {
            overdueCount += 1;
            priorityMap[prio].overdue += 1;
            if (dObj) dObj.overdue += 1;
          }
        }
      }

      // Resolution duration and ageing
      if (st === "Resolved") {
        priorityMap[prio].resolved += 1;
        const resolvedAt = c.sla?.resolvedAt ? new Date(c.sla.resolvedAt) : new Date(c.updatedAt);
        const startedAt = c.sla?.startedAt ? new Date(c.sla.startedAt) : new Date(c.createdAt);
        const hours = (resolvedAt.getTime() - startedAt.getTime()) / (1000 * 60 * 60);
        if (hours >= 0 && Number.isFinite(hours)) {
          durations.push(hours);
          priorityMap[prio].durations.push(hours);
          if (deptDurationMap[cat]) {
            deptDurationMap[cat].push(hours);
          }
        }
      } else {
        // Unresolved ageing
        const ageHours = (now.getTime() - new Date(c.createdAt).getTime()) / (1000 * 60 * 60);
        if (ageHours < 24) ageingCounts.under24Hours += 1;
        else if (ageHours < 72) ageingCounts.oneToThreeDays += 1;
        else if (ageHours < 168) ageingCounts.threeToSevenDays += 1;
        else ageingCounts.overSevenDays += 1;
      }
    });

    // Summary metrics
    const resolutionRate = totalComplaints > 0
      ? Number(((resolvedCount / totalComplaints) * 100).toFixed(1))
      : 0;

    const slaComplianceRate = totalWithSla > 0
      ? Number(((compliantWithSla / totalWithSla) * 100).toFixed(1))
      : 100;

    const avgResolutionHours = durations.length > 0
      ? Number((durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1))
      : 0;

    let medianResolutionHours = 0;
    if (durations.length > 0) {
      const sorted = [...durations].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      if (sorted.length % 2 === 0) {
        medianResolutionHours = Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(1));
      } else {
        medianResolutionHours = Number(sorted[mid].toFixed(1));
      }
    }

    // Fastest & slowest department
    let fastestDepartment = null;
    let slowestDepartment = null;
    let minAvg = Infinity;
    let maxAvg = -Infinity;

    DEPARTMENTS.forEach((dept) => {
      const dList = deptDurationMap[dept];
      if (dList && dList.length > 0) {
        const avg = dList.reduce((a, b) => a + b, 0) / dList.length;
        if (avg < minAvg) {
          minAvg = avg;
          fastestDepartment = { department: dept, avgHours: Number(avg.toFixed(1)) };
        }
        if (avg > maxAvg) {
          maxAvg = avg;
          slowestDepartment = { department: dept, avgHours: Number(avg.toFixed(1)) };
        }
      }
    });

    // Department breakdown
    const departmentBreakdown = DEPARTMENTS.map((dept) => {
      const d = deptMap[dept];
      d.resolutionRate = d.total > 0 ? Number(((d.resolved / d.total) * 100).toFixed(1)) : 0;
      d.workloadShare = totalComplaints > 0 ? Number(((d.total / totalComplaints) * 100).toFixed(1)) : 0;
      d.slaComplianceRate = d.slaTotal > 0 ? Number(((d.slaCompliant / d.slaTotal) * 100).toFixed(1)) : 100;
      const dTimes = deptDurationMap[dept] || [];
      d.avgResolutionHours = dTimes.length > 0
        ? Number((dTimes.reduce((a, b) => a + b, 0) / dTimes.length).toFixed(1))
        : 0;
      delete d.slaTotal;
      delete d.slaCompliant;
      return d;
    });

    // Priority breakdown
    const priorityBreakdown = PRIORITY_LEVELS.map((level) => {
      const p = priorityMap[level];
      p.percentage = totalComplaints > 0 ? Number(((p.count / totalComplaints) * 100).toFixed(1)) : 0;
      p.resolutionRate = p.count > 0 ? Number(((p.resolved / p.count) * 100).toFixed(1)) : 0;
      p.avgResolutionHours = p.durations.length > 0
        ? Number((p.durations.reduce((a, b) => a + b, 0) / p.durations.length).toFixed(1))
        : 0;
      delete p.durations;
      return p;
    });

    // Ageing breakdown
    const openCount = totalComplaints - resolvedCount;
    const ageingBuckets = [
      {
        range: "< 24 Hours",
        count: ageingCounts.under24Hours,
        percentage: openCount > 0 ? Number(((ageingCounts.under24Hours / openCount) * 100).toFixed(1)) : 0,
      },
      {
        range: "1 - 3 Days",
        count: ageingCounts.oneToThreeDays,
        percentage: openCount > 0 ? Number(((ageingCounts.oneToThreeDays / openCount) * 100).toFixed(1)) : 0,
      },
      {
        range: "3 - 7 Days",
        count: ageingCounts.threeToSevenDays,
        percentage: openCount > 0 ? Number(((ageingCounts.threeToSevenDays / openCount) * 100).toFixed(1)) : 0,
      },
      {
        range: "> 7 Days",
        count: ageingCounts.overSevenDays,
        percentage: openCount > 0 ? Number(((ageingCounts.overSevenDays / openCount) * 100).toFixed(1)) : 0,
      },
    ];

    // Trends grouping
    const validIntervals = ["daily", "weekly", "monthly"];
    const activeInterval = validIntervals.includes(interval) ? interval : "monthly";

    let dateToStringFormat = "%Y-%m";
    if (activeInterval === "daily") dateToStringFormat = "%Y-%m-%d";
    else if (activeInterval === "weekly") dateToStringFormat = "%G-W%V";

    const trendAggregation = await Complaint.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            period: { $dateToString: { format: dateToStringFormat, date: "$createdAt" } },
            status: "$status",
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.period": 1 } },
    ]);

    const periodMap = new Map();
    trendAggregation.forEach((item) => {
      const p = item._id.period;
      if (!periodMap.has(p)) {
        periodMap.set(p, {
          period: p,
          submitted: 0,
          resolved: 0,
          pending: 0,
          inProgress: 0,
          assigned: 0,
        });
      }
      const entry = periodMap.get(p);
      entry.submitted += item.count;
      if (item._id.status === "Resolved") entry.resolved += item.count;
      if (item._id.status === "Pending") entry.pending += item.count;
      if (item._id.status === "In Progress") entry.inProgress += item.count;
      if (item._id.status === "Assigned") entry.assigned += item.count;
    });

    const trendPoints = Array.from(periodMap.values()).sort((a, b) => a.period.localeCompare(b.period));

    // Previous period comparison
    const prevDates = getPreviousPeriodDates(dateRange, startDate, endDate);
    let comparison = null;

    if (prevDates) {
      const prevMatch = {
        createdAt: { $gte: prevDates.prevStart, $lte: prevDates.prevEnd },
      };
      if (department && department !== "All Departments") {
        prevMatch.category = department;
      }
      const prevCount = await Complaint.countDocuments(prevMatch);
      let percentChange = 0;
      if (prevCount > 0) {
        percentChange = Number((((totalComplaints - prevCount) / prevCount) * 100).toFixed(1));
      } else if (totalComplaints > 0) {
        percentChange = 100;
      }

      let trendDirection = "flat";
      if (percentChange > 0) trendDirection = "up";
      else if (percentChange < 0) trendDirection = "down";

      comparison = {
        currentPeriodSubmitted: totalComplaints,
        previousPeriodSubmitted: prevCount,
        percentChange,
        trendDirection,
      };
    }

    return res.status(200).json({
      summary: {
        totalComplaints,
        resolvedCount,
        pendingCount,
        assignedCount,
        inProgressCount,
        activeBacklog: pendingCount + assignedCount + inProgressCount,
        overdueCount,
        resolutionRate,
        slaComplianceRate,
        avgResolutionHours,
        avgResolutionDays: Number((avgResolutionHours / 24).toFixed(1)),
        medianResolutionHours,
        medianResolutionDays: Number((medianResolutionHours / 24).toFixed(1)),
        criticalCount,
        totalEscalations,
        avgUrgencyScore: overallUrgencyCount > 0 ? Number((overallUrgencySum / overallUrgencyCount).toFixed(1)) : 0,
      },
      trends: {
        interval: activeInterval,
        points: trendPoints,
        comparison,
      },
      departments: departmentBreakdown,
      resolution: {
        avgResolutionHours,
        medianResolutionHours,
        fastestDepartment,
        slowestDepartment,
        unresolvedCount: openCount,
        ageingBuckets,
      },
      sla: {
        totalTracked: totalWithSla,
        compliantWithSla,
        breached: totalWithSla - compliantWithSla,
        complianceRate: slaComplianceRate,
        totalEscalations,
      },
      priority: {
        breakdown: priorityBreakdown,
      },
      appliedFilters: {
        dateRange: dateRange || "allTime",
        department: department || "All Departments",
        interval: activeInterval,
      },
    });
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({ message: error.message });
    }
    console.error("[Admin Analytics] Failed to compute analytics", error);
    return res.status(500).json({ message: "Failed to compute analytics", error: error.message });
  }
};

