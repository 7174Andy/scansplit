import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ShareErrorBoundary } from "./ShareErrorBoundary";

function Boom(): JSX.Element {
  throw new Error("render exploded");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ShareErrorBoundary", () => {
  it("passes children through when nothing throws", () => {
    render(
      <ShareErrorBoundary>
        <p>the split</p>
      </ShareErrorBoundary>
    );
    expect(screen.getByText("the split")).toBeTruthy();
  });

  it("shows the corrupt-link message instead of a blank page when a render throws", () => {
    // React logs the caught error; silence it so the run stays readable.
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ShareErrorBoundary>
        <Boom />
      </ShareErrorBoundary>
    );
    expect(screen.getByText(/corrupted or incomplete/i)).toBeTruthy();
  });

  it("still offers the download link after a render throw", () => {
    // The whole point of reusing Shell: an error state is exactly when the
    // recipient most needs somewhere to go.
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ShareErrorBoundary>
        <Boom />
      </ShareErrorBoundary>
    );
    expect(screen.getByRole("link", { name: /scansplit/i })).toBeTruthy();
  });

  it("does not leak the thrown message onto the page", () => {
    // A throw can carry attacker-controlled text from the fragment, and the
    // recipient can do nothing with a stack trace anyway.
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ShareErrorBoundary>
        <Boom />
      </ShareErrorBoundary>
    );
    expect(screen.queryByText(/render exploded/)).toBeNull();
  });
});
