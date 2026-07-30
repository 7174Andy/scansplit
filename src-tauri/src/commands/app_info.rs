/// True only when this process is a Linux AppImage.
///
/// Tauri's updater can replace an AppImage in place, but cannot update a
/// .deb or .rpm install. The frontend uses this to skip the update check
/// entirely on those installs rather than showing a misleading result.
fn appimage_detected() -> bool {
    cfg!(target_os = "linux") && std::env::var_os("APPIMAGE").is_some()
}

#[tauri::command]
pub fn is_appimage() -> bool {
    appimage_detected()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn appimage_detected_follows_env_var_and_platform() {
        std::env::remove_var("APPIMAGE");
        assert!(!appimage_detected(), "no APPIMAGE set -> false on every platform");

        std::env::set_var("APPIMAGE", "/tmp/ScanSplit.AppImage");
        if cfg!(target_os = "linux") {
            assert!(appimage_detected(), "APPIMAGE set on Linux -> true");
        } else {
            assert!(!appimage_detected(), "APPIMAGE set off Linux -> still false");
        }
        std::env::remove_var("APPIMAGE");
    }
}
