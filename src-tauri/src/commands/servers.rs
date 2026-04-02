use serde::Serialize;
use tauri::{Manager, State};

use crate::errors::AppError;
use crate::mattermost::client::MattermostClient;
use crate::state::AppState;
use crate::state::server_state::ServerState;
use crate::storage::config::{AppConfig, ServerConfig};

#[derive(Debug, Clone, Serialize)]
pub struct ServerInfo {
    pub id: String,
    pub display_name: String,
    pub url: String,
    pub connected: bool,
    pub username: Option<String>,
}

#[tauri::command]
pub async fn add_server(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    url: String,
    display_name: String,
) -> Result<ServerInfo, AppError> {
    let client = MattermostClient::new(&url)?;

    // Verify server is reachable
    if !client.ping().await? {
        return Err(AppError::Config("Server is not reachable".into()));
    }

    let id = uuid::Uuid::new_v4().to_string();

    let server_state = ServerState {
        client,
        current_user: None,
        display_name: display_name.clone(),
        ws_manager: None,
    };

    {
        let mut servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        servers.insert(id.clone(), server_state);
    }

    // Save to config
    save_server_config(&app_handle, &id, &display_name, &url, None)?;

    Ok(ServerInfo {
        id,
        display_name,
        url,
        connected: false,
        username: None,
    })
}

#[tauri::command]
pub async fn remove_server(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    server_id: String,
) -> Result<(), AppError> {
    {
        let mut servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        servers.remove(&server_id);
    }

    {
        let mut active = state.active_server_id.lock().map_err(|e| AppError::Config(e.to_string()))?;
        if active.as_deref() == Some(&server_id) {
            *active = None;
        }
    }

    remove_server_config(&app_handle, &server_id)?;

    Ok(())
}

#[tauri::command]
pub async fn list_servers(
    state: State<'_, AppState>,
) -> Result<Vec<ServerInfo>, AppError> {
    let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;

    let list = servers
        .iter()
        .map(|(id, s)| ServerInfo {
            id: id.clone(),
            display_name: s.display_name.clone(),
            url: s.client.base_url().to_string(),
            connected: s.current_user.is_some(),
            username: s.current_user.as_ref().map(|u| u.username.clone()),
        })
        .collect();

    Ok(list)
}

#[tauri::command]
pub async fn set_active_server(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    server_id: String,
) -> Result<(), AppError> {
    let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
    if !servers.contains_key(&server_id) {
        return Err(AppError::NotFound(format!("Server {} not found", server_id)));
    }
    drop(servers);

    let mut active = state.active_server_id.lock().map_err(|e| AppError::Config(e.to_string()))?;
    *active = Some(server_id.clone());
    drop(active);

    let _ = save_active_server(&app_handle, Some(&server_id));
    Ok(())
}

#[tauri::command]
pub async fn get_active_server(
    state: State<'_, AppState>,
) -> Result<Option<String>, AppError> {
    let active = state.active_server_id.lock().map_err(|e| AppError::Config(e.to_string()))?;
    Ok(active.clone())
}

// --- Config persistence helpers ---

fn config_path(app_handle: &tauri::AppHandle) -> Result<std::path::PathBuf, AppError> {
    let config_dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|_| AppError::Config("Cannot resolve app config dir".into()))?;
    std::fs::create_dir_all(&config_dir)?;
    Ok(config_dir.join("servers.json"))
}

fn load_config(app_handle: &tauri::AppHandle) -> Result<AppConfig, AppError> {
    let path = config_path(app_handle)?;
    if !path.exists() {
        return Ok(AppConfig::default());
    }
    let data = std::fs::read_to_string(&path)?;
    let config: AppConfig = serde_json::from_str(&data)?;
    Ok(config)
}

fn save_config(app_handle: &tauri::AppHandle, config: &AppConfig) -> Result<(), AppError> {
    let path = config_path(app_handle)?;
    let data = serde_json::to_string_pretty(config)?;
    std::fs::write(&path, data)?;
    Ok(())
}

fn save_server_config(
    app_handle: &tauri::AppHandle,
    id: &str,
    display_name: &str,
    url: &str,
    token: Option<String>,
) -> Result<(), AppError> {
    let mut config = load_config(app_handle)?;
    config.servers.retain(|s| s.id != id);
    config.servers.push(ServerConfig {
        id: id.to_string(),
        display_name: display_name.to_string(),
        url: url.to_string(),
        token,
    });
    save_config(app_handle, &config)
}

fn remove_server_config(app_handle: &tauri::AppHandle, id: &str) -> Result<(), AppError> {
    let mut config = load_config(app_handle)?;
    config.servers.retain(|s| s.id != id);
    save_config(app_handle, &config)
}

pub fn update_server_token(
    app_handle: &tauri::AppHandle,
    id: &str,
    token: Option<String>,
) -> Result<(), AppError> {
    let mut config = load_config(app_handle)?;
    if let Some(server) = config.servers.iter_mut().find(|s| s.id == id) {
        server.token = token;
    }
    save_config(app_handle, &config)
}

pub fn save_active_server(
    app_handle: &tauri::AppHandle,
    server_id: Option<&str>,
) -> Result<(), AppError> {
    let mut config = load_config(app_handle)?;
    config.active_server_id = server_id.map(|s| s.to_string());
    save_config(app_handle, &config)
}

/// Load saved servers into AppState on startup
pub fn restore_servers(app_handle: &tauri::AppHandle, state: &AppState) -> Result<(), AppError> {
    let config = load_config(app_handle)?;

    let mut servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;

    for server_config in &config.servers {
        let mut client = MattermostClient::new(&server_config.url)?;
        if let Some(token) = &server_config.token {
            client.set_token(token.clone());
        }

        servers.insert(
            server_config.id.clone(),
            ServerState {
                client,
                current_user: None,
                display_name: server_config.display_name.clone(),
                ws_manager: None,
            },
        );
    }

    if let Some(active_id) = &config.active_server_id {
        let mut active = state.active_server_id.lock().map_err(|e| AppError::Config(e.to_string()))?;
        *active = Some(active_id.clone());
    }

    Ok(())
}
