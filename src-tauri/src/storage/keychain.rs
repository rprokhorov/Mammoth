//! OS keychain storage for server auth tokens (macOS Keychain, Windows
//! Credential Manager, Linux Secret Service). Tokens were previously kept in
//! plaintext inside servers.json; callers fall back to the config file when
//! the keychain is unavailable (e.g. headless Linux without a secret service).

use keyring::Entry;

const SERVICE: &str = "com.mattermost.desktop";

fn entry(server_id: &str) -> Option<Entry> {
    Entry::new(SERVICE, server_id).ok()
}

pub fn get_token(server_id: &str) -> Option<String> {
    entry(server_id)?.get_password().ok()
}

/// Returns true if the token was stored in the keychain.
pub fn set_token(server_id: &str, token: &str) -> bool {
    match entry(server_id) {
        Some(e) => match e.set_password(token) {
            Ok(()) => true,
            Err(err) => {
                log::warn!("keychain: failed to store token for {server_id}: {err}");
                false
            }
        },
        None => false,
    }
}

pub fn delete_token(server_id: &str) {
    if let Some(e) = entry(server_id) {
        let _ = e.delete_credential();
    }
}
