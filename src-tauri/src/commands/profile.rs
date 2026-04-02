use tauri::State;

use crate::errors::AppError;
use crate::state::AppState;

#[tauri::command]
pub async fn get_user_profile(
    state: State<'_, AppState>,
    server_id: String,
    user_id: String,
) -> Result<serde_json::Value, AppError> {
    let (client, token) = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound("Server not found".into()))?;
        let token = server.client.token().unwrap_or_default().to_string();
        (server.client.clone(), token)
    };

    let user = client.get_user(&user_id).await?;
    let avatar_url = format!("{}?_t={}", client.profile_image_url(&user_id), token);

    Ok(serde_json::json!({
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "nickname": user.nickname,
        "position": user.position,
        "roles": user.roles,
        "locale": user.locale,
        "avatar_url": avatar_url,
    }))
}

#[tauri::command]
pub async fn update_profile(
    state: State<'_, AppState>,
    server_id: String,
    first_name: Option<String>,
    last_name: Option<String>,
    nickname: Option<String>,
    position: Option<String>,
) -> Result<serde_json::Value, AppError> {
    let (client, current_user_id) = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound("Server not found".into()))?;
        let uid = server
            .current_user
            .as_ref()
            .map(|u| u.id.clone())
            .ok_or_else(|| AppError::Auth("No current user".into()))?;
        (server.client.clone(), uid)
    };

    let mut patch = serde_json::Map::new();
    if let Some(v) = first_name {
        patch.insert("first_name".into(), serde_json::json!(v));
    }
    if let Some(v) = last_name {
        patch.insert("last_name".into(), serde_json::json!(v));
    }
    if let Some(v) = nickname {
        patch.insert("nickname".into(), serde_json::json!(v));
    }
    if let Some(v) = position {
        patch.insert("position".into(), serde_json::json!(v));
    }

    let user = client
        .update_user(&current_user_id, serde_json::Value::Object(patch))
        .await?;

    Ok(serde_json::json!({
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "nickname": user.nickname,
        "position": user.position,
    }))
}

#[tauri::command]
pub async fn upload_avatar(
    state: State<'_, AppState>,
    server_id: String,
    file_path: String,
) -> Result<(), AppError> {
    let (client, current_user_id) = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound("Server not found".into()))?;
        let uid = server
            .current_user
            .as_ref()
            .map(|u| u.id.clone())
            .ok_or_else(|| AppError::Auth("No current user".into()))?;
        (server.client.clone(), uid)
    };

    client.upload_profile_image(&current_user_id, &file_path).await
}

#[tauri::command]
pub async fn get_profile_image_url(
    state: State<'_, AppState>,
    server_id: String,
    user_id: String,
) -> Result<String, AppError> {
    let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
    let server = servers
        .get(&server_id)
        .ok_or_else(|| AppError::NotFound("Server not found".into()))?;
    let token = server.client.token().unwrap_or_default().to_string();

    Ok(format!("{}?_t={}", server.client.profile_image_url(&user_id), token))
}

#[tauri::command]
pub async fn set_user_status(
    state: State<'_, AppState>,
    server_id: String,
    status: String,
) -> Result<serde_json::Value, AppError> {
    let (client, current_user_id) = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound("Server not found".into()))?;
        let uid = server
            .current_user
            .as_ref()
            .map(|u| u.id.clone())
            .ok_or_else(|| AppError::Auth("No current user".into()))?;
        (server.client.clone(), uid)
    };

    let result = client.update_user_status(&current_user_id, &status).await?;

    Ok(serde_json::json!({
        "user_id": result.user_id,
        "status": result.status,
    }))
}
