use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub username: String,
    pub email: String,
    #[serde(default)]
    pub first_name: String,
    #[serde(default)]
    pub last_name: String,
    #[serde(default)]
    pub nickname: String,
    #[serde(default)]
    pub position: String,
    #[serde(default)]
    pub roles: String,
    #[serde(default)]
    pub locale: String,
    #[serde(default)]
    pub timezone: Option<serde_json::Value>,
    #[serde(default)]
    pub create_at: i64,
    #[serde(default)]
    pub update_at: i64,
    #[serde(default)]
    pub delete_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Team {
    pub id: String,
    pub display_name: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(alias = "type")]
    pub team_type: String,
    #[serde(default)]
    pub create_at: i64,
    #[serde(default)]
    pub update_at: i64,
    #[serde(default)]
    pub delete_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Channel {
    pub id: String,
    pub team_id: String,
    pub display_name: String,
    pub name: String,
    #[serde(alias = "type")]
    pub channel_type: String,
    #[serde(default)]
    pub header: String,
    #[serde(default)]
    pub purpose: String,
    #[serde(default)]
    pub creator_id: String,
    #[serde(default)]
    pub create_at: i64,
    #[serde(default)]
    pub update_at: i64,
    #[serde(default)]
    pub delete_at: i64,
    #[serde(default)]
    pub total_msg_count: i64,
    #[serde(default)]
    pub last_post_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelMember {
    pub channel_id: String,
    pub user_id: String,
    #[serde(default)]
    pub roles: String,
    #[serde(default)]
    pub last_viewed_at: i64,
    #[serde(default)]
    pub msg_count: i64,
    #[serde(default)]
    pub mention_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Post {
    pub id: String,
    pub channel_id: String,
    pub user_id: String,
    #[serde(default)]
    pub root_id: String,
    #[serde(default)]
    pub message: String,
    #[serde(alias = "type", default)]
    pub post_type: String,
    #[serde(default)]
    pub props: serde_json::Value,
    #[serde(default)]
    pub hashtags: String,
    #[serde(default)]
    pub file_ids: Vec<String>,
    #[serde(default)]
    pub create_at: i64,
    #[serde(default)]
    pub update_at: i64,
    #[serde(default)]
    pub delete_at: i64,
    #[serde(default)]
    pub edit_at: i64,
    #[serde(default)]
    pub reply_count: i64,
    #[serde(default)]
    pub is_pinned: bool,
    #[serde(default)]
    pub metadata: Option<PostMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostMetadata {
    #[serde(default)]
    pub reactions: Option<Vec<Reaction>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reaction {
    pub user_id: String,
    pub post_id: String,
    pub emoji_name: String,
    #[serde(default)]
    pub create_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomEmoji {
    pub id: String,
    pub name: String,
    pub creator_id: String,
    #[serde(default)]
    pub create_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostList {
    pub order: Vec<String>,
    pub posts: std::collections::HashMap<String, Post>,
}

// --- Threads ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreadResponse {
    pub order: Vec<String>,
    pub posts: std::collections::HashMap<String, Post>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserThread {
    pub id: String,
    #[serde(default)]
    pub reply_count: i64,
    #[serde(default)]
    pub last_reply_at: i64,
    #[serde(default)]
    pub last_viewed_at: i64,
    #[serde(default)]
    pub participants: Vec<ThreadParticipant>,
    #[serde(default)]
    pub post: Option<Post>,
    #[serde(default)]
    pub unread_replies: i64,
    #[serde(default)]
    pub unread_mentions: i64,
    #[serde(default)]
    pub is_following: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreadParticipant {
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserThreadList {
    pub threads: Vec<UserThread>,
    #[serde(default)]
    pub total: i64,
    #[serde(default)]
    pub total_unread_threads: i64,
    #[serde(default)]
    pub total_unread_mentions: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginRequest {
    pub login_id: String,
    pub password: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileInfo {
    pub id: String,
    pub user_id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub extension: String,
    #[serde(default)]
    pub size: i64,
    #[serde(default)]
    pub mime_type: String,
    #[serde(default)]
    pub width: i32,
    #[serde(default)]
    pub height: i32,
    #[serde(default)]
    pub create_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserStatus {
    pub user_id: String,
    pub status: String,
    #[serde(default)]
    pub manual: bool,
    #[serde(default)]
    pub last_activity_at: i64,
}
