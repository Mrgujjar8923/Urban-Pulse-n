import React from "react";
import { motion } from "framer-motion";
import { Brain, FileText, MapPin, Route, CheckCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { complaintsApi, type ComplaintRecord } from "@/services/complaintsApi";
import { ApiErrorPanel } from "@/components/shared/ApiErrorPanel";

const AIInsights: React.FC = () => {
  const [complaints, setComplaints] = React.useState<ComplaintRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<unknown>(null);

  React.useEffect(() => {
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

  if (loadError) return <ApiErrorPanel error={loadError} />;

  const metrics = [
    {
      name: "Categorized Complaints",
      icon: Brain,
      value: complaints.filter((complaint) => Boolean(complaint.category)).length,
      helper: "Complaints carrying a department category",
    },
    {
      name: "Assigned Routing",
      icon: Route,
      value: complaints.filter((complaint) => Boolean(complaint.assignedTo)).length,
      helper: "Complaints already routed to a team member",
    },
    {
      name: "Location Coverage",
      icon: MapPin,
      value: complaints.filter((complaint) => Boolean(complaint.location?.trim())).length,
      helper: "Complaints with a usable location field",
    },
    {
      name: "Resolved Cases",
      icon: CheckCircle,
      value: complaints.filter((complaint) => complaint.status === "Resolved").length,
      helper: "Resolved complaints in the current dataset",
    },
  ];

  const recentComplaints = complaints.slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">AI Insights</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Live operational signals derived from the current complaint dataset.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric, index) => (
          <motion.div
            key={metric.name}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06 }}
          >
            <Card className="glass-card">
              <div className="p-4">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg gradient-primary">
                    <metric.icon className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{metric.name}</p>
                    <p className="text-xs text-muted-foreground">{metric.helper}</p>
                  </div>
                </div>
                <p className="text-3xl font-heading font-bold text-foreground">{loading ? "..." : metric.value}</p>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card className="glass-card">
        <div className="pb-2">
          <h3 className="text-sm font-heading">Recent Complaint Routing</h3>
        </div>
        <div className="p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading complaint signals...</div>
          ) : recentComplaints.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No complaint data is available yet. AI-specific telemetry will appear once live records exist.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recentComplaints.map((complaint) => (
                <div key={complaint.id} className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{complaint.title}</p>
                    <p className="text-xs text-muted-foreground">{complaint.reference}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-medium text-primary">{complaint.category || "Uncategorized"}</p>
                    <p className="text-xs text-muted-foreground">
                      {complaint.assignedTo?.name || "Unassigned"} · {complaint.status}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card className="glass-card">
        <div className="p-5 text-sm text-muted-foreground">
          The current backend does not store model scores, confidence values, or sentiment metadata yet, so this view now reflects only live complaint records instead of placeholder AI metrics.
        </div>
      </Card>
    </div>
  );
};

export default AIInsights;
