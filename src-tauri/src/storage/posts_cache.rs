use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::mattermost::types::Post;

/// Cached posts for a single channel — stores the latest page only.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelPostsCache {
    pub saved_at: i64,
    pub order: Vec<String>,
    pub posts: std::collections::HashMap<String, Post>,
}

fn cache_path(cache_dir: &std::path::Path, server_id: &str, channel_id: &str) -> PathBuf {
    cache_dir.join(format!("posts_{}_{}.json", server_id, channel_id))
}

pub fn load(
    cache_dir: &std::path::Path,
    server_id: &str,
    channel_id: &str,
) -> Option<ChannelPostsCache> {
    let path = cache_path(cache_dir, server_id, channel_id);
    let data = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&data).ok()
}

pub fn save(
    cache_dir: &std::path::Path,
    server_id: &str,
    channel_id: &str,
    cache: &ChannelPostsCache,
) -> std::io::Result<()> {
    std::fs::create_dir_all(cache_dir)?;
    let path = cache_path(cache_dir, server_id, channel_id);
    let data = serde_json::to_string(cache).map_err(|e| std::io::Error::other(e.to_string()))?;
    std::fs::write(&path, data)
}
