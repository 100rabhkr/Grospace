"use client";

import { useState } from "react";
import { Flag, Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { submitFeedback } from "@/lib/api";

interface FeedbackButtonProps {
  agreementId: string;
  fieldName: string;
  originalValue: string;
  orgId?: string;
}

export function FeedbackButton({
  agreementId,
  fieldName,
  originalValue,
  orgId,
}: FeedbackButtonProps) {
  const [open, setOpen] = useState(false);
  const [correctedValue, setCorrectedValue] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!correctedValue.trim() && !comment.trim()) return;
    setSubmitting(true);
    setError(null);

    try {
      await submitFeedback({
        agreement_id: agreementId,
        field_name: fieldName,
        original_value: originalValue,
        corrected_value: correctedValue || undefined,
        comment: comment || undefined,
        org_id: orgId,
      });
      setSubmitted(true);
      setTimeout(() => {
        setOpen(false);
        // Reset after close animation
        setTimeout(() => {
          setSubmitted(false);
          setCorrectedValue("");
          setComment("");
        }, 300);
      }, 1500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to submit feedback"
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      // Reset on close
      setTimeout(() => {
        setError(null);
        if (!submitted) {
          setCorrectedValue("");
          setComment("");
        }
      }, 300);
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center h-5 w-5 rounded hover:bg-neutral-100 text-neutral-400 hover:text-amber-600 transition-colors flex-shrink-0"
          title="Flag extraction error"
        >
          <Flag className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        {submitted ? (
          <div className="flex flex-col items-center gap-2 py-4">
            <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <Check className="h-5 w-5 text-emerald-600" />
            </div>
            <p className="text-sm font-medium text-emerald-700">
              Feedback submitted
            </p>
            <p className="text-xs text-neutral-500">
              Thank you for helping improve extraction accuracy.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Flag Extraction Error</h4>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-5 w-5 rounded hover:bg-neutral-100 flex items-center justify-center text-neutral-400"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-neutral-500">Field</Label>
              <p className="text-xs font-medium">
                {fieldName
                  .replace(/_/g, " ")
                  .replace(/\b\w/g, (c) => c.toUpperCase())}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-neutral-500">
                Original Value
              </Label>
              <Input
                value={originalValue || "(empty)"}
                readOnly
                className="text-xs bg-neutral-50 h-8"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="corrected-value" className="text-xs">
                Corrected Value
              </Label>
              <Input
                id="corrected-value"
                value={correctedValue}
                onChange={(e) => setCorrectedValue(e.target.value)}
                placeholder="Enter the correct value..."
                className="text-xs h-8"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="feedback-comment" className="text-xs">
                Comment (optional)
              </Label>
              <textarea
                id="feedback-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Additional context..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[60px] resize-none"
              />
            </div>

            {error && (
              <p className="text-xs text-red-600">{error}</p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={handleSubmit}
                disabled={
                  submitting ||
                  (!correctedValue.trim() && !comment.trim())
                }
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Flag className="h-3 w-3" />
                    Submit Feedback
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
