use reqwest::{Client, header};
use url::Url;

use crate::errors::AppError;
use super::types::*;

#[derive(Debug, Clone)]
pub struct MattermostClient {
    http: Client,
    base_url: Url,
    token: Option<String>,
}

impl MattermostClient {
    pub fn new(server_url: &str) -> Result<Self, AppError> {
        let mut url = server_url.to_string();
        if !url.ends_with('/') {
            url.push('/');
        }
        let base_url = Url::parse(&url)
            .map_err(|e| AppError::Config(format!("Invalid server URL: {}", e)))?;

        let http = Client::builder()
            .build()
            .map_err(AppError::Network)?;

        Ok(Self {
            http,
            base_url,
            token: None,
        })
    }

    pub fn with_token(mut self, token: String) -> Self {
        self.token = Some(token);
        self
    }

    pub fn set_token(&mut self, token: String) {
        self.token = Some(token);
    }

    pub fn token(&self) -> Option<&str> {
        self.token.as_deref()
    }

    pub fn base_url(&self) -> &Url {
        &self.base_url
    }

    fn api_url(&self, path: &str) -> String {
        format!("{}api/v4{}", self.base_url, path)
    }

    fn auth_header(&self) -> Result<String, AppError> {
        self.token
            .as_ref()
            .map(|t| format!("Bearer {}", t))
            .ok_or_else(|| AppError::Auth("No authentication token".into()))
    }

