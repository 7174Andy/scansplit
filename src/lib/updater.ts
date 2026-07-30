import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { api } from "@/lib/tauri";

export interface UpdateInfo {
  version: string;
  install: () => Promise<void>;
}

/**
 * Returns the available update, or null if there is none, if the check
 * failed, or if this install cannot self-update.
 *
 * Failures are deliberately swallowed: being offline is the normal case and
 * must never surface as an error to the user.
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    // .deb and .rpm installs cannot be updated in place by Tauri. Checking
    // anyway would find an update we could never apply.
    if (navigator.userAgent.includes("Linux") && !(await api.isAppimage())) {
      return null;
    }

    const update = await check();
    if (!update) return null;

    return {
      version: update.version,
      install: async () => {
        await update.downloadAndInstall();
        await relaunch();
      },
    };
  } catch (e) {
    console.warn("update check failed", e);
    return null;
  }
}
