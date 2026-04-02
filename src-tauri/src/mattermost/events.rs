use serde::{Deserialize, Serialize};

/// Raw WebSocket event from Mattermost
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsEvent {
    pub event: String,
    #[serde(default)]
    pub data: serde_json::Value,
    #[serde(default)]
    pub broadcast: WsBroadcast,
    #[serde(default)]
    pub seq: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WsBroadcast {
    #[serde(default)]
    pub channel_id: String,
    #[serde(default)]
    pub team_id: String,
    #[serde(default)]
    pub user_id: String,
    #[serde(default)]
    pub omit_users: Option<serde_json::Value>,
}

/// Authentication challenge sent by Mattermost WS
#[derive(Debug, Serialize)]
pub struct WsAuthChallenge {
    pub seq: i64,
    pub action: String,
    pub data: WsAuthData,
}

#[derive(Debug, Serialize)]
pub struct WsAuthData {
    pub token: String,
}

/// Response from Mattermost WS after auth
#[derive(Debug, Deserialize)]
pub struct WsResponse {
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub seq_reply: i64,
    #[serde(default)]
    pub error: Option<serde_json::Value>,
}

/// Event forwarded to the frontend via Tauri events
#[derive(Debug, Clone, Serialize)]
pub struct FrontendWsEvent {
    pub server_id: String,
    pub event: String,
    pub data: serde_json::Value,
    pub broadcast: WsBroadcast,
}