    async fn get_authenticated(&self, path: &str) -> Result<reqwest::Response, AppError> {
        let auth = self.auth_header()?;
        let resp = self
            .http
            .get(self.api_url(path))
            .header(header::AUTHORIZATION, &auth)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::Api {
                status,
                message: body,
            });
        }

        Ok(resp)
    }

    pub async fn ping(&self) -> Result<bool, AppError> {
        let resp = self
            .http
            .get(self.api_url("/system/ping"))
            .send()
            .await?;

        Ok(resp.status().is_success())
    }

    pub async fn login(&mut self, login_id: &str, password: &str) -> Result<User, AppError> {
        let req = LoginRequest {
            login_id: login_id.to_string(),
            password: password.to_string(),
            token: None,
        };

        let resp = self
            .http
            .post(self.api_url("/users/login"))
            .json(&req)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::Api {
                status,
                message: body,
            });
        }

        if let Some(token) = resp.headers().get("token") {
            self.token = Some(
                token
                    .to_str()
                    .map_err(|_| AppError::Auth("Invalid token header".into()))?
                    .to_string(),
            );
        }

        let user: User = resp.json().await?;
        Ok(user)
    }

    pub async fn login_with_token(&mut self, token: &str) -> Result<User, AppError> {
        self.token = Some(token.to_string());
        match self.get_me().await {
            Ok(user) => Ok(user),
            Err(e) => {
                self.token = None;
                Err(e)
            }
        }
    }

    pub async fn logout(&mut self) -> Result<(), AppError> {
        let auth = self.auth_header()?;
        let _ = self
            .http
            .post(self.api_url("/users/logout"))
            .header(header::AUTHORIZATION, auth)
            .send()
            .await;

        self.token = None;
        Ok(())
    }

    pub async fn get_me(&self) -> Result<User, AppError> {
        let resp = self.get_authenticated("/users/me").await?;
        let user: User = resp.json().await?;
        Ok(user)
    }

    pub async fn get_teams_for_user(&self, user_id: &str) -> Result<Vec<Team>, AppError> {
        let resp = self
            .get_authenticated(&format!("/users/{}/teams", user_id))
            .await?;
        let teams: Vec<Team> = resp.json().await?;
        Ok(teams)
    }

    // --- Channels ---

    pub async fn get_channels_for_team_for_user(
        &self,
        user_id: &str,
        team_id: &str,
    ) -> Result<Vec<Channel>, AppError> {
        let resp = self
            .get_authenticated(&format!(
                "/users/{}/teams/{}/channels",
                user_id, team_id
            ))
            .await?;
        let channels: Vec<Channel> = resp.json().await?;
        Ok(channels)
    }

    pub async fn get_channel(&self, channel_id: &str) -> Result<Channel, AppError> {
        let resp = self
            .get_authenticated(&format!("/channels/{}", channel_id))
            .await?;
        let channel: Channel = resp.json().await?;
        Ok(channel)
    }

    pub async fn get_channel_members(
        &self,
        channel_id: &str,
        page: u32,
        per_page: u32,
    ) -> Result<Vec<ChannelMember>, AppError> {
        let resp = self
            .get_authenticated(&format!(
                "/channels/{}/members?page={}&per_page={}",
                channel_id, page, per_page
            ))
            .await?;
        let members: Vec<ChannelMember> = resp.json().await?;
        Ok(members)
    }

    pub async fn view_channel(
        &self,
        user_id: &str,
        channel_id: &str,
    ) -> Result<(), AppError> {
        let auth = self.auth_header()?;
        let body = serde_json::json!({
            "channel_id": channel_id,
        });
        let resp = self
            .http
            .post(self.api_url(&format!("/channels/members/{}/view", user_id)))
            .header(header::AUTHORIZATION, &auth)
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let msg = resp.text().await.unwrap_or_default();
            return Err(AppError::Api {
                status,
                message: msg,
            });
        }
        Ok(())
    }

    pub async fn get_channels_members_for_user(
        &self,
        user_id: &str,
        team_id: &str,
    ) -> Result<Vec<ChannelMember>, AppError> {
        let resp = self
            .get_authenticated(&format!(
                "/users/{}/teams/{}/channels/members",
                user_id, team_id
            ))
            .await?;
        let members: Vec<ChannelMember> = resp.json().await?;
        Ok(members)
    }

    // --- Users ---

    pub async fn get_user(&self, user_id: &str) -> Result<User, AppError> {
        let resp = self
            .get_authenticated(&format!("/users/{}", user_id))
            .await?;
        let user: User = resp.json().await?;
        Ok(user)
    }

    pub async fn get_users_by_ids(&self, user_ids: &[String]) -> Result<Vec<User>, AppError> {
        let auth = self.auth_header()?;
        let resp = self
            .http
            .post(self.api_url("/users/ids"))
            .header(header::AUTHORIZATION, &auth)
            .json(user_ids)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let msg = resp.text().await.unwrap_or_default();
            return Err(AppError::Api {
                status,
                message: msg,
            });
        }

        let users: Vec<User> = resp.json().await?;
        Ok(users)
    }

    pub async fn get_user_statuses_by_ids(
        &self,
        user_ids: &[String],
    ) -> Result<Vec<UserStatus>, AppError> {
        let auth = self.auth_header()?;
        let resp = self
            .http
            .post(self.api_url("/users/status/ids"))
            .header(header::AUTHORIZATION, &auth)
            .json(user_ids)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let msg = resp.text().await.unwrap_or_default();
            return Err(AppError::Api {
                status,
                message: msg,
            });
        }

        let statuses: Vec<UserStatus> = resp.json().await?;
        Ok(statuses)
    }

    // --- Posts ---

    pub async fn get_posts_for_channel(
        &self,
        channel_id: &str,
        page: u32,
        per_page: u32,
    ) -> Result<PostList, AppError> {
        let resp = self
            .get_authenticated(&format!(
                "/channels/{}/posts?page={}&per_page={}",
                channel_id, page, per_page
            ))
            .await?;
        let posts: PostList = resp.json().await?;
        Ok(posts)
    }

    pub async fn create_post(
        &self,
        channel_id: &str,
        message: &str,
        root_id: Option<&str>,
    ) -> Result<Post, AppError> {
        let auth = self.auth_header()?;
        let mut body = serde_json::json!({
            "channel_id": channel_id,
            "message": message,
        });
        if let Some(rid) = root_id {
            body["root_id"] = serde_json::json!(rid);
        }

        let resp = self
            .http
            .post(self.api_url("/posts"))
            .header(header::AUTHORIZATION, &auth)
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let msg = resp.text().await.unwrap_or_default();
            return Err(AppError::Api { status, message: msg });
        }

        let post: Post = resp.json().await?;
        Ok(post)
    }

    pub async fn update_post(
        &self,
        post_id: &str,
        message: &str,
    ) -> Result<Post, AppError> {
        let auth = self.auth_header()?;
        let body = serde_json::json!({
            "id": post_id,
            "message": message,
        });

        let resp = self
            .http
            .put(self.api_url(&format!("/posts/{}", post_id)))
            .header(header::AUTHORIZATION, &auth)
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let msg = resp.text().await.unwrap_or_default();
            return Err(AppError::Api { status, message: msg });
        }

        let post: Post = resp.json().await?;
        Ok(post)
    }

    pub async fn delete_post(&self, post_id: &str) -> Result<(), AppError> {
        let auth = self.auth_header()?;
        let resp = self
            .http
            .delete(self.api_url(&format!("/posts/{}", post_id)))
            .header(header::AUTHORIZATION, &auth)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let msg = resp.text().await.unwrap_or_default();
            return Err(AppError::Api { status, message: msg });
        }

        Ok(())
    }

    // --- Files ---

    pub async fn upload_file(
        &self,
        channel_id: &str,
        file_path: &str,
        file_name: &str,
    ) -> Result<Vec<FileInfo>, AppError> {
        let auth = self.auth_header()?;
        let file_bytes = tokio::fs::read(file_path).await.map_err(AppError::Io)?;

        let part = reqwest::multipart::Part::bytes(file_bytes)
            .file_name(file_name.to_string());
        let form = reqwest::multipart::Form::new()
            .text("channel_id", channel_id.to_string())
            .part("files", part);

        let resp = self
            .http
            .post(self.api_url("/files"))
            .header(header::AUTHORIZATION, &auth)
            .multipart(form)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let msg = resp.text().await.unwrap_or_default();
            return Err(AppError::Api { status, message: msg });
        }

        #[derive(serde::Deserialize)]
        struct UploadResponse {
            file_infos: Vec<FileInfo>,
        }
        let upload_resp: UploadResponse = resp.json().await?;
        Ok(upload_resp.file_infos)
    }

    pub async fn get_file_info(&self, file_id: &str) -> Result<FileInfo, AppError> {
        let resp = self
            .get_authenticated(&format!("/files/{}/info", file_id))
            .await?;
        let info: FileInfo = resp.json().await?;
        Ok(info)
    }

    pub async fn download_file(&self, file_id: &str) -> Result<Vec<u8>, AppError> {
        let auth = self.auth_header()?;
        let resp = self
            .http
            .get(self.api_url(&format!("/files/{}", file_id)))
            .header(header::AUTHORIZATION, &auth)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let msg = resp.text().await.unwrap_or_default();
            return Err(AppError::Api { status, message: msg });
        }

        let bytes = resp.bytes().await.map_err(AppError::Network)?;
        Ok(bytes.to_vec())
    }

    pub fn file_url(&self, file_id: &str) -> String {
        self.api_url(&format!("/files/{}", file_id))
    }

    pub fn file_thumbnail_url(&self, file_id: &str) -> String {
        self.api_url(&format!("/files/{}/thumbnail", file_id))
    }

    // --- Search ---

    pub async fn search_posts(
        &self,
        team_id: &str,
        terms: &str,
    ) -> Result<PostList, AppError> {
        let auth = self.auth_header()?;
        let body = serde_json::json!({
            "terms": terms,
            "is_or_search": false,
        });
        let resp = self
            .http
            .post(self.api_url(&format!("/teams/{}/posts/search", team_id)))
            .header(header::AUTHORIZATION, &auth)
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let msg = resp.text().await.unwrap_or_default();
            return Err(AppError::Api { status, message: msg });
        }

        let results: PostList = resp.json().await?;
        Ok(results)
    }

    // --- Threads ---

    pub async fn get_post_thread(
        &self,
        post_id: &str,
    ) -> Result<PostList, AppError> {
        let resp = self
            .get_authenticated(&format!("/posts/{}/thread", post_id))
            .await?;
        let thread: PostList = resp.json().await?;
        Ok(thread)
    }

    pub async fn get_threads_for_user(
        &self,
        user_id: &str,
        team_id: &str,
        page: u32,
        per_page: u32,
    ) -> Result<UserThreadList, AppError> {
        let resp = self
            .get_authenticated(&format!(
                "/users/{}/teams/{}/threads?page={}&per_page={}&extended=true",
                user_id, team_id, page, per_page
            ))
            .await?;
        let threads: UserThreadList = resp.json().await?;
        Ok(threads)
    }

    pub async fn follow_thread(
        &self,
        user_id: &str,
        team_id: &str,
        thread_id: &str,
    ) -> Result<(), AppError> {
        let auth = self.auth_header()?;
        let resp = self
            .http
            .put(self.api_url(&format!(
                "/users/{}/teams/{}/threads/{}/following",
                user_id, team_id, thread_id
            )))
            .header(header::AUTHORIZATION, &auth)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let msg = resp.text().await.unwrap_or_default();
            return Err(AppError::Api { status, message: msg });
        }
        Ok(())
    }

    pub async fn unfollow_thread(
        &self,
        user_id: &str,
        team_id: &str,
        thread_id: &str,
    ) -> Result<(), AppError> {
        let auth = self.auth_header()?;
        let resp = self
            .http
            .delete(self.api_url(&format!(
                "/users/{}/teams/{}/threads/{}/following",
                user_id, team_id, thread_id
            )))
            .header(header::AUTHORIZATION, &auth)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let msg = resp.text().await.unwrap_or_default();
            return Err(AppError::Api { status, message: msg });
        }
        Ok(())
    }

    pub async fn mark_thread_as_read(
        &self,
        user_id: &str,
        team_id: &str,
        thread_id: &str,
        timestamp: i64,
    ) -> Result<(), AppError> {
        let auth = self.auth_header()?;
        let resp = self
            .http
            .put(self.api_url(&format!(
                "/users/{}/teams/{}/threads/{}/read/{}",
                user_id, team_id, thread_id, timestamp
            )))
            .header(header::AUTHORIZATION, &auth)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let msg = resp.text().await.unwrap_or_default();
            return Err(AppError::Api { status, message: msg });
        }
        Ok(())
    }

    // --- Channel Management ---

    pub async fn create_channel(
        &self,
        team_id: &str,
        name: &str,
        display_name: &str,
        channel_type: &str,
        purpose: Option<&str>,
        header: Option<&str>,
    ) -> Result<Channel, AppError> {
        let auth = self.auth_header()?;
        let mut body = serde_json::json!({
            "team_id": team_id,
            "name": name,
            "display_name": display_name,
            "type": channel_type,
        });
        if let Some(p) = purpose {
            body["purpose"] = serde_json::json!(p);
        }
        if let Some(h) = header {
            body["header"] = serde_json::json!(h);
        }

        let resp = self
            .http
            .post(self.api_url("/channels"))
            .header(header::AUTHORIZATION, &auth)
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let msg = resp.text().await.unwrap_or_default();
            return Err(AppError::Api { status, message: msg });
        }

        let channel: Channel = resp.json().await?;
        Ok(channel)
    }

    pub async fn update_channel(
        &self,
        channel_id: &str,
        patch: serde_json::Value,
    ) -> Result<Channel, AppError> {
        let auth = self.auth_header()?;
        let resp = self
            .http
            .put(self.api_url(&format!("/channels/{}/patch", channel_id)))
            .header(header::AUTHORIZATION, &auth)
            .json(&patch)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let msg = resp.text().await.unwrap_or_default();
            return Err(AppError::Api { status, message: msg });
        }

        let channel: Channel = resp.json().await?;
        Ok(channel)
    }

    pub async fn delete_channel(&self, channel_id: &str) -> Result<(), AppError> {
        let auth = self.auth_header()?;
        let resp = self
            .http
            .delete(self.api_url(&format!("/channels/{}", channel_id)))
            .header(header::AUTHORIZATION, &auth)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let msg = resp.text().await.unwrap_or_default();
            return Err(AppError::Api { status, message: msg });
        }
        Ok(())
    }

    pub async fn add_channel_member(
        &self,
        channel_id: &str,
        user_id: &str,
    ) -> Result<(), AppError> {
        let auth = self.auth_header()?;
        let body = serde_json::json!({ "user_id": user_id });
        let resp = self
            .http
            .post(self.api_url(&format!("/channels/{}/members", channel_id)))
            .header(header::AUTHORIZATION, &auth)
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let msg = resp.text().await.unwrap_or_default();
            return Err(AppError::Api { status, message: msg });
        }
        Ok(())
    }

    pub async fn leave_channel(
        &self,
        channel_id: &str,
        user_id: &str,
    ) -> Result<(), AppError> {
        let auth = self.auth_header()?;
        let resp = self
            .http
            .delete(self.api_url(&format!("/channels/{}/members/{}", channel_id, user_id)))
            .header(header::AUTHORIZATION, &auth)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let msg = resp.text().await.unwrap_or_default();
            return Err(AppError::Api { status, message: msg });
        }
        Ok(())
    }

    // --- Reactions ---

    pub async fn add_reaction(
        &self,
        user_id: &str,
        post_id: &str,
        emoji_name: &str,
    ) -> Result<(), AppError> {
        let auth = self.auth_header()?;
        let body = serde_json::json!({
            "user_id": user_id,
            "post_id": post_id,
            "emoji_name": emoji_name,
        });
        let resp = self
            .http
            .post(self.api_url("/reactions"))
            .header(header::AUTHORIZATION, &auth)
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let msg = resp.text().await.unwrap_or_default();
            return Err(AppError::Api { status, message: msg });
        }
        Ok(())
    }

    pub async fn remove_reaction(
        &self,
        user_id: &str,
        post_id: &str,
        emoji_name: &str,
    ) -> Result<(), AppError> {
        let auth = self.auth_header()?;
        let resp = self
            .http
            .delete(self.api_url(&format!(
                "/users/{}/posts/{}/reactions/{}",
                user_id, post_id, emoji_name
            )))
            .header(header::AUTHORIZATION, &auth)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let msg = resp.text().await.unwrap_or_default();
            return Err(AppError::Api { status, message: msg });
        }
        Ok(())
    }

    pub async fn get_reactions(&self, post_id: &str) -> Result<Vec<Reaction>, AppError> {
        let resp = self
            .get_authenticated(&format!("/posts/{}/reactions", post_id))
            .await?;
        let reactions: Vec<Reaction> = resp.json().await?;
        Ok(reactions)
    }

    // --- Pinned Messages ---

    pub async fn pin_post(&self, post_id: &str) -> Result<(), AppError> {
        let auth = self.auth_header()?;
        let resp = self
            .http
            .post(self.api_url(&format!("/posts/{}/pin", post_id)))
            .header(header::AUTHORIZATION, &auth)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let msg = resp.text().await.unwrap_or_default();
            return Err(AppError::Api { status, message: msg });
        }
        Ok(())
    }

    pub async fn unpin_post(&self, post_id: &str) -> Result<(), AppError> {
        let auth = self.auth_header()?;
        let resp = self
            .http
            .post(self.api_url(&format!("/posts/{}/unpin", post_id)))
            .header(header::AUTHORIZATION, &auth)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let msg = resp.text().await.unwrap_or_default();
            return Err(AppError::Api { status, message: msg });
        }
        Ok(())
    }

    pub async fn get_pinned_posts(&self, channel_id: &str) -> Result<PostList, AppError> {
        let resp = self
            .get_authenticated(&format!("/channels/{}/pinned", channel_id))
            .await?;
        let posts: PostList = resp.json().await?;
        Ok(posts)
    }

    // --- Saved Posts (flagged) ---

    pub async fn save_post(&self, user_id: &str, post_id: &str) -> Result<(), AppError> {
        let auth = self.auth_header()?;
        let body = serde_json::json!({
            "user_id": user_id,
            "category": "flagged",
            "name": post_id,
            "value": "true",
        });
        let resp = self
            .http
            .put(self.api_url(&format!("/users/{}/preferences", user_id)))
            .header(header::AUTHORIZATION, &auth)
            .json(&serde_json::json!([body]))
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let msg = resp.text().await.unwrap_or_default();
            return Err(AppError::Api { status, message: msg });
        }
        Ok(())
    }

    pub async fn unsave_post(&self, user_id: &str, post_id: &str) -> Result<(), AppError> {
        let auth = self.auth_header()?;
        let body = serde_json::json!({
            "user_id": user_id,
            "category": "flagged",
            "name": post_id,
        });
        let resp = self
            .http
            .post(self.api_url(&format!("/users/{}/preferences/delete", user_id)))
            .header(header::AUTHORIZATION, &auth)
            .json(&serde_json::json!([body]))
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let msg = resp.text().await.unwrap_or_default();
            return Err(AppError::Api { status, message: msg });
        }
        Ok(())
    }

    pub async fn get_flagged_posts(
        &self,
        user_id: &str,
        team_id: &str,
        page: u32,
        per_page: u32,
    ) -> Result<PostList, AppError> {
        let resp = self
            .get_authenticated(&format!(
                "/users/{}/posts/flagged?team_id={}&page={}&per_page={}",
                user_id, team_id, page, per_page
            ))
            .await?;
        let posts: PostList = resp.json().await?;
        Ok(posts)
    }

    // --- Emoji ---

    pub async fn get_custom_emoji_list(&self, page: u32, per_page: u32) -> Result<Vec<CustomEmoji>, AppError> {
        let resp = self
            .get_authenticated(&format!("/emoji?page={}&per_page={}", page, per_page))
            .await?;
        let emojis: Vec<CustomEmoji> = resp.json().await?;
        Ok(emojis)
    }

    pub fn custom_emoji_image_url(&self, emoji_id: &str) -> String {
        self.api_url(&format!("/emoji/{}/image", emoji_id))
    }

    // --- Profile ---

    pub async fn update_user(&self, user_id: &str, patch: serde_json::Value) -> Result<User, AppError> {
        let auth = self.auth_header()?;
        let resp = self
            .http
            .put(self.api_url(&format!("/users/{}/patch", user_id)))
            .header(header::AUTHORIZATION, &auth)
            .json(&patch)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let msg = resp.text().await.unwrap_or_default();
            return Err(AppError::Api { status, message: msg });
        }

        let user: User = resp.json().await?;
        Ok(user)
    }

    pub async fn upload_profile_image(&self, user_id: &str, file_path: &str) -> Result<(), AppError> {
        let auth = self.auth_header()?;
        let file_bytes = tokio::fs::read(file_path).await.map_err(AppError::Io)?;
        let file_name = std::path::Path::new(file_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("image.png")
            .to_string();

        let part = reqwest::multipart::Part::bytes(file_bytes)
            .file_name(file_name)
            .mime_str("image/png")
            .unwrap();
        let form = reqwest::multipart::Form::new().part("image", part);

        let resp = self
            .http
            .post(self.api_url(&format!("/users/{}/image", user_id)))
            .header(header::AUTHORIZATION, &auth)
            .multipart(form)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let msg = resp.text().await.unwrap_or_default();
            return Err(AppError::Api { status, message: msg });
        }
        Ok(())
    }

    pub fn profile_image_url(&self, user_id: &str) -> String {
        self.api_url(&format!("/users/{}/image", user_id))
    }

    pub async fn update_user_status(
        &self,
        user_id: &str,
        status: &str,
    ) -> Result<UserStatus, AppError> {
        let auth = self.auth_header()?;
        let body = serde_json::json!({
            "user_id": user_id,
            "status": status,
        });
        let resp = self
            .http
            .put(self.api_url(&format!("/users/{}/status", user_id)))
            .header(header::AUTHORIZATION, &auth)
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status_code = resp.status().as_u16();
            let msg = resp.text().await.unwrap_or_default();
            return Err(AppError::Api { status: status_code, message: msg });
        }

        let result: UserStatus = resp.json().await?;
        Ok(result)
    }

    // --- Custom Status ---

    pub async fn update_custom_status(
        &self,
        user_id: &str,
        emoji: &str,
        text: &str,
        expires_at: Option<&str>,
    ) -> Result<(), AppError> {
        let auth = self.auth_header()?;
        let mut body = serde_json::json!({
            "emoji": emoji,
            "text": text,
        });
        if let Some(exp) = expires_at {
            body["expires_at"] = serde_json::json!(exp);
        }
        let resp = self
            .http
            .put(self.api_url(&format!("/users/{}/status/custom", user_id)))
            .header(header::AUTHORIZATION, &auth)
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let msg = resp.text().await.unwrap_or_default();
            return Err(AppError::Api { status, message: msg });
        }
        Ok(())
    }

    pub async fn clear_custom_status(&self, user_id: &str) -> Result<(), AppError> {
        let auth = self.auth_header()?;
        let resp = self
            .http
            .delete(self.api_url(&format!("/users/{}/status/custom", user_id)))
            .header(header::AUTHORIZATION, &auth)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let msg = resp.text().await.unwrap_or_default();
            return Err(AppError::Api { status, message: msg });
        }
        Ok(())
    }

    // --- Channel Notify Props ---

    pub async fn get_channel_notify_props(
        &self,
        channel_id: &str,
        user_id: &str,
    ) -> Result<serde_json::Value, AppError> {
        let resp = self
            .get_authenticated(&format!("/channels/{}/members/{}", channel_id, user_id))
            .await?;
        let member: serde_json::Value = resp.json().await?;
        Ok(member.get("notify_props").cloned().unwrap_or_default())
    }

    pub async fn update_channel_notify_props(
        &self,
        channel_id: &str,
        user_id: &str,
        notify_props: serde_json::Value,
    ) -> Result<(), AppError> {
        let auth = self.auth_header()?;
        let body = serde_json::json!({
            "channel_id": channel_id,
            "user_id": user_id,
            "notify_props": notify_props,
        });
        let resp = self
            .http
            .put(self.api_url(&format!("/channels/{}/members/{}/notify_props", channel_id, user_id)))
            .header(header::AUTHORIZATION, &auth)
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let msg = resp.text().await.unwrap_or_default();
            return Err(AppError::Api { status, message: msg });
        }
        Ok(())
    }

    // --- User Preferences (favorites) ---

    pub async fn get_preferences(
        &self,
        user_id: &str,
        category: &str,
    ) -> Result<Vec<serde_json::Value>, AppError> {
        let resp = self
            .get_authenticated(&format!("/users/{}/preferences/{}", user_id, category))
            .await?;
        let prefs: Vec<serde_json::Value> = resp.json().await?;
        Ok(prefs)
    }

    pub async fn save_preferences(
        &self,
        user_id: &str,
        preferences: &[serde_json::Value],
    ) -> Result<(), AppError> {
        let auth = self.auth_header()?;
        let resp = self
            .http
            .put(self.api_url(&format!("/users/{}/preferences", user_id)))
            .header(header::AUTHORIZATION, &auth)
            .json(preferences)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let msg = resp.text().await.unwrap_or_default();
            return Err(AppError::Api { status, message: msg });
        }
        Ok(())
    }

    pub async fn delete_preferences(
        &self,
        user_id: &str,
        preferences: &[serde_json::Value],
    ) -> Result<(), AppError> {
        let auth = self.auth_header()?;
        let resp = self
            .http
            .post(self.api_url(&format!("/users/{}/preferences/delete", user_id)))
            .header(header::AUTHORIZATION, &auth)
            .json(preferences)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let msg = resp.text().await.unwrap_or_default();
            return Err(AppError::Api { status, message: msg });
        }
        Ok(())
    }

    // --- Sidebar Categories ---

    pub async fn get_sidebar_categories(
        &self,
        user_id: &str,
        team_id: &str,
    ) -> Result<Vec<SidebarCategory>, AppError> {
        let resp = self
            .get_authenticated(&format!(
                "/users/{}/teams/{}/channels/categories",
                user_id, team_id
            ))
            .await?;
        // API returns { "order": [...], "categories": [...] }
        let body: serde_json::Value = resp.json().await?;
        let categories: Vec<SidebarCategory> = serde_json::from_value(
            body.get("categories")
                .cloned()
                .unwrap_or(serde_json::Value::Array(vec![]))
        ).map_err(|e| AppError::Config(format!("Failed to parse sidebar categories: {}", e)))?;
        Ok(categories)
    }

    pub async fn create_sidebar_category(
        &self,
        user_id: &str,
        team_id: &str,
        category: &SidebarCategoryCreate,
    ) -> Result<SidebarCategory, AppError> {
        let auth = self.auth_header()?;
        let resp = self
            .http
            .post(self.api_url(&format!(
                "/users/{}/teams/{}/channels/categories",
                user_id, team_id
            )))
            .header(header::AUTHORIZATION, &auth)
            .json(category)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let msg = resp.text().await.unwrap_or_default();
            return Err(AppError::Api { status, message: msg });
        }

        let created: SidebarCategory = resp.json().await?;
        Ok(created)
    }

    pub async fn update_sidebar_category(
        &self,
        user_id: &str,
        team_id: &str,
        category_id: &str,
        category: &SidebarCategoryUpdate,
    ) -> Result<SidebarCategory, AppError> {
        let auth = self.auth_header()?;
        let resp = self
            .http
            .put(self.api_url(&format!(
                "/users/{}/teams/{}/channels/categories/{}",
                user_id, team_id, category_id
            )))
            .header(header::AUTHORIZATION, &auth)
            .json(category)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let msg = resp.text().await.unwrap_or_default();
            return Err(AppError::Api { status, message: msg });
        }

        let updated: SidebarCategory = resp.json().await?;
        Ok(updated)
    }

    pub async fn delete_sidebar_category(
        &self,
        user_id: &str,
        team_id: &str,
        category_id: &str,
    ) -> Result<(), AppError> {
        let auth = self.auth_header()?;
        let resp = self
            .http
            .delete(self.api_url(&format!(
                "/users/{}/teams/{}/channels/categories/{}",
                user_id, team_id, category_id
            )))
            .header(header::AUTHORIZATION, &auth)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let msg = resp.text().await.unwrap_or_default();
            return Err(AppError::Api { status, message: msg });
        }
        Ok(())
    }

    /// Get WebSocket URL for this server
    pub fn websocket_url(&self) -> Result<String, AppError> {
        let base = self.base_url.as_str();
        let ws_url = if base.starts_with("https") {
            base.replacen("https", "wss", 1)
        } else {
            base.replacen("http", "ws", 1)
        };
        Ok(format!("{}api/v4/websocket", ws_url))
    }
}
