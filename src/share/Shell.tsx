const DOWNLOAD_URL = "https://7174andy.github.io/scansplit/";

/**
 * The page frame. Extracted from SharePage so ShareErrorBoundary can render the
 * same chrome — the download link especially, since a recipient who hits an
 * error still needs somewhere to go.
 */
export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {children}
      <footer className="mt-10 border-t pt-4 text-sm text-muted-foreground">
        Split with{" "}
        <a className="underline" href={DOWNLOAD_URL}>
          ScanSplit
        </a>
        .
      </footer>
    </div>
  );
}
