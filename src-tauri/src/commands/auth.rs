use serde::Serialize;
use tauri::{Manager, State, Emitter, WebviewUrl, WebviewWindowBuilder};

use crate::errors::AppError;
use crate::mattermost::client::MattermostClient;
use crate::mattermost::types::{Team, User};
use crate::mattermost::websocket::WsManager;
use crate::state::AppState;
use super::servers::update_server_token;

#[derive(Debug, Clone, Serialize)]
pub struct SsoTokenPayload {
    pub token: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct LoginResponse {
    pub user: User,
    pub teams: Vec<Team>,
    pub token: String,
}

#[tauri::command]
pub async fn ping_server(url: String) -> Result<bool, AppError> {
    let client = MattermostClient::new(&url)?;
    client.ping().await
}

#[tauri::command]
pub async fn login(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    server_id: String,
    login_id: String,
    password: String,
) -> Result<LoginResponse, AppError> {
    let server_url = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound(format!("Server {} not found", server_id)))?;
        server.client.base_url().to_string()
    };

    let mut client = MattermostClient::new(&server_url)?;
    let user = client.login(&login_id, &password).await?;
    let token = client
        .token()
        .ok_or_else(|| AppError::Auth("No token received".into()))?
        .to_string();
    let teams = client.get_teams_for_user(&user.id).await?;

    {
        let mut servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        if let Some(server) = servers.get_mut(&server_id) {
            server.client = client;
            server.current_user = Some(user.clone());
        }
    }

    // Persist token and active server
    let _ = update_server_token(&app_handle, &server_id, Some(token.clone()));
    {
        let mut active = state.active_server_id.lock().map_err(|e| AppError::Config(e.to_string()))?;
        *active = Some(server_id.clone());
    }
    let _ = super::servers::save_active_server(&app_handle, Some(&server_id));

    Ok(LoginResponse { user, teams, token })
}

#[tauri::command]
pub async fn login_with_token(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    server_id: String,
    token: String,
) -> Result<LoginResponse, AppError> {
    let server_url = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound(format!("Server {} not found", server_id)))?;
        server.client.base_url().to_string()
    };

    let mut client = MattermostClient::new(&server_url)?;
    let user = client.login_with_token(&token).await?;
    let teams = client.get_teams_for_user(&user.id).await?;

    {
        let mut servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        if let Some(server) = servers.get_mut(&server_id) {
            server.client = client;
            server.current_user = Some(user.clone());
        }
    }

    // Persist token and active server
    let _ = update_server_token(&app_handle, &server_id, Some(token.clone()));
    {
        let mut active = state.active_server_id.lock().map_err(|e| AppError::Config(e.to_string()))?;
        *active = Some(server_id.clone());
    }
    let _ = super::servers::save_active_server(&app_handle, Some(&server_id));

    Ok(LoginResponse {
        user,
        teams,
        token,
    })
}

