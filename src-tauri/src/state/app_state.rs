use std::collections::HashMap;
use std::sync::Mutex;

use super::server_state::ServerState;

pub struct AppState {
    pub servers: Mutex<HashMap<String, ServerState>>,
    pub active_server_id: Mutex<Option<String>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            servers: Mutex::new(HashMap::new()),
            active_server_id: Mutex::new(None),
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
