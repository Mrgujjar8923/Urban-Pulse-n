import React, { useEffect, useState } from "react";
import { Image as ImageIcon, Loader2, Maximize2, AlertCircle, X } from "lucide-react";
import { complaintsApi } from "@/services/complaintsApi";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ComplaintEvidenceViewerProps {
  complaintId: string;
  imageKey?: string | null;
  entryId?: string;
  isResolution?: boolean;
}

export const ComplaintEvidenceViewer: React.FC<ComplaintEvidenceViewerProps> = ({
  complaintId,
  imageKey,
  entryId,
  isResolution = false,
}) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const hasEvidence = Boolean(
    imageKey &&
    imageKey !== "uploaded" &&
    imageKey.trim().length > 0
  );

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    if (!hasEvidence) {
      setBlobUrl(null);
      setLoadError(null);
      return;
    }

    const fetchEvidence = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const blob = isResolution
          ? await complaintsApi.getResolutionEvidenceBlob(complaintId, entryId)
          : await complaintsApi.getEvidenceBlob(complaintId);
        if (!active) return;
        createdUrl = URL.createObjectURL(blob);
        setBlobUrl(createdUrl);
      } catch (err: unknown) {
        if (!active) return;
        const msg = err instanceof Error ? err.message : "Unable to load evidence image";
        setLoadError(msg);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchEvidence();

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [complaintId, imageKey, entryId, isResolution, hasEvidence]);

  if (!hasEvidence) {
    return (
      <div className="rounded-xl border border-dashed border-border/80 bg-slate-50/50 p-4 text-center dark:bg-white/[0.02]">
        <ImageIcon className="mx-auto h-5 w-5 text-muted-foreground/50 mb-1" />
        <p className="text-xs text-muted-foreground">
          {isResolution ? "No photo evidence attached to this resolution." : "No photo evidence attached to this complaint."}
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-36 items-center justify-center rounded-xl border border-slate-200/80 bg-slate-50/60 dark:border-white/[0.06] dark:bg-white/[0.02]">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span>{isResolution ? "Loading resolution evidence..." : "Loading attached evidence..."}</span>
        </div>
      </div>
    );
  }

  if (loadError || !blobUrl) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-center">
        <AlertCircle className="mx-auto h-5 w-5 text-destructive/80 mb-1" />
        <p className="text-xs text-destructive font-medium">Evidence image unavailable</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{loadError || "File could not be found."}</p>
      </div>
    );
  }

  return (
    <>
      <div className="group relative overflow-hidden rounded-xl border border-slate-200/80 bg-slate-900/5 dark:border-white/[0.07] dark:bg-black/20">
        <div className="relative aspect-[16/9] max-h-64 w-full overflow-hidden sm:max-h-80">
          <img
            src={blobUrl}
            alt={isResolution ? "Resolution photo evidence" : "Complaint photo evidence"}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 backdrop-blur-[2px] transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 flex items-center justify-center">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setModalOpen(true)}
              className="gap-1.5 shadow-md"
            >
              <Maximize2 className="h-4 w-4" /> View Full Image
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-slate-200/80 px-4 py-2.5 text-xs text-muted-foreground dark:border-white/[0.06]">
          <span className="flex items-center gap-1.5">
            <ImageIcon className="h-3.5 w-3.5 text-primary" />
            {isResolution ? "Resolution proof attached" : "Photo evidence attached"}
          </span>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            aria-label={isResolution ? "Expand resolution photo evidence in dialog" : "Expand complaint photo evidence in dialog"}
            className="font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-1 -mx-1"
          >
            Expand
          </button>
        </div>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-4xl p-2 sm:p-4">
          <DialogHeader className="px-2 pt-2">
            <DialogTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-primary" />
              {isResolution ? "Resolution Evidence Photo" : "Complaint Evidence Photo"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {isResolution ? "Enlarged view of the resolution photo evidence." : "Enlarged view of the complaint photo evidence."}
            </DialogDescription>
          </DialogHeader>
          <div className="relative mt-2 max-h-[80vh] overflow-auto rounded-lg bg-black flex items-center justify-center">
            <img
              src={blobUrl}
              alt={isResolution ? "Resolution evidence full resolution" : "Complaint evidence full resolution"}
              className="max-h-[75vh] w-auto max-w-full object-contain"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

