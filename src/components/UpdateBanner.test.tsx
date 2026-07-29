import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { UpdateBanner } from "./UpdateBanner";

const checkMock = vi.fn();

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: () => checkMock(),
}));
vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(),
}));
vi.mock("@/lib/tauri", () => ({
  api: { isAppimage: vi.fn().mockResolvedValue(false) },
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <UpdateBanner />
    </MemoryRouter>
  );
}

describe("UpdateBanner", () => {
  beforeEach(() => {
    checkMock.mockReset();
  });

  it("renders nothing when no update is available", async () => {
    checkMock.mockResolvedValue(null);
    renderAt("/");
    expect(await screen.findByTestId("update-banner-absent")).toBeTruthy();
  });

  it("announces an available update on a non-wizard route", async () => {
    checkMock.mockResolvedValue({ version: "0.2.0", downloadAndInstall: vi.fn() });
    renderAt("/");
    expect(await screen.findByText(/0\.2\.0/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /restart/i })).toBeTruthy();
  });

  it("does not offer to restart while the wizard is open", async () => {
    checkMock.mockResolvedValue({ version: "0.2.0", downloadAndInstall: vi.fn() });
    renderAt("/transaction/new");
    expect(await screen.findByText(/0\.2\.0/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /restart/i })).toBeNull();
  });

  it("stays silent when the update check throws", async () => {
    checkMock.mockRejectedValue(new Error("offline"));
    renderAt("/");
    expect(await screen.findByTestId("update-banner-absent")).toBeTruthy();
  });
});