#[tauri::command]
pub async fn logout(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<(), AppError> {
    // Clone client out of lock, then await
    let client = {
        let mut servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        if let Some(server) = servers.get_mut(&server_id) {
            server.current_user = None;
            Some(server.client.clone())
        } else {
            None
        }
    };

    if let Some(mut client) = client {
        client.logout().await?;
        // Update the client in state (token cleared)
        let mut servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        if let Some(server) = servers.get_mut(&server_id) {
            server.client = client;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn get_me(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<User, AppError> {
    let client = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound(format!("Server {} not found", server_id)))?;
        server.client.clone()
    };

    client.get_me().await
}

#[tauri::command]
pub async fn validate_session(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<bool, AppError> {
    let client = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound(format!("Server {} not found", server_id)))?;
        server.client.clone()
    };

    match client.get_me().await {
        Ok(user) => {
            // Store current_user so list_servers shows connected=true
            let mut servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
            if let Some(server) = servers.get_mut(&server_id) {
                server.current_user = Some(user);
            }
            Ok(true)
        }
        Err(AppError::Api { status: 401, .. }) => Ok(false),
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub async fn connect_ws(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    server_id: String,
) -> Result<(), AppError> {
    let (ws_url, token) = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound(format!("Server {} not found", server_id)))?;
        let token = server
            .client
            .token()
            .ok_or_else(|| AppError::Auth("Not logged in".into()))?
            .to_string();
        let ws_url = server.client.websocket_url()?;
        (ws_url, token)
    };

    let ws_manager = WsManager::connect(
        app_handle,
        server_id.clone(),
        ws_url,
        token,
    );

    {
        let mut servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        if let Some(server) = servers.get_mut(&server_id) {
            // Disconnect old WS if any
            if let Some(old) = server.ws_manager.take() {
                old.disconnect();
            }
            server.ws_manager = Some(ws_manager);
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn disconnect_ws(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<(), AppError> {
    let mut servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
    if let Some(server) = servers.get_mut(&server_id) {
        if let Some(ws) = server.ws_manager.take() {
            ws.disconnect();
        }
    }
    Ok(())
}

/// Opens an SSO login window using the standard web OAuth flow.
/// After SSO completes and Mattermost sets the MMAUTHTOKEN cookie,
/// we read it directly from the webview's cookie store using Tauri's
/// cookies_for_url() API — no eval() or custom schemes needed.
#[tauri::command]
pub async fn open_sso_window(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    server_id: String,
    provider: String,
) -> Result<(), AppError> {
    let base_url = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound(format!("Server {} not found", server_id)))?;
        server.client.base_url().to_string()
    };

    let sso_path = match provider.as_str() {
        "gitlab" => "oauth/gitlab/login",
        "google" => "oauth/google/login",
        "office365" => "oauth/office365/login",
        "openid" => "oauth/openid/login",
        "saml" => "login/sso/saml",
        _ => return Err(AppError::Config(format!("Unknown SSO provider: {}", provider))),
    };

    let sso_url = format!("{}{}", base_url, sso_path);
    let server_origin = base_url.trim_end_matches('/').to_string();

    // Close existing SSO window if any
    if let Some(existing) = app_handle.get_webview_window("sso-login") {
        let _ = existing.close();
    }

    let title = format!("Sign in with {}{}", provider[..1].to_uppercase(), &provider[1..]);

    let sso_done = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let sso_done_flag = sso_done.clone();
    let origin_for_nav = server_origin.clone();

    let _sso_window = WebviewWindowBuilder::new(
        &app_handle,
        "sso-login",
        WebviewUrl::External(sso_url.parse().map_err(|e| AppError::Config(format!("Invalid SSO URL: {}", e)))?),
    )
    .title(&title)
    .inner_size(600.0, 700.0)
    .center()
    .resizable(true)
    .on_navigation(move |url| {
        let url_str = url.as_str();
        eprintln!("SSO navigation: {}", url_str);

        // After SSO, Mattermost redirects to server root (/) with MMAUTHTOKEN cookie set.
        // Detect when we land on the server page (not login/oauth/signup/error).
        let is_server_page = url_str.starts_with(&origin_for_nav)
            && !url_str.contains("/oauth/")
            && !url_str.contains("/login")
            && !url_str.contains("/signup")
            && !url_str.contains("/error")
            && !url_str.contains("/api/");

        if is_server_page {
            eprintln!("SSO completed, detected server page: {}", url_str);
            sso_done_flag.store(true, std::sync::atomic::Ordering::Relaxed);
        }

        true
    })
    .build()
    .map_err(|e| AppError::Config(format!("Failed to open SSO window: {}", e)))?;

    // Spawn a task that waits for SSO to complete, then reads MMAUTHTOKEN
    // from the webview's cookie store using Tauri's native cookie API.
    let app2 = app_handle.clone();
    let flag = sso_done;
    let server_url_for_cookies = server_origin;
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;

            if app2.get_webview_window("sso-login").is_none() {
                eprintln!("SSO window closed, stopping poll");
                break;
            }

            if !flag.load(std::sync::atomic::Ordering::Relaxed) {
                continue;
            }

            eprintln!("SSO flag detected, extracting token from cookies...");
            // Wait a moment for cookies to be fully set
            tokio::time::sleep(std::time::Duration::from_millis(1000)).await;

            let win = match app2.get_webview_window("sso-login") {
                Some(w) => w,
                None => break,
            };

            // Read cookies from the webview's cookie store
            let cookie_url: url::Url = match server_url_for_cookies.parse() {
                Ok(u) => u,
                Err(e) => {
                    eprintln!("SSO: failed to parse server URL: {}", e);
                    break;
                }
            };

            for attempt in 0..5 {
                if attempt > 0 {
                    tokio::time::sleep(std::time::Duration::from_millis(2000)).await;
                }

                let win = match app2.get_webview_window("sso-login") {
                    Some(w) => w,
                    None => return,
                };

                match win.cookies_for_url(cookie_url.clone()) {
                    Ok(cookies) => {
                        eprintln!("SSO cookies (attempt {}): {} cookies found", attempt, cookies.len());
                        for cookie in &cookies {
                            eprintln!("  cookie: {} (len={})", cookie.name(), cookie.value().len());
                        }

                        // Find MMAUTHTOKEN
                        if let Some(auth_cookie) = cookies.iter().find(|c| c.name() == "MMAUTHTOKEN") {
                            let token = auth_cookie.value().to_string();
                            eprintln!("SSO token extracted from cookie!");

                            let _ = app2.emit("sso-token", SsoTokenPayload { token });

                            if let Some(main_win) = app2.get_webview_window("main") {
                                let _ = main_win.show();
                                let _ = main_win.set_focus();
                            }
                            let _ = win.close();
                            return;
                        }
                    }
                    Err(e) => {
                        eprintln!("SSO cookies read error (attempt {}): {}", attempt, e);
                    }
                }
            }

            eprintln!("SSO: failed to extract token from cookies after all attempts");
            break;
        }
    });

    Ok(())
}

/// Complete SSO login by accepting the token extracted from the SSO webview
#[tauri::command]
pub async fn complete_sso_login(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    server_id: String,
    token: String,
) -> Result<LoginResponse, AppError> {
    let server_url = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound(format!("Server {} not found", server_id)))?;
        server.client.base_url().to_string()
    };

    let mut client = MattermostClient::new(&server_url)?;
    let user = client.login_with_token(&token).await?;
    let teams = client.get_teams_for_user(&user.id).await?;

    {
        let mut servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        if let Some(server) = servers.get_mut(&server_id) {
            server.client = client;
            server.current_user = Some(user.clone());
        }
    }

    let _ = update_server_token(&app_handle, &server_id, Some(token.clone()));
    {
        let mut active = state.active_server_id.lock().map_err(|e| AppError::Config(e.to_string()))?;
        *active = Some(server_id.clone());
    }
    let _ = super::servers::save_active_server(&app_handle, Some(&server_id));

    Ok(LoginResponse { user, teams, token })
}
