import React from "react";
import { motion } from "framer-motion";
import { CheckCircle, Star, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { complaintsApi, type ComplaintRecord } from "@/services/complaintsApi";
import { Card } from "@/components/ui/card";
import { ApiErrorPanel } from "@/components/shared/ApiErrorPanel";

const AuthorityPerformance: React.FC = () => {
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

  const feedbackByAuthority: Record<string, { name: string; dept: string; count: number; avgRating: number; avgPercent: number; completedCount: number }> = {};

  complaints.forEach((complaint) => {
    if (!complaint.feedback || !complaint.assignedTo) return;

    if (!feedbackByAuthority[complaint.assignedTo.id]) {
      feedbackByAuthority[complaint.assignedTo.id] = {
        name: complaint.assignedTo.name,
        dept: complaint.assignedTo.department || "—",
        count: 0,
        avgRating: 0,
        avgPercent: 0,
        completedCount: 0,
      };
    }

    const authority = feedbackByAuthority[complaint.assignedTo.id];
    authority.count += 1;
    authority.avgRating += complaint.feedback.rating;
    authority.avgPercent += complaint.feedback.percentDone;
    if (complaint.feedback.workCompleted) authority.completedCount += 1;
  });

  const authorities = Object.values(feedbackByAuthority).map((authority) => ({
    ...authority,
    avgRating: authority.count > 0 ? authority.avgRating / authority.count : 0,
    avgPercent: authority.count > 0 ? Math.round(authority.avgPercent / authority.count) : 0,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Authority & Officer Performance</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Individual supervisor and field officer performance derived from verified citizen evaluations.</p>
      </div>

      {loading ? (
        <Card className="glass-card">
          <div className="p-8 text-center text-sm text-muted-foreground">Loading performance data...</div>
        </Card>
      ) : authorities.length === 0 ? (
        <Card className="glass-card">
          <div className="p-8 text-center text-sm text-muted-foreground">No feedback data available yet.</div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {authorities.map((authority, index) => (
            <motion.div
              key={authority.name}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card className="glass-card">
                <div className="p-5">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full gradient-primary text-xs font-bold text-primary-foreground">
                      {authority.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{authority.name}</p>
                      <p className="text-xs text-muted-foreground">{authority.dept}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg bg-muted/30 p-3 text-center">
                      <div className="mb-1 flex justify-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={cn(
                              "h-3.5 w-3.5",
                              star <= Math.round(authority.avgRating) ? "fill-warning text-warning" : "text-muted-foreground/20",
                            )}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">{authority.avgRating.toFixed(1)} Avg Rating</p>
                    </div>
                    <div className="rounded-lg bg-muted/30 p-3 text-center">
                      <TrendingUp className="mx-auto mb-1 h-4 w-4 text-primary" />
                      <p className="text-sm font-bold text-foreground">{authority.avgPercent}%</p>
                      <p className="text-xs text-muted-foreground">Avg Completion</p>
                    </div>
                    <div className="rounded-lg bg-muted/30 p-3 text-center">
                      <CheckCircle className="mx-auto mb-1 h-4 w-4 text-success" />
                      <p className="text-sm font-bold text-foreground">{authority.completedCount}/{authority.count}</p>
                      <p className="text-xs text-muted-foreground">Completed</p>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AuthorityPerformance;
