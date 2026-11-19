import React from "react";
import { motion } from "framer-motion";
import { Building, CheckCircle, Clock, Shield, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { adminApi, type DepartmentRequestRecord } from "@/services/adminApi";

type RequestStatus = DepartmentRequestRecord["status"];

const statusConfig: Record<RequestStatus, { label: string; className: string; icon: React.ElementType }> = {
  pending: { label: "Pending", className: "bg-warning/10 text-warning border-warning/20", icon: Clock },
  active: { label: "Approved", className: "bg-success/10 text-success border-success/20", icon: CheckCircle },
  rejected: { label: "Rejected", className: "bg-destructive/10 text-destructive border-destructive/20", icon: XCircle },
};

const AuthorityApprovals: React.FC = () => {
  const { toast } = useToast();
  const [requests, setRequests] = React.useState<DepartmentRequestRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const loadRequests = async () => {
      try {
        const data = await adminApi.listDepartmentRequests();
        setRequests(data);
      } catch (_error) {
        setRequests([]);
      } finally {
        setLoading(false);
      }
    };

    loadRequests().catch(() => setLoading(false));
  }, []);

  const handleAction = async (id: string, status: "active" | "rejected") => {
    setBusyId(id);

    try {
      const updated = await adminApi.reviewDepartmentRequest(id, status);
      setRequests((current) => current.map((request) => (request.id === id ? updated : request)));
      toast({
        title: status === "active" ? "Department Approved" : "Department Rejected",
        description: `The department account has been ${status === "active" ? "approved" : "rejected"}.`,
      });
    } catch (error: unknown) {
      toast({
        title: "Action failed",
        description: error instanceof Error ? error.message : "Unable to update the department request right now.",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const pending = requests.filter((request) => request.status === "pending");
  const reviewed = requests.filter((request) => request.status !== "pending");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Department Approvals</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Review and approve live department registration requests.</p>
      </div>

      <Card className="glass-card">
        <div className="pb-3">
          <h3 className="flex items-center gap-2 text-sm font-heading">
            <Clock className="h-4 w-4 text-warning" /> Pending Requests ({pending.length})
          </h3>
        </div>
        <div className="p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading requests...</div>
          ) : pending.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No pending requests.</div>
          ) : (
            <div className="divide-y divide-border">
              {pending.map((request, index) => (
                <motion.div
                  key={request.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-center justify-between gap-4 p-4"
                >
                  <div className="min-w-0 flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full gradient-primary text-xs font-bold text-primary-foreground">
                      {request.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{request.name}</p>
                      <p className="text-xs text-muted-foreground">{request.email}</p>
                      <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <Building className="h-3 w-3" /> {request.department || "—"}
                        <span className="ml-2">
                          Applied: {request.appliedAt ? new Date(request.appliedAt).toLocaleDateString() : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-destructive/30 text-destructive hover:bg-destructive/10"
                      disabled={busyId === request.id}
                      onClick={() => handleAction(request.id, "rejected")}
                    >
                      <XCircle className="mr-1 h-4 w-4" /> Reject
                    </Button>
                    <Button
                      size="sm"
                      disabled={busyId === request.id}
                      onClick={() => handleAction(request.id, "active")}
                    >
                      <CheckCircle className="mr-1 h-4 w-4" /> Approve
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card className="glass-card">
        <div className="pb-3">
          <h3 className="flex items-center gap-2 text-sm font-heading">
            <Shield className="h-4 w-4" /> Review History
          </h3>
        </div>
        <div className="p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading review history...</div>
          ) : reviewed.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No reviewed requests yet.</div>
          ) : (
            <div className="divide-y divide-border">
              {reviewed.map((request) => {
                const config = statusConfig[request.status];
                return (
                  <div key={request.id} className="flex items-center justify-between gap-4 p-4">
                    <div className="min-w-0 flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                        {request.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{request.name}</p>
                        <p className="text-xs text-muted-foreground">{request.email} · {request.department || "—"}</p>
                        {request.reviewedAt && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Reviewed by {request.reviewedBy || "Admin"} on {new Date(request.reviewedAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className={cn("text-xs", config.className)}>
                      {config.label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default AuthorityApprovals;
