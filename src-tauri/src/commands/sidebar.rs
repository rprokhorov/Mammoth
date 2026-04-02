use tauri::State;
use crate::errors::AppError;
use crate::mattermost::types::{SidebarCategory, SidebarCategoryCreate, SidebarCategoryUpdate};
use crate::state::AppState;

fn get_client_user_id(
    state: &State<'_, AppState>,
    server_id: &str,
) -> Result<(crate::mattermost::client::MattermostClient, String), AppError> {
    let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
    let server = servers
        .get(server_id)
        .ok_or_else(|| AppError::NotFound(format!("Server {} not found", server_id)))?;
    let user_id = server
        .current_user
        .as_ref()
        .ok_or_else(|| AppError::Auth("Not logged in".into()))?
        .id
        .clone();
    Ok((server.client.clone(), user_id))
}

#[tauri::command]
pub async fn get_sidebar_categories(
    state: State<'_, AppState>,
    server_id: String,
    team_id: String,
) -> Result<Vec<SidebarCategory>, AppError> {
    let (client, user_id) = get_client_user_id(&state, &server_id)?;
    client.get_sidebar_categories(&user_id, &team_id).await
}

#[tauri::command]
pub async fn create_sidebar_category(
    state: State<'_, AppState>,
    server_id: String,
    team_id: String,
    display_name: String,
    channel_ids: Vec<String>,
) -> Result<SidebarCategory, AppError> {
    let (client, user_id) = get_client_user_id(&state, &server_id)?;
    let sort_order = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    let cat = SidebarCategoryCreate {
        team_id: team_id.clone(),
        user_id: user_id.clone(),
        display_name,
        channel_ids,
        sort_order,
    };
    client.create_sidebar_category(&user_id, &team_id, &cat).await
}

#[tauri::command]
pub async fn update_sidebar_category(
    state: State<'_, AppState>,
    server_id: String,
    team_id: String,
    category: SidebarCategoryUpdate,
) -> Result<SidebarCategory, AppError> {
    let (client, user_id) = get_client_user_id(&state, &server_id)?;
    let category_id = category.id.clone();
    client
        .update_sidebar_category(&user_id, &team_id, &category_id, &category)
        .await
}

#[tauri::command]
pub async fn delete_sidebar_category(
    state: State<'_, AppState>,
    server_id: String,
    team_id: String,
    category_id: String,
) -> Result<(), AppError> {
    let (client, user_id) = get_client_user_id(&state, &server_id)?;
    client
        .delete_sidebar_category(&user_id, &team_id, &category_id)
        .await
}
