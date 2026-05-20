use crate::error::{AppError, AppResult};
use keyring::Entry;

const SERVICE: &str = "ScanSplit";
const ACCOUNT: &str = "anthropic_api_key";

fn entry() -> AppResult<Entry> {
    Ok(Entry::new(SERVICE, ACCOUNT)?)
}

pub fn read_api_key() -> AppResult<Option<String>> {
    let e = entry()?;
    match e.get_password() {
        Ok(s) => Ok(Some(s)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(AppError::Keyring(err)),
    }
}

#[tauri::command]
pub async fn get_api_key() -> AppResult<Option<String>> {
    read_api_key()
}

#[tauri::command]
pub async fn set_api_key(key: String) -> AppResult<()> {
    let e = entry()?;
    e.set_password(&key)?;
    Ok(())
}

#[tauri::command]
pub async fn delete_api_key() -> AppResult<()> {
    let e = entry()?;
    match e.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(AppError::Keyring(err)),
    }
}
