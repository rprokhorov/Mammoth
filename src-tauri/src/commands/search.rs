use tauri::State;

use crate::errors::AppError;
use crate::mattermost::types::PostList;
use crate::state::AppState;

#[tauri::command]
pub async fn search_posts(
    state: State<'_, AppState>,
    server_id: String,
    team_id: String,
    terms: String,
) -> Result<PostList, AppError> {
    let client = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound(format!("Server {} not found", server_id)))?;
        server.client.clone()
    };

    client.search_posts(&team_id, &terms).await
}
