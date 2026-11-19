import React, { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Filter,
  Info,
  MapPin,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Layers,
  X,
  ShieldCheck,
  Calendar,
  Building2,
  Tag,
} from "lucide-react";
import { DEPARTMENTS } from "@/config/departments";
import { complaintsApi, type ComplaintRecord } from "@/services/complaintsApi";
import { ApiErrorPanel } from "@/components/shared/ApiErrorPanel";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const DATE_RANGES = ["Last 30 Days", "Last 6 Months", "This Year", "All Time"] as const;

const getCutoffDate = (range: (typeof DATE_RANGES)[number]) => {
  const now = new Date();
  if (range === "All Time") return null;

  const next = new Date(now);
  if (range === "Last 30 Days") next.setDate(now.getDate() - 30);
  if (range === "Last 6 Months") next.setMonth(now.getMonth() - 6);
  if (range === "This Year") next.setMonth(0, 1);
  next.setHours(0, 0, 0, 0);
  return next;
};

const normalizeLocation = (location: string) => location.trim().replace(/\s+/g, " ");

interface CoordinateComplaint extends ComplaintRecord {
  latitude: number;
  longitude: number;
}

interface MapCluster {
  id: string;
  x: number;
  y: number;
  complaints: CoordinateComplaint[];
  severity: "High" | "Medium" | "Low";
}

const SVG_WIDTH = 800;
const SVG_HEIGHT = 440;
const PADDING = 60;

