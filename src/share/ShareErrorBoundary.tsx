import React from "react";
import { Shell } from "./Shell";
import { MESSAGES } from "./messages";

/**
 * Local on purpose. src/components/ErrorBoundary.tsx belongs to the desktop
 * tree and shows a raw stack trace over a `location.reload()` button, which is
 * useless to a link recipient — a reload replays the same bad fragment. This
 * imports nothing outside src/share/, keeping the share bundle free of Tauri.
 *
 * decodeSharePayload catches everything it can reach, but a render can still
 * throw on a value it accepted (a currency code Intl rejects was one such bug).
 * Without a boundary React unmounts the whole root and the recipient sees a
 * blank white page instead of the shell and its download link. The plan's
 * "no ErrorBoundary" note was about avoiding App.tsx's Tauri-coupled tree, not
 * about leaving render throws unhandled.
 */
interface State {
  failed: boolean;
}

export class ShareErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(err: Error, info: React.ErrorInfo) {
    // Goes to the console, not the page: the recipient can do nothing with it,
    // and the message could echo attacker-controlled text from the fragment.
    console.error("Share page failed to render:", err, info);
  }

  render() {
    if (this.state.failed) {
      return (
        <Shell>
          <h1 className="text-xl font-semibold">Can&apos;t show this split</h1>
          <p className="mt-2 text-muted-foreground">{MESSAGES.corrupt}</p>
        </Shell>
      );
    }
    return this.props.children;
  }
}
