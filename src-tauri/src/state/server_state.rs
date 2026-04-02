use crate::mattermost::client::MattermostClient;
use crate::mattermost::types::User;
use crate::mattermost::websocket::WsManager;

pub struct ServerState {
    pub client: MattermostClient,
    pub current_user: Option<User>,
    pub display_name: String,
    pub ws_manager: Option<WsManager>,
}
