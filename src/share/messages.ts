import type { DecodeError } from "@/lib/sharePayload";

/**
 * Shared so ShareErrorBoundary reuses the exact wording SharePage shows. A
 * render that throws on a fragment the decoder accepted is, from the
 * recipient's side, the same event as a corrupt link: the data is unusable and
 * there is nothing they can do to fix it.
 */
export const MESSAGES: Record<DecodeError, string> = {
  empty: "No split data in this link.",
  corrupt:
    "This link looks corrupted or incomplete — it may have been cut short when it was shared.",
  version: "This link was made by a newer version of ScanSplit.",
};
