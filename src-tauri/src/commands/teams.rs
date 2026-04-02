use tauri::State;

use crate::errors::AppError;
use crate::mattermost::types::Team;
use crate::state::AppState;

#[tauri::command]
pub async fn get_teams(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Vec<Team>, AppError> {
    let (client, user_id) = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound(format!("Server {} not found", server_id)))?;
        let user_id = server
            .current_user
            .as_ref()
            .map(|u| u.id.clone())
            .ok_or_else(|| AppError::Auth("Not logged in".into()))?;
        (server.client.clone(), user_id)
    };

    client.get_teams_for_user(&user_id).await
}
