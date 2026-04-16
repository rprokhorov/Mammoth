use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::commands::channels::ChannelWithMeta;
use crate::errors::AppError;
use crate::mattermost::types::{SidebarCategory, User};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionCache {
    /// Unix timestamp (ms) when this cache was last saved
    pub saved_at: i64,
    pub team_id: String,
    pub channels: Vec<ChannelWithMeta>,
    pub sidebar_categories: Vec<SidebarCategory>,
    pub favorite_channel_ids: Vec<String>,
    pub dm_users: Vec<User>,
}

fn cache_path(cache_dir: &std::path::Path, server_id: &str) -> PathBuf {
    cache_dir.join(format!("session_{}.json", server_id))
}

pub fn load(cache_dir: &std::path::Path, server_id: &str) -> Option<SessionCache> {
    let path = cache_path(cache_dir, server_id);
    let data = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&data).ok()
}

pub fn save(
    cache_dir: &std::path::Path,
    server_id: &str,
    cache: &SessionCache,
) -> Result<(), AppError> {
    std::fs::create_dir_all(cache_dir)?;
    let path = cache_path(cache_dir, server_id);
    let data = serde_json::to_string(cache)
        .map_err(|e| AppError::Config(format!("session cache serialize: {}", e)))?;
    std::fs::write(&path, data)?;
    Ok(())
}
