use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub id: String,
    pub display_name: String,
    pub url: String,
    #[serde(default)]
    pub token: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(default)]
    pub servers: Vec<ServerConfig>,
    #[serde(default)]
    pub active_server_id: Option<String>,
}
