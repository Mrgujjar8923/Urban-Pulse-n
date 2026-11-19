import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/services/apiClient";

export const getApiErrorPresentation = (error: unknown) => {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return { title: "Authentication required", message: "Your session is no longer valid. Sign in again to continue." };
    }
    if (error.status === 403) {
      if (/member|linked/i.test(error.message)) {
        return {
          title: "Officer Profile Not Linked",
          message: "Your account is authenticated, but no verified Officer Member profile is linked to this account. Please contact your Department Authority or administrator.",
        };
      }
      return { title: "Access denied", message: error.message || "This account is not allowed to view this information." };
    }
    if (error.status >= 500) {
      return { title: "Service error", message: "The server could not load this information. Please try again." };
    }
    if (error.status === 0) {
      return { title: "Connection problem", message: "Could not reach the server. Check your connection and try again." };
    }
    return { title: "Request failed", message: error.message || "The request could not be completed." };
  }
  return {
    title: "Unable to load information",
    message: error instanceof Error ? error.message : "An unexpected error occurred. Please try again.",
  };
};

export const ApiErrorPanel: React.FC<{ error: unknown; onRetry?: () => void }> = ({ error, onRetry }) => {
  const presentation = getApiErrorPresentation(error);
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div>
          <p className="font-semibold text-foreground">{presentation.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{presentation.message}</p>
        </div>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="shrink-0">
          <RefreshCw className="mr-2 h-4 w-4" /> Try again
        </Button>
      )}
    </div>
  );
};
