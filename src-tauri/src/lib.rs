mod commands;
mod errors;
mod mattermost;
#[cfg(target_os = "macos")]
mod notifications;
mod state;
mod storage;
mod tray;

use tauri::{
    menu::{Menu, MenuItemBuilder, PredefinedMenuItem},
    Emitter, Manager,
};
use state::AppState;

#[tauri::command]
fn show_notification(title: String, body: String, channel_id: String) {
    #[cfg(target_os = "macos")]
    notifications::send_notification(&title, &body, &channel_id);
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (title, body, channel_id);
    }
}

#[tauri::command]
fn check_pending_notification() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        notifications::take_pending_channel_id()
    }
    #[cfg(not(target_os = "macos"))]
    {
        None
    }
}

#[tauri::command]
fn show_main_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}


#[tauri::command]
fn set_badge_count(app: tauri::AppHandle, count: u32) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id("main-tray") {
        if count > 0 {
            let _ = tray.set_tooltip(Some(&format!("Mattermost Desktop — {} unread", count)));
        } else {
            let _ = tray.set_tooltip(Some("Mattermost Desktop"));
        }
    }

    // macOS dock badge / Linux badge count
    if let Some(window) = app.get_webview_window("main") {
        if count > 0 {
            let _ = window.set_badge_count(Some(count as i64));
        } else {
            let _ = window.set_badge_count(None);
        }
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(app_state)
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            if id == "shortcuts" {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("menu:shortcuts", ());
                }
            }
        })
        .setup(|app| {
            // Start from the OS default menu (includes App, Edit, View, Window, Help)
            let menu = Menu::default(app.handle())?;

            // Build "Window > Keyboard Shortcuts" submenu entry and append to existing Window menu
            let shortcuts_item = MenuItemBuilder::with_id("shortcuts", "Keyboard Shortcuts")
                .accelerator("CmdOrCtrl+/")
                .build(app)?;
            let separator = PredefinedMenuItem::separator(app)?;

            // Find the Window submenu and prepend our item to it
            let items = menu.items()?;
            for item in &items {
                if let tauri::menu::MenuItemKind::Submenu(sub) = item {
                    if sub.text()?.starts_with("Window") {
                        sub.prepend(&separator)?;
                        sub.prepend(&shortcuts_item)?;
                        break;
                    }
                }
            }

            app.set_menu(menu)?;

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Set up macOS notification delegate
            #[cfg(target_os = "macos")]
            notifications::setup_notification_delegate(app.handle().clone());

            // Create system tray
            if let Err(e) = tray::create_tray(app.handle()) {
                log::warn!("Failed to create tray: {}", e);
            }

            // Restore saved servers from config
            let state = app.state::<AppState>();
            if let Err(e) = commands::servers::restore_servers(app.handle(), &state) {
                log::warn!("Failed to restore servers: {}", e);
            }

            // Close-to-tray: hide window instead of quitting
            let main_window = app.get_webview_window("main");
            if let Some(window) = main_window {
                let w = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = w.hide();
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Auth
            commands::ping_server,
            commands::login,
            commands::login_with_token,
            commands::open_sso_window,
            commands::complete_sso_login,
            commands::logout,
            commands::get_me,
            commands::validate_session,
            // Servers
            commands::add_server,
            commands::remove_server,
            commands::list_servers,
            commands::set_active_server,
            commands::get_active_server,
            // WebSocket
            commands::connect_ws,
            commands::disconnect_ws,
            // Teams
            commands::get_teams,
            // Channels
            commands::get_channels_for_team,
            commands::get_channel,
            commands::view_channel,
            commands::get_channel_last_viewed_at,
            commands::get_users_by_ids,
            commands::autocomplete_users,
            commands::search_users,
            // Messages
            commands::get_posts,
            commands::get_posts_around_last_unread,
            commands::send_post,
            commands::edit_post,
            commands::delete_post,
            commands::do_post_action,
            commands::autocomplete_slash_commands,
            commands::execute_slash_command,
            // Threads
            commands::get_post_thread,
            commands::get_user_threads,
            commands::get_thread,
            commands::follow_thread,
            commands::unfollow_thread,
            commands::mark_thread_as_read,
            // Files
            commands::upload_file,
            commands::get_file_info,
            commands::get_file_url,
            commands::get_image_data,
            commands::get_image_thumbnail,
            commands::get_custom_emojis,
            commands::get_custom_emoji_image,
            commands::get_user_avatar,
            commands::read_local_file_as_data_url,
            commands::save_temp_file,
            commands::download_file,
            // Search
            commands::search_posts,
            // Channel Management
            commands::create_channel,
            commands::update_channel,
            commands::archive_channel,
            commands::leave_channel,
            commands::create_direct_channel,
            commands::search_channels,
            commands::add_user_to_channel,
            // Reactions & Pins
            commands::add_reaction,
            commands::remove_reaction,
            commands::get_reactions,
            commands::pin_post,
            commands::unpin_post,
            commands::save_post,
            commands::unsave_post,
            commands::get_saved_posts,
            commands::get_pinned_posts,
            commands::get_channel_members_list,
            commands::get_channel_files,
            // Profile
            commands::get_user_profile,
            commands::update_profile,
            commands::upload_avatar,
            commands::get_profile_image_url,
            commands::set_user_status,
            // Custom Status & Favorites & Notification Prefs
            commands::set_custom_status,
            commands::clear_custom_status,
            commands::get_channel_notify_props,
            commands::update_channel_notify_props,
            commands::get_favorite_channels,
            commands::toggle_favorite_channel,
            // Sidebar Categories
            commands::get_sidebar_categories,
            commands::create_sidebar_category,
            commands::update_sidebar_category,
            commands::delete_sidebar_category,
            // Server utils
            commands::get_server_version,
            commands::clear_app_cache,
            commands::open_url,
            // Tray / Badge / Notifications
            set_badge_count,
            show_main_window,
            show_notification,
            check_pending_notification,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Reopen { .. } = event {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        });
}
