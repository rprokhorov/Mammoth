use tauri::State;

use crate::errors::AppError;
use crate::mattermost::types::{Reaction, Post};
use crate::state::AppState;

#[tauri::command]
pub async fn add_reaction(
    state: State<'_, AppState>,
    server_id: String,
    post_id: String,
    emoji_name: String,
) -> Result<(), AppError> {
    let (client, user_id) = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound("Server not found".into()))?;
        let uid = server
            .current_user
            .as_ref()
            .map(|u| u.id.clone())
            .ok_or_else(|| AppError::Auth("Not logged in".into()))?;
        (server.client.clone(), uid)
    };

    client.add_reaction(&user_id, &post_id, &emoji_name).await
}

#[tauri::command]
pub async fn remove_reaction(
    state: State<'_, AppState>,
    server_id: String,
    post_id: String,
    emoji_name: String,
) -> Result<(), AppError> {
    let (client, user_id) = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound("Server not found".into()))?;
        let uid = server
            .current_user
            .as_ref()
            .map(|u| u.id.clone())
            .ok_or_else(|| AppError::Auth("Not logged in".into()))?;
        (server.client.clone(), uid)
    };

    client.remove_reaction(&user_id, &post_id, &emoji_name).await
}

#[tauri::command]
pub async fn get_reactions(
    state: State<'_, AppState>,
    server_id: String,
    post_id: String,
) -> Result<Vec<Reaction>, AppError> {
    let client = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound("Server not found".into()))?;
        server.client.clone()
    };

    client.get_reactions(&post_id).await
}

#[tauri::command]
pub async fn pin_post(
    state: State<'_, AppState>,
    server_id: String,
    post_id: String,
) -> Result<(), AppError> {
    let client = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound("Server not found".into()))?;
        server.client.clone()
    };

    client.pin_post(&post_id).await
}

#[tauri::command]
pub async fn unpin_post(
    state: State<'_, AppState>,
    server_id: String,
    post_id: String,
) -> Result<(), AppError> {
    let client = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound("Server not found".into()))?;
        server.client.clone()
    };

    client.unpin_post(&post_id).await
}

#[tauri::command]
pub async fn save_post(
    state: State<'_, AppState>,
    server_id: String,
    post_id: String,
) -> Result<(), AppError> {
    let (client, user_id) = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound("Server not found".into()))?;
        let uid = server
            .current_user
            .as_ref()
            .map(|u| u.id.clone())
            .ok_or_else(|| AppError::Auth("Not logged in".into()))?;
        (server.client.clone(), uid)
    };

    client.save_post(&user_id, &post_id).await
}

#[tauri::command]
pub async fn unsave_post(
    state: State<'_, AppState>,
    server_id: String,
    post_id: String,
) -> Result<(), AppError> {
    let (client, user_id) = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound("Server not found".into()))?;
        let uid = server
            .current_user
            .as_ref()
            .map(|u| u.id.clone())
            .ok_or_else(|| AppError::Auth("Not logged in".into()))?;
        (server.client.clone(), uid)
    };

    client.unsave_post(&user_id, &post_id).await
}

#[tauri::command]
pub async fn get_saved_posts(
    state: State<'_, AppState>,
    server_id: String,
    team_id: String,
    page: u32,
    per_page: u32,
) -> Result<serde_json::Value, AppError> {
    let (client, user_id) = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound("Server not found".into()))?;
        let uid = server
            .current_user
            .as_ref()
            .map(|u| u.id.clone())
            .ok_or_else(|| AppError::Auth("Not logged in".into()))?;
        (server.client.clone(), uid)
    };

    let posts = client.get_flagged_posts(&user_id, &team_id, page, per_page).await?;
    Ok(serde_json::to_value(posts).unwrap_or_default())
}

#[tauri::command]
pub async fn get_pinned_posts(
    state: State<'_, AppState>,
    server_id: String,
    channel_id: String,
) -> Result<serde_json::Value, AppError> {
    let client = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound("Server not found".into()))?;
        server.client.clone()
    };

    let posts = client.get_pinned_posts(&channel_id).await?;
    Ok(serde_json::to_value(posts).unwrap_or_default())
}

/// A single reaction notification: someone reacted to my post.
#[derive(serde::Serialize)]
pub struct ReactionOnMyPost {
    pub post_id: String,
    pub post_message: String,
    pub channel_id: String,
    pub reactor_user_id: String,
    pub emoji_name: String,
    pub create_at: i64,
}

/// Searches for recent posts by the current user and returns reactions by others on those posts.
#[tauri::command]
pub async fn get_reactions_on_my_posts(
    state: State<'_, AppState>,
    server_id: String,
    team_id: String,
) -> Result<Vec<ReactionOnMyPost>, AppError> {
    let (client, user_id, username) = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound("Server not found".into()))?;
        let user = server
            .current_user
            .as_ref()
            .ok_or_else(|| AppError::Auth("Not logged in".into()))?;
        (server.client.clone(), user.id.clone(), user.username.clone())
    };

    // Search for posts by current user (recent, up to 60 posts)
    let post_list = client.search_posts(&team_id, &format!("from:{}", username)).await?;

    let mut results: Vec<ReactionOnMyPost> = Vec::new();

    // For posts that already have metadata.reactions populated, use them directly
    // For others, fetch reactions individually
    let posts: Vec<&Post> = post_list.order.iter()
        .filter_map(|id| post_list.posts.get(id))
        .filter(|p| p.user_id == user_id)
        .collect();

    for post in &posts {
        if let Some(ref meta) = post.metadata {
            if let Some(ref reactions) = meta.reactions {
                for r in reactions {
                    if r.user_id != user_id {
                        results.push(ReactionOnMyPost {
                            post_id: post.id.clone(),
                            post_message: post.message.clone(),
                            channel_id: post.channel_id.clone(),
                            reactor_user_id: r.user_id.clone(),
                            emoji_name: r.emoji_name.clone(),
                            create_at: r.create_at,
                        });
                    }
                }
            }
        }
    }

    // For posts without metadata reactions, fetch them individually (batch up to 20)
    let posts_without_meta: Vec<&&Post> = posts.iter()
        .filter(|p| p.metadata.as_ref().and_then(|m| m.reactions.as_ref()).is_none())
        .take(20)
        .collect();

    for post in posts_without_meta {
        if let Ok(reactions) = client.get_reactions(&post.id).await {
            for r in reactions {
                if r.user_id != user_id {
                    results.push(ReactionOnMyPost {
                        post_id: post.id.clone(),
                        post_message: post.message.clone(),
                        channel_id: post.channel_id.clone(),
                        reactor_user_id: r.user_id.clone(),
                        emoji_name: r.emoji_name.clone(),
                        create_at: r.create_at,
                    });
                }
            }
        }
    }

    // Sort by create_at descending (most recent first)
    results.sort_by(|a, b| b.create_at.cmp(&a.create_at));

    Ok(results)
}
