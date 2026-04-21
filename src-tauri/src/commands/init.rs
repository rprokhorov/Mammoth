use serde::Serialize;
use tauri::{Emitter, Manager, State};
use tokio::join;

use crate::errors::AppError;
use crate::mattermost::types::{ChannelMember, SidebarCategory, Team, User};
use crate::state::AppState;
use crate::storage::session_cache::{self, SessionCache};

use super::channels::ChannelWithMeta;

/// Phase 1 result — returned immediately to unblock the UI.
/// Only me + teams: these two requests are fast (< 1 sec combined).
#[derive(Debug, Clone, Serialize)]
pub struct InitAppFastResult {
    pub user: User,
    pub teams: Vec<Team>,
    /// Cached channels from the previous session, or empty if no cache.
    /// The UI should show these immediately and then update when channels-loaded fires.
    pub cached_channels: Vec<ChannelWithMeta>,
    pub cached_sidebar_categories: Vec<SidebarCategory>,
    pub cached_favorite_channel_ids: Vec<String>,
    pub cached_dm_users: Vec<User>,
    pub has_cache: bool,
}

/// Phase 2 payload — emitted as a Tauri event "channels-loaded"
/// after the slow channel/member/sidebar/favorites requests finish.
#[derive(Debug, Clone, Serialize)]
pub struct ChannelsLoadedPayload {
    pub server_id: String,
    pub team_id: String,
    pub channels: Vec<ChannelWithMeta>,
    pub sidebar_categories: Vec<SidebarCategory>,
    pub favorite_channel_ids: Vec<String>,
    pub dm_users: Vec<User>,
}

/// Phase 1: validate session + get me + get teams.
/// Also reads the session cache from disk — returns it immediately so the UI
/// can show stale channel data while the background refresh runs.
/// Returns None on 401 (caller should redirect to login).
#[tauri::command]
pub async fn init_app_fast(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    server_id: String,
) -> Result<Option<InitAppFastResult>, AppError> {
    let client = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound(format!("Server {} not found", server_id)))?;
        server.client.clone()
    };

    // Validate session via GET /users/me
    let user: User = match client.get_me().await {
        Ok(u) => u,
        Err(AppError::Api { status: 401, .. }) => return Ok(None),
        Err(e) => return Err(e),
    };

    // Store current_user so other commands work immediately
    {
        let mut servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        if let Some(server) = servers.get_mut(&server_id) {
            server.current_user = Some(user.clone());
        }
    }

    let user_id = user.id.clone();
    let teams = client.get_teams_for_user(&user_id).await?;

    // Read session cache from disk (instant — local file)
    let cache_dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|_| AppError::Config("Cannot resolve cache dir".into()))?;

    let cached = session_cache::load(&cache_dir, &server_id);
    let has_cache = cached.is_some();

    let (cached_channels, cached_sidebar_categories, cached_favorite_channel_ids, cached_dm_users) =
        if let Some(c) = cached {
            (c.channels, c.sidebar_categories, c.favorite_channel_ids, c.dm_users)
        } else {
            (vec![], vec![], vec![], vec![])
        };

    Ok(Some(InitAppFastResult {
        user,
        teams,
        cached_channels,
        cached_sidebar_categories,
        cached_favorite_channel_ids,
        cached_dm_users,
        has_cache,
    }))
}

/// Phase 2: load channels from server, compare with cache, emit "channels-loaded" event.
/// Spawns a background task — returns immediately.
/// At the end saves the fresh data to disk cache for the next session.
#[tauri::command]
pub async fn load_channels_data(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    server_id: String,
    team_id: String,
) -> Result<(), AppError> {
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

    let cache_dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|_| AppError::Config("Cannot resolve cache dir".into()))?;

    let server_id_clone = server_id.clone();
    let team_id_clone = team_id.clone();

    // Spawn so the command returns immediately
    tauri::async_runtime::spawn(async move {
        let c1 = client.clone();
        let c2 = client.clone();
        let c3 = client.clone();
        let c4 = client.clone();
        let uid1 = user_id.clone();
        let uid2 = user_id.clone();
        let uid3 = user_id.clone();
        let uid4 = user_id.clone();
        let tid1 = team_id.clone();
        let tid2 = team_id.clone();
        let tid3 = team_id.clone();

        let (channels_res, members_res, sidebar_res, favorites_res) = join!(
            c1.get_channels_for_team_for_user(&uid1, &tid1),
            c2.get_channels_members_for_user(&uid2, &tid2),
            c3.get_sidebar_categories(&uid3, &tid3),
            c4.get_preferences(&uid4, "favorite_channel"),
        );

        let channels_raw = match channels_res {
            Ok(v) => v,
            Err(e) => { log::error!("load_channels_data: channels: {}", e); return; }
        };
        let members_raw = match members_res {
            Ok(v) => v,
            Err(e) => { log::error!("load_channels_data: members: {}", e); return; }
        };
        let sidebar_categories = sidebar_res.unwrap_or_default();
        let favorite_prefs = favorites_res.unwrap_or_default();

        let favorite_channel_ids: Vec<String> = favorite_prefs
            .iter()
            .filter_map(|p| {
                let val = p.get("value")?.as_str()?;
                if val == "true" { p.get("name")?.as_str().map(String::from) } else { None }
            })
            .collect();

        let member_map: std::collections::HashMap<String, ChannelMember> = members_raw
            .into_iter()
            .map(|m| (m.channel_id.clone(), m))
            .collect();

        let channels: Vec<ChannelWithMeta> = channels_raw
            .into_iter()
            .map(|ch| {
                let member = member_map.get(&ch.id);
                let mark_unread = member
                    .and_then(|m| m.notify_props.as_ref())
                    .map(|np| np.mark_unread.clone())
                    .unwrap_or_default();
                ChannelWithMeta {
                    msg_count: member.map_or(0, |m| m.msg_count),
                    mention_count: member.map_or(0, |m| m.mention_count),
                    last_viewed_at: member.map_or(0, |m| m.last_viewed_at),
                    mark_unread,
                    channel: ch,
                }
            })
            .collect();

        let mut dm_user_ids: Vec<String> = channels
            .iter()
            .filter(|c| c.channel.channel_type == "D")
            .flat_map(|c| c.channel.name.split("__").map(str::to_string))
            .collect();
        dm_user_ids.sort();
        dm_user_ids.dedup();

        let dm_users = if dm_user_ids.is_empty() {
            vec![]
        } else {
            client.get_users_by_ids(&dm_user_ids).await.unwrap_or_default()
        };

        // Save fresh data to disk cache for next session
        let saved_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;

        let new_cache = SessionCache {
            saved_at,
            team_id: team_id_clone.clone(),
            channels: channels.clone(),
            sidebar_categories: sidebar_categories.clone(),
            favorite_channel_ids: favorite_channel_ids.clone(),
            dm_users: dm_users.clone(),
        };
        if let Err(e) = session_cache::save(&cache_dir, &server_id_clone, &new_cache) {
            log::warn!("Failed to save session cache: {}", e);
        }

        // Emit to frontend
        let payload = ChannelsLoadedPayload {
            server_id: server_id_clone,
            team_id: team_id_clone,
            channels,
            sidebar_categories,
            favorite_channel_ids,
            dm_users,
        };

        if let Some(window) = app_handle.get_webview_window("main") {
            let _ = window.emit("channels-loaded", payload);
        }
    });

    Ok(())
}
