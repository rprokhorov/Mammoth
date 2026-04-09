use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use tauri::Emitter;
use tokio::sync::watch;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

use super::events::*;

/// Manages a WebSocket connection to a single Mattermost server
pub struct WsManager {
    shutdown_tx: watch::Sender<bool>,
}

impl WsManager {
    /// Spawn a new WebSocket connection task.
    /// Returns a WsManager that can be used to stop the connection.
    pub fn connect(
        app_handle: tauri::AppHandle,
        server_id: String,
        ws_url: String,
        token: String,
    ) -> Self {
        let (shutdown_tx, shutdown_rx) = watch::channel(false);

        tokio::spawn(ws_loop(
            app_handle,
            server_id,
            ws_url,
            token,
            shutdown_rx,
        ));

        Self { shutdown_tx }
    }

    /// Stop the WebSocket connection
    pub fn disconnect(&self) {
        let _ = self.shutdown_tx.send(true);
    }
}

impl Drop for WsManager {
    fn drop(&mut self) {
        self.disconnect();
    }
}

async fn ws_loop(
    app_handle: tauri::AppHandle,
    server_id: String,
    ws_url: String,
    token: String,
    mut shutdown_rx: watch::Receiver<bool>,
) {
    let mut backoff = Duration::from_secs(1);
    let max_backoff = Duration::from_secs(30);

    loop {
        if *shutdown_rx.borrow() {
            log::info!("[WS:{}] Shutdown requested", server_id);
            return;
        }

        log::info!("[WS:{}] Connecting to {}", server_id, ws_url);

        // Emit connection status
        let _ = app_handle.emit("ws_status", serde_json::json!({
            "server_id": &server_id,
            "status": "connecting",
        }));

        match connect_async(&ws_url).await {
            Ok((ws_stream, _)) => {
                log::info!("[WS:{}] Connected", server_id);
                backoff = Duration::from_secs(1); // Reset backoff on success

                let _ = app_handle.emit("ws_status", serde_json::json!({
                    "server_id": &server_id,
                    "status": "connected",
                }));

                let (mut write, mut read) = ws_stream.split();

                // Send authentication
                let auth = WsAuthChallenge {
                    seq: 1,
                    action: "authentication_challenge".to_string(),
                    data: WsAuthData {
                        token: token.clone(),
                    },
                };
                if let Ok(auth_json) = serde_json::to_string(&auth) {
                    if let Err(e) = write.send(Message::Text(auth_json.into())).await {
                        log::error!("[WS:{}] Failed to send auth: {}", server_id, e);
                        continue;
                    }
                }

                // Read loop
                loop {
                    tokio::select! {
                        _ = shutdown_rx.changed() => {
                            if *shutdown_rx.borrow() {
                                log::info!("[WS:{}] Shutdown during read loop", server_id);
                                let _ = write.send(Message::Close(None)).await;
                                return;
                            }
                        }
                        msg = read.next() => {
                            match msg {
                                Some(Ok(Message::Text(text))) => {
                                    handle_message(&app_handle, &server_id, &text);
                                }
                                Some(Ok(Message::Ping(data))) => {
                                    let _ = write.send(Message::Pong(data)).await;
                                }
                                Some(Ok(Message::Close(_))) => {
                                    log::info!("[WS:{}] Server closed connection", server_id);
                                    break;
                                }
                                Some(Err(e)) => {
                                    log::error!("[WS:{}] Error: {}", server_id, e);
                                    break;
                                }
                                None => {
                                    log::info!("[WS:{}] Stream ended", server_id);
                                    break;
                                }
                                _ => {}
                            }
                        }
                    }
                }
            }
            Err(e) => {
                log::error!("[WS:{}] Connection failed: {}", server_id, e);
            }
        }

        // Emit disconnected status
        let _ = app_handle.emit("ws_status", serde_json::json!({
            "server_id": &server_id,
            "status": "disconnected",
        }));

        if *shutdown_rx.borrow() {
            return;
        }

        // Exponential backoff with jitter
        let jitter = Duration::from_millis(rand_jitter());
        let wait = backoff + jitter;
        log::info!("[WS:{}] Reconnecting in {:?}", server_id, wait);

        tokio::select! {
            _ = tokio::time::sleep(wait) => {}
            _ = shutdown_rx.changed() => {
                if *shutdown_rx.borrow() {
                    return;
                }
            }
        }

        backoff = std::cmp::min(backoff * 2, max_backoff);
    }
}

fn handle_message(app_handle: &tauri::AppHandle, server_id: &str, text: &str) {
    // Try parsing as a WS response (auth reply) first
    if let Ok(resp) = serde_json::from_str::<WsResponse>(text) {
        if !resp.status.is_empty() {
            if resp.status == "OK" {
                log::info!("[WS:{}] Authenticated successfully", server_id);
            } else if let Some(err) = resp.error {
                log::error!("[WS:{}] Auth error: {:?}", server_id, err);
            }
            return;
        }
    }

    // Parse as event
    match serde_json::from_str::<WsEvent>(text) {
        Ok(event) => {
            log::debug!("[WS:{}] Event: {}", server_id, event.event);
            let frontend_event = FrontendWsEvent {
                server_id: server_id.to_string(),
                event: event.event.clone(),
                data: event.data,
                broadcast: event.broadcast,
            };

            let _ = app_handle.emit("ws_event", &frontend_event);
        }
        Err(e) => {
            log::debug!("[WS:{}] Unparsed message: {} ({})", server_id, text, e);
        }
    }
}

fn rand_jitter() -> u64 {
    // Simple pseudo-random jitter 0-500ms without extra deps
    let t = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos();
    (t % 500) as u64
}
