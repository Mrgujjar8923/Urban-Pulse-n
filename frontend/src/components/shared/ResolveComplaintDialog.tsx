import React, { useState, useRef, useEffect } from "react";
import { CheckCircle2, Upload, X, Loader2, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { complaintsApi, ComplaintRecord } from "@/services/complaintsApi";
import { useToast } from "@/hooks/use-toast";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_REMARKS_LENGTH = 2000;

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

interface ResolveComplaintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  complaintId: string;
  complaintReference: string;
  complaintTitle: string;
  onSuccess: (updatedComplaint: ComplaintRecord) => void;
}

export const ResolveComplaintDialog: React.FC<ResolveComplaintDialogProps> = ({
  open,
  onOpenChange,
  complaintId,
  complaintReference,
  complaintTitle,
  onSuccess,
}) => {
  const { toast } = useToast();
  const [remarks, setRemarks] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [remarksError, setRemarksError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Clean up object URLs when unmounting or replacing
  useEffect(() => {
    return () => {
      if (filePreview) {
        URL.revokeObjectURL(filePreview);
      }
    };
  }, [filePreview]);

  // Reset form when dialog closes/opens
  useEffect(() => {
    if (open) {
      setRemarks("");
      setSelectedFile(null);
      setFilePreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setFileError(null);
      setRemarksError(null);
    }
  }, [open]);

  const handleValidateAndSetFile = (file: File) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setFileError("Invalid file type. Only JPEG, PNG, and WebP images are allowed.");
      return false;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setFileError("File size exceeds 5MB limit. Please select a smaller photo.");
      return false;
    }

    if (filePreview) {
      URL.revokeObjectURL(filePreview);
    }

    setSelectedFile(file);
    setFilePreview(URL.createObjectURL(file));
    setFileError(null);
    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleValidateAndSetFile(file);
    }
  };

  const handleRemoveFile = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (filePreview) {
      URL.revokeObjectURL(filePreview);
    }
    setSelectedFile(null);
    setFilePreview(null);
    setFileError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedRemarks = remarks.trim();

    if (!trimmedRemarks) {
      setRemarksError("Resolution remarks are required.");
      return;
    }

    if (trimmedRemarks.length > MAX_REMARKS_LENGTH) {
      setRemarksError(`Resolution remarks cannot exceed ${MAX_REMARKS_LENGTH} characters.`);
      return;
    }

    try {
      setSubmitting(true);
      setRemarksError(null);

      const updated = await complaintsApi.updateStatus(
        complaintId,
        "Resolved",
        trimmedRemarks,
        selectedFile
      );

      toast({
        title: "Complaint Resolved",
        description: `Complaint ${complaintReference} marked as Resolved.`,
      });

      onSuccess(updated);
      onOpenChange(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to resolve complaint.";
      toast({
        title: "Resolution Failed",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !submitting && onOpenChange(val)}>
      <DialogContent className="max-w-xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Resolve Complaint
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            <span className="font-semibold text-foreground">{complaintReference}</span>: {complaintTitle}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Resolution Remarks */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="resolution-remarks" className="text-xs font-semibold text-foreground">
                Resolution Remarks <span className="text-destructive">*</span>
              </Label>
              <span
                className={`text-[11px] ${
                  remarks.length > MAX_REMARKS_LENGTH
                    ? "text-destructive font-bold"
                    : "text-muted-foreground"
                }`}
              >
                {remarks.length} / {MAX_REMARKS_LENGTH}
              </span>
            </div>
            <Textarea
              id="resolution-remarks"
              value={remarks}
              onChange={(e) => {
                setRemarks(e.target.value);
                if (remarksError) setRemarksError(null);
              }}
              placeholder="Detail the corrective actions taken, materials used, or verification performed..."
              className="min-h-[110px] text-sm resize-y"
              disabled={submitting}
              maxLength={MAX_REMARKS_LENGTH + 10}
            />
            {remarksError && (
              <p className="text-xs text-destructive font-medium">{remarksError}</p>
            )}
          </div>

          {/* Optional Resolution Evidence Upload */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="resolution-evidence-file" className="text-xs font-semibold text-foreground">
                Work Resolution Proof (Optional)
              </Label>
              {selectedFile && (
                <span className="text-[11px] text-muted-foreground">
                  {formatFileSize(selectedFile.size)}
                </span>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              id="resolution-evidence-file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              className="hidden"
              disabled={submitting}
            />

            {filePreview ? (
              <div className="relative rounded-lg border border-border bg-card p-3 overflow-hidden">
                <div className="flex items-center gap-3">
                  <div className="relative w-20 h-20 rounded-md overflow-hidden bg-muted border border-border/60 shrink-0">
                    <img
                      src={filePreview}
                      alt="Resolution evidence preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">
                      {selectedFile?.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {selectedFile ? formatFileSize(selectedFile.size) : ""} • Ready to attach
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={submitting}
                        className="h-7 text-xs px-2"
                      >
                        Change Photo
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleRemoveFile}
                        disabled={submitting}
                        className="h-7 text-xs px-2 text-destructive hover:text-destructive"
                      >
                        <X className="w-3 h-3 mr-1" /> Remove
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                aria-label="Attach resolution photo proof"
                onClick={() => !submitting && fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (!submitting) fileInputRef.current?.click();
                  }
                }}
                className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <Upload className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
                <p className="text-xs font-medium text-foreground">
                  Click to attach photo proof of completed work
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  JPG, PNG, WebP up to 5MB
                </p>
              </div>
            )}

            {fileError && (
              <p className="text-xs text-destructive font-medium">{fileError}</p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/60">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  Saving Resolution...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                  Confirm & Mark Resolved
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
