import React from "react";

interface State {
  err: Error | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { err: null };

  static getDerivedStateFromError(err: Error): State {
    return { err };
  }

  componentDidCatch(err: Error, info: React.ErrorInfo) {
    console.error("UI error:", err, info);
  }

  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 32 }}>
          <h2>Something broke</h2>
          <pre style={{ background: "#222", padding: 12 }}>{this.state.err.message}</pre>
          <button onClick={() => location.reload()}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}