const HeatmapView: React.FC = () => {
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [department, setDepartment] = useState("All Departments");
  const [dateRange, setDateRange] = useState<(typeof DATE_RANGES)[number]>("Last 30 Days");

  // Map viewport state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedCluster, setSelectedCluster] = useState<MapCluster | null>(null);

  useEffect(() => {
    const loadComplaints = async () => {
      try {
        const data = await complaintsApi.listAll();
        setComplaints(data);
      } catch (requestError) {
        setLoadError(requestError);
      } finally {
        setLoading(false);
      }
    };

    loadComplaints().catch(() => setLoading(false));
  }, []);

  const filteredComplaints = useMemo(() => {
    const cutoff = getCutoffDate(dateRange);

    return complaints.filter((complaint) => {
      const matchesDepartment = department === "All Departments" || complaint.category === department;
      const matchesDate = !cutoff || new Date(complaint.createdAt) >= cutoff;
      return matchesDepartment && matchesDate;
    });
  }, [complaints, dateRange, department]);

  // Valid coordinate complaints
  const geoComplaints = useMemo<CoordinateComplaint[]>(() => {
    return filteredComplaints.filter((c): c is CoordinateComplaint => {
      return (
        typeof c.latitude === "number" &&
        typeof c.longitude === "number" &&
        !isNaN(c.latitude) &&
        !isNaN(c.longitude) &&
        c.latitude >= -90 &&
        c.latitude <= 90 &&
        c.longitude >= -180 &&
        c.longitude <= 180
      );
    });
  }, [filteredComplaints]);

  // Map bounding box and clustering
  const { clusters, bounds } = useMemo(() => {
    if (geoComplaints.length === 0) {
      return { clusters: [], bounds: null };
    }

    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;

    for (const c of geoComplaints) {
      if (c.latitude < minLat) minLat = c.latitude;
      if (c.latitude > maxLat) maxLat = c.latitude;
      if (c.longitude < minLng) minLng = c.longitude;
      if (c.longitude > maxLng) maxLng = c.longitude;
    }

    // Minimum view span (~2.2 km) so nearby incidents cluster realistically
    const MIN_GEO_SPAN = 0.02;
    const latDiff = maxLat - minLat;
    const lngDiff = maxLng - minLng;
    const effectiveLatSpan = Math.max(latDiff * 1.3, MIN_GEO_SPAN);
    const effectiveLngSpan = Math.max(lngDiff * 1.3, MIN_GEO_SPAN);
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;

    const bLatMin = centerLat - effectiveLatSpan / 2;
    const bLatMax = centerLat + effectiveLatSpan / 2;
    const bLngMin = centerLng - effectiveLngSpan / 2;
    const bLngMax = centerLng + effectiveLngSpan / 2;
    const bLatSpan = effectiveLatSpan;
    const bLngSpan = effectiveLngSpan;

    const project = (lat: number, lng: number) => {
      const normX = (lng - bLngMin) / bLngSpan;
      const normY = (bLatMax - lat) / bLatSpan;
      const x = PADDING + normX * (SVG_WIDTH - 2 * PADDING);
      const y = PADDING + normY * (SVG_HEIGHT - 2 * PADDING);
      return { x: Math.round(x), y: Math.round(y) };
    };

    // Cluster nearby points (within 28 pixels)
    const clusterList: MapCluster[] = [];
    const CLUSTER_RADIUS = 28;

    for (const c of geoComplaints) {
      const pt = project(c.latitude, c.longitude);
      let found = false;

      for (const cl of clusterList) {
        const dx = cl.x - pt.x;
        const dy = cl.y - pt.y;
        if (Math.hypot(dx, dy) < CLUSTER_RADIUS) {
          cl.complaints.push(c);
          found = true;
          break;
        }
      }

      if (!found) {
        clusterList.push({
          id: `cluster-${clusterList.length + 1}`,
          x: pt.x,
          y: pt.y,
          complaints: [c],
          severity: "Low",
        });
      }
    }

    // Determine cluster severity
    for (const cl of clusterList) {
      const openCount = cl.complaints.filter((c) => c.status !== "Resolved").length;
      cl.severity = openCount >= 4 ? "High" : openCount >= 2 ? "Medium" : "Low";
    }

    return {
      clusters: clusterList,
      bounds: { bLatMin, bLatMax, bLngMin, bLngMax },
    };
  }, [geoComplaints]);

  // Text-based Hotspot Ranking (Fallback & summary)
  const hotspots = useMemo(() => {
    const byLocation = filteredComplaints.reduce<Record<string, { location: string; count: number; statuses: string[] }>>((acc, complaint) => {
      const location = normalizeLocation(complaint.location || "");
      if (!location) return acc;

      if (!acc[location]) {
        acc[location] = { location, count: 0, statuses: [] };
      }

      acc[location].count += 1;
      acc[location].statuses.push(complaint.status);
      return acc;
    }, {});

    return Object.values(byLocation)
      .map((entry) => {
        const resolvedCount = entry.statuses.filter((status) => status === "Resolved").length;
        const openCount = entry.count - resolvedCount;

        return {
          ...entry,
          resolvedCount,
          openCount,
          severity: openCount >= 5 ? "High" : openCount >= 3 ? "Medium" : "Low",
        };
      })
      .sort((left, right) => right.count - left.count);
  }, [filteredComplaints]);

  const totalWithLocation = filteredComplaints.filter((complaint) => normalizeLocation(complaint.location || "")).length;
  const topCount = hotspots[0]?.count || 0;

  const handleZoomIn = () => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)));
  const handleZoomOut = () => setZoom((z) => Math.max(0.75, +(z - 0.25).toFixed(2)));
  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSelectedCluster(null);
  };

  if (loadError) return <ApiErrorPanel error={loadError} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Complaint Geographic Heatmap</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Interactive coordinate visualization with clustered hotspot pins, incident summaries, and location rankings.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select
              aria-label="Filter by Department"
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              className="cursor-pointer bg-transparent text-sm text-foreground outline-none"
            >
              <option>All Departments</option>
              {DEPARTMENTS.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <select
              aria-label="Filter by Date Range"
              value={dateRange}
              onChange={(event) => setDateRange(event.target.value as (typeof DATE_RANGES)[number])}
              className="cursor-pointer bg-transparent text-sm text-foreground outline-none"
            >
              {DATE_RANGES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "GPS Mapped Complaints", value: geoComplaints.length },
          { label: "Active Clusters", value: clusters.length },
          { label: "Text-Tagged Records", value: totalWithLocation },
          { label: "Unmapped / Missing GPS", value: filteredComplaints.length - geoComplaints.length },
        ].map((item) => (
          <motion.div key={item.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="glass-card">
              <div className="p-4">
                <p className="text-2xl font-heading font-bold text-foreground">{loading ? "..." : item.value}</p>
                <p className="text-xs text-muted-foreground">{item.label}</p>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Interactive Geographic Map View */}
      <Card className="glass-card overflow-hidden">
        <div className="p-4 border-b border-border/60 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Interactive Coordinate Map</h3>
            <span className="text-xs text-muted-foreground">({geoComplaints.length} plotted incidents)</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={handleZoomIn}
              disabled={zoom >= 3}
              title="Zoom in"
              aria-label="Zoom in"
              className="h-8 w-8 p-0"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleZoomOut}
              disabled={zoom <= 0.75}
              title="Zoom out"
              aria-label="Zoom out"
              className="h-8 w-8 p-0"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetView}
              title="Reset view"
              aria-label="Reset view"
              className="h-8 px-2 text-xs gap-1"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </Button>
          </div>
        </div>

        <div className="relative w-full bg-slate-950/60 min-h-[440px] flex items-center justify-center overflow-hidden">
          {loading ? (
            <div className="text-sm text-muted-foreground py-20">Loading spatial coordinate data...</div>
          ) : geoComplaints.length === 0 ? (
            <div className="text-center p-8 max-w-md">
              <MapPin className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">No GPS Coordinates Plotted</p>
              <p className="text-xs text-muted-foreground mt-1">
                None of the complaints matching this filter contain valid GPS coordinates. Refer to the textual hotspot rankings below for location breakdowns.
              </p>
            </div>
          ) : (
            <>
              {/* Interactive SVG Projection */}
              <svg
                viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
                className="w-full h-[440px] select-none"
                style={{
                  transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
                  transformOrigin: "center center",
                  transition: "transform 0.18s ease-out",
                }}
              >
                {/* Background geospatial grid pattern */}
                <defs>
                  <pattern id="geo-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                  </pattern>
                  <radialGradient id="cluster-glow-high" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#EF4444" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#EF4444" stopOpacity="0" />
                  </radialGradient>
                  <radialGradient id="cluster-glow-med" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
                  </radialGradient>
                  <radialGradient id="cluster-glow-low" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
                  </radialGradient>
                </defs>

                <rect width={SVG_WIDTH} height={SVG_HEIGHT} fill="url(#geo-grid)" />

                {/* Coordinate boundary indicator */}
                {bounds && (
                  <g className="text-[10px] fill-muted-foreground/40 font-mono">
                    <text x="12" y="24">{bounds.bLatMax.toFixed(4)}°N</text>
                    <text x="12" y={SVG_HEIGHT - 12}>{bounds.bLatMin.toFixed(4)}°N</text>
                    <text x={SVG_WIDTH - 70} y={SVG_HEIGHT - 12}>{bounds.bLngMax.toFixed(4)}°E</text>
                  </g>
                )}

                {/* Hotspot Clusters and Pins */}
                {clusters.map((cluster) => {
                  const isSelected = selectedCluster?.id === cluster.id;
                  const isSingle = cluster.complaints.length === 1;
                  const singleComplaint = cluster.complaints[0];

                  const pinColor =
                    cluster.severity === "High"
                      ? "#EF4444"
                      : cluster.severity === "Medium"
                      ? "#F59E0B"
                      : singleComplaint?.status === "Resolved"
                      ? "#10B981"
                      : "#3B82F6";

                  const glowId =
                    cluster.severity === "High"
                      ? "url(#cluster-glow-high)"
                      : cluster.severity === "Medium"
                      ? "url(#cluster-glow-med)"
                      : "url(#cluster-glow-low)";

                  return (
                    <g
                      key={cluster.id}
                      className="cursor-pointer transition-transform hover:scale-110"
                      onClick={() => setSelectedCluster(cluster)}
                    >
                      {/* Outer pulse aura */}
                      <circle cx={cluster.x} cy={cluster.y} r={isSelected ? 32 : 22} fill={glowId} />

                      {/* Main marker circle */}
                      <circle
                        cx={cluster.x}
                        cy={cluster.y}
                        r={isSingle ? 10 : 14}
                        fill={pinColor}
                        stroke="#0F172A"
                        strokeWidth={2.5}
                        className={isSelected ? "stroke-white" : ""}
                      />

                      {/* Marker Label */}
                      <text
                        x={cluster.x}
                        y={cluster.y + (isSingle ? 3 : 4)}
                        textAnchor="middle"
                        fill="#FFFFFF"
                        fontSize={isSingle ? "9px" : "11px"}
                        fontWeight="bold"
                        className="pointer-events-none"
                      >
                        {isSingle ? "1" : cluster.complaints.length}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {/* Legend overlay */}
              <div className="absolute bottom-3 left-3 bg-slate-900/90 backdrop-blur border border-border/80 rounded-lg p-2.5 text-xs text-muted-foreground flex flex-col gap-1.5 shadow-lg">
                <span className="font-semibold text-foreground text-[11px] mb-0.5">Hotspot Legend</span>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                  <span>Critical / High Density (4+ open)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                  <span>Medium Density (2-3 open)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                  <span>Standard / Open Issue</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                  <span>Resolved Cluster</span>
                </div>
              </div>

              {/* Cluster Detail Drawer / Popover */}
              <AnimatePresence>
                {selectedCluster && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="absolute top-4 right-4 z-20 w-80 max-h-[400px] overflow-y-auto bg-slate-900/95 border border-border/90 rounded-xl p-4 shadow-2xl backdrop-blur-md"
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-border/60 mb-3">
                      <div>
                        <h4 className="text-sm font-bold text-foreground">
                          {selectedCluster.complaints.length > 1
                            ? `Cluster: ${selectedCluster.complaints.length} Incidents`
                            : "Incident Location Detail"}
                        </h4>
                        <span className="text-xs text-muted-foreground">
                          Severity: <strong className="text-foreground">{selectedCluster.severity}</strong>
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setSelectedCluster(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Privacy notice */}
                    <div className="p-2 rounded bg-primary/10 border border-primary/20 text-[11px] text-muted-foreground mb-3 flex items-start gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                      <span>Citizen personal identity details are protected and omitted from this geospatial map view.</span>
                    </div>

                    <div className="space-y-3">
                      {selectedCluster.complaints.map((item) => {
                        const complaintId = item.id || (item as unknown as { _id?: string })._id || "";
                        const displayRef =
                          item.reference ||
                          (complaintId ? `CMP-${String(complaintId).slice(-6).toUpperCase()}` : "CMP-UNKNOWN");

                        return (
                          <div
                            key={complaintId || displayRef}
                            className="p-2.5 rounded-lg border border-border/60 bg-card/60 space-y-1.5 text-xs"
                          >
                            <div className="flex items-start justify-between gap-1">
                              <span className="font-semibold text-foreground line-clamp-1">{item.title}</span>
                              <Badge
                                variant="outline"
                                className={`text-[10px] uppercase font-bold shrink-0 ${
                                  item.status === "Resolved"
                                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                    : item.status === "In Progress"
                                    ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
                                    : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                }`}
                              >
                                {item.status}
                              </Badge>
                            </div>

                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Building2 className="w-3 h-3 shrink-0" />
                              <span>{item.category}</span>
                              <span>•</span>
                              <Tag className="w-3 h-3 shrink-0" />
                              <span>Priority: {item.priority || "Medium"}</span>
                            </div>

                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <MapPin className="w-3 h-3 shrink-0" />
                              <span className="truncate">{item.location || "Recorded GPS pin"}</span>
                            </div>

                            <div className="flex items-center justify-between text-[10px] text-muted-foreground/80 pt-1 border-t border-border/40 font-mono">
                              <span>ID: {displayRef}</span>
                              <span>
                                {typeof item.latitude === "number" ? item.latitude.toFixed(4) : "—"}°N,{" "}
                                {typeof item.longitude === "number" ? item.longitude.toFixed(4) : "—"}°E
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>
      </Card>

      {/* Text-based Hotspot Ranking (Fallback for unmapped records) */}
      <Card className="glass-card">
        <div className="p-4 pb-2">
          <h3 className="flex items-center gap-2 text-sm font-heading font-semibold">
            <AlertTriangle className="h-4 w-4 text-primary" /> Hotspot Ranking (Text-Based Locations)
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Aggregated rankings for citizen-reported location strings across all complaints.
          </p>
        </div>
        <div className="p-4 pt-2">
          {loading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Loading hotspot data...</div>
          ) : hotspots.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No location-based complaints are available for the current filters.
            </div>
          ) : (
            <div className="space-y-3">
              {hotspots.slice(0, 10).map((spot) => {
                const width = topCount ? Math.max(18, Math.round((spot.count / topCount) * 100)) : 0;
                return (
                  <div key={spot.location} className="rounded-2xl border border-border/60 bg-card/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{spot.location}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {spot.openCount} open · {spot.resolvedCount} resolved · Severity {spot.severity}
                        </p>
                      </div>
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                        {spot.count} complaints
                      </span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-sky-400" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      <Card className="glass-card">
        <div className="flex items-start gap-3 p-5 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          This geospatial heatmap projects real GPS coordinates captured during complaint registration with marker clustering, density indicators, and citizen privacy protection. For records without device coordinates, the text ranking above provides comprehensive hotspot identification.
        </div>
      </Card>
    </div>
  );
};

export default HeatmapView;
