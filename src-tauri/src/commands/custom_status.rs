use tauri::State;
use crate::errors::AppError;
use crate::state::AppState;

fn get_client_and_user(
    state: &State<'_, AppState>,
    server_id: &str,
) -> Result<(crate::mattermost::client::MattermostClient, String), AppError> {
    let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
    let server = servers
        .get(server_id)
        .ok_or_else(|| AppError::NotFound(format!("Server {} not found", server_id)))?;
    let uid = server
        .current_user
        .as_ref()
        .map(|u| u.id.clone())
        .ok_or_else(|| AppError::Auth("No current user".into()))?;
    Ok((server.client.clone(), uid))
}

#[tauri::command]
pub async fn set_custom_status(
    state: State<'_, AppState>,
    server_id: String,
    emoji: String,
    text: String,
    expires_at: Option<String>,
) -> Result<(), AppError> {
    let (client, user_id) = get_client_and_user(&state, &server_id)?;
    client
        .update_custom_status(&user_id, &emoji, &text, expires_at.as_deref())
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn clear_custom_status(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<(), AppError> {
    let (client, user_id) = get_client_and_user(&state, &server_id)?;
    client.clear_custom_status(&user_id).await?;
    Ok(())
}

#[tauri::command]
pub async fn get_channel_notify_props(
    state: State<'_, AppState>,
    server_id: String,
    channel_id: String,
) -> Result<serde_json::Value, AppError> {
    let (client, user_id) = get_client_and_user(&state, &server_id)?;
    let props = client.get_channel_notify_props(&channel_id, &user_id).await?;
    Ok(props)
}

#[tauri::command]
pub async fn update_channel_notify_props(
    state: State<'_, AppState>,
    server_id: String,
    channel_id: String,
    notify_props: serde_json::Value,
) -> Result<(), AppError> {
    let (client, user_id) = get_client_and_user(&state, &server_id)?;
    client
        .update_channel_notify_props(&channel_id, &user_id, notify_props)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn get_favorite_channels(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Vec<String>, AppError> {
    let (client, user_id) = get_client_and_user(&state, &server_id)?;
    let prefs = client.get_preferences(&user_id, "favorite_channel").await?;
    let favorites: Vec<String> = prefs
        .iter()
        .filter_map(|p| {
            let val = p.get("value")?.as_str()?;
            if val == "true" {
                p.get("name")?.as_str().map(String::from)
            } else {
                None
            }
        })
        .collect();
    Ok(favorites)
}

#[tauri::command]
pub async fn toggle_favorite_channel(
    state: State<'_, AppState>,
    server_id: String,
    channel_id: String,
    favorite: bool,
) -> Result<(), AppError> {
    let (client, user_id) = get_client_and_user(&state, &server_id)?;
    let pref = serde_json::json!({
        "user_id": user_id,
        "category": "favorite_channel",
        "name": channel_id,
        "value": if favorite { "true" } else { "false" },
    });

    if favorite {
        client.save_preferences(&user_id, &[pref]).await?;
    } else {
        client.delete_preferences(&user_id, &[pref]).await?;
    }
    Ok(())
}
