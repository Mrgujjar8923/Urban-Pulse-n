import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { complaintsApi, feedbackApi, ComplaintRecord } from "@/services/complaintsApi";
import { Card } from "@/components/ui/card";

const FeedbackForm: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [complaint, setComplaint] = useState<ComplaintRecord | null>(null);
  const [workCompleted, setWorkCompleted] = useState<boolean | null>(null);
  const [rating, setRating] = useState(0);
  const [percentDone, setPercentDone] = useState([50]);
  const [comments, setComments] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;

    const loadComplaint = async () => {
      try {
        const data = await complaintsApi.getById(id);
        setComplaint(data);
      } catch (_error) {
        setComplaint(null);
      } finally {
        setLoading(false);
      }
    };

    loadComplaint().catch(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading complaint...</p>;
  }

  const isEligible = Boolean(
    complaint &&
    complaint.status === "Resolved" &&
    (!complaint.feedback ||
      (Boolean(complaint.currentResolution?.id) &&
        complaint.feedback.resolutionId !== complaint.currentResolution?.id))
  );

  if (!complaint || !isEligible) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-heading font-bold text-foreground">Feedback not available</h2>
        <p className="text-muted-foreground text-sm mt-2">Feedback can only be submitted once per resolution cycle for resolved complaints.</p>
        <Link to="/citizen/complaints" className="text-primary hover:underline text-sm mt-4 block">Back to complaints</Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (workCompleted === null) {
      toast({ title: "Error", description: "Please indicate if work was completed", variant: "destructive" });
      return;
    }

    if (rating === 0) {
      toast({ title: "Error", description: "Please provide a quality rating", variant: "destructive" });
      return;
    }

    try {
      setSubmitting(true);
      await feedbackApi.submit({
        complaintId: complaint.id,
        rating,
        comment: comments,
        workCompleted,
        percentDone: percentDone[0],
      });
      toast({ title: "Feedback Submitted", description: "Thank you for your work evaluation feedback." });
      navigate(`/citizen/complaints/${complaint.id}`);
    } catch (err: unknown) {
      toast({ title: "Submission failed", description: err instanceof Error ? err.message : "Unable to submit feedback.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link to={`/citizen/complaints/${complaint.id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to complaint
      </Link>

      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Work Evaluation Feedback</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Complaint: {complaint.title} ({complaint.reference})</p>
      </div>

      <Card className="glass-card">
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label>Was the work completed?</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                {[true, false].map((value) => (
                  <button
                    key={String(value)}
                    type="button"
                    aria-pressed={workCompleted === value}
                    onClick={() => setWorkCompleted(value)}
                    className={cn(
                      "py-3 rounded-lg border text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                      workCompleted === value
                        ? value
                          ? "border-success bg-success/10 text-success"
                          : "border-destructive bg-destructive/10 text-destructive"
                        : "border-border text-muted-foreground hover:border-primary/40"
                    )}
                  >
                    {value ? "Yes" : "No"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label id="work-quality-rating-label">Work Quality Rating</Label>
              <div
                role="radiogroup"
                aria-labelledby="work-quality-rating-label"
                className="flex gap-1.5 mt-2"
              >
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    role="radio"
                    aria-checked={star === rating}
                    aria-label={`${star} of 5 stars`}
                    onClick={() => setRating(star)}
                    className="p-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  >
                    <Star className={cn("w-7 h-7 transition-colors", star <= rating ? "fill-warning text-warning" : "text-muted-foreground/30")} />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label id="percent-done-label">Percentage of Work Done: {percentDone[0]}%</Label>
              <Slider
                aria-label="Percentage of work completed"
                aria-labelledby="percent-done-label"
                value={percentDone}
                onValueChange={setPercentDone}
                max={100}
                step={5}
                className="mt-3"
              />
            </div>

            <div>
              <Label htmlFor="comments">Additional Comments</Label>
              <Textarea id="comments" value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Share your observations..." className="mt-1.5 min-h-[100px]" />
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Submitting..." : <><CheckCircle className="w-4 h-4 mr-2" /> Submit Feedback</>}
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
};

export default FeedbackForm;
