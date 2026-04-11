//! macOS notification system using NSUserNotification with a persistent delegate.
//!
//! Fixes two bugs:
//! 1. Multiple notifications: each notification carries its own channel_id in userInfo,
//!    so clicking any notification navigates to the correct channel.
//! 2. Cold-start clicks: the delegate is set up at app startup and stores pending
//!    channel_ids for notifications clicked before the frontend is ready.

#![allow(deprecated)] // NSUserNotification is deprecated but functional on macOS

use std::sync::{Mutex, OnceLock};
use objc2::rc::Retained;
use objc2::runtime::{AnyObject, ProtocolObject};
use objc2::{define_class, msg_send, AllocAnyThread};
use objc2_foundation::{
    NSDictionary, NSObject, NSObjectProtocol, NSString,
    NSUserNotification, NSUserNotificationCenter, NSUserNotificationCenterDelegate,
};
use tauri::{AppHandle, Emitter, Manager};

/// Stored app handle for use in the delegate callback.
static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

/// Pending channel_id from a notification click that arrived before the frontend was ready.
static PENDING_CHANNEL: Mutex<Option<String>> = Mutex::new(None);

/// Stored delegate to prevent deallocation.
static DELEGATE: OnceLock<Retained<NotifDelegate>> = OnceLock::new();

// Define the custom delegate class
define_class!(
    #[unsafe(super(NSObject))]
    #[name = "MattermostNotifDelegate"]
    struct NotifDelegate;

    impl NotifDelegate {}

    unsafe impl NSObjectProtocol for NotifDelegate {}

    unsafe impl NSUserNotificationCenterDelegate for NotifDelegate {
        #[unsafe(method(userNotificationCenter:didActivateNotification:))]
        fn did_activate(
            &self,
            center: &NSUserNotificationCenter,
            notification: &NSUserNotification,
        ) {
            handle_notification_click(notification);
            center.removeDeliveredNotification(notification);
        }

        #[unsafe(method(userNotificationCenter:shouldPresentNotification:))]
        fn should_present(
            &self,
            _center: &NSUserNotificationCenter,
            _notification: &NSUserNotification,
        ) -> bool {
            // Always show the notification even if the app is in foreground
            true
        }
    }
);

fn handle_notification_click(notification: &NSUserNotification) {
    let channel_id = unsafe {
        notification.userInfo().and_then(|info| {
            let key = NSString::from_str("channel_id");
            info.objectForKey(&key).map(|val| {
                // val is Retained<AnyObject>, we know it's an NSString
                let ns_str: &NSString = &*(Retained::as_ptr(&val) as *const NSString);
                ns_str.to_string()
            })
        })
    };

    let Some(channel_id) = channel_id else { return };
    log::info!("[notif] click channel_id={}", channel_id);

    if let Some(app) = APP_HANDLE.get() {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
            match window.emit("notif:navigate-channel", &channel_id) {
                Ok(_) => return,
                Err(e) => log::warn!("[notif] emit failed: {}, storing as pending", e),
            }
        }
    }

    // Frontend not ready — store for later retrieval
    if let Ok(mut pending) = PENDING_CHANNEL.lock() {
        *pending = Some(channel_id);
    }
}

/// Set up the notification delegate. Call once during app setup.
pub fn setup_notification_delegate(app_handle: AppHandle) {
    APP_HANDLE.set(app_handle).ok();

    let delegate = NotifDelegate::alloc().set_ivars(());
    let delegate: Retained<NotifDelegate> = unsafe { msg_send![super(delegate), init] };

    let center = NSUserNotificationCenter::defaultUserNotificationCenter();
    unsafe {
        let proto: &ProtocolObject<dyn NSUserNotificationCenterDelegate> =
            ProtocolObject::from_ref(delegate.as_ref() as &NotifDelegate);
        center.setDelegate(Some(proto));
    }

    // Store delegate to prevent deallocation
    DELEGATE.set(delegate).ok();
}

/// Send a notification with channel_id stored in userInfo.
pub fn send_notification(title: &str, body: &str, channel_id: &str) {
    let notification = NSUserNotification::new();

    let ns_title = NSString::from_str(title);
    let ns_body = NSString::from_str(body);
    notification.setTitle(Some(&ns_title));
    notification.setInformativeText(Some(&ns_body));

    // Build userInfo dictionary with channel_id
    let key = NSString::from_str("channel_id");
    let value = NSString::from_str(channel_id);
    // Cast NSString Retained to AnyObject Retained for the dictionary
    let value_obj: Retained<AnyObject> = Retained::into_super(Retained::into_super(value));
    let keys: &[&NSString] = &[&key];
    let objects: &[Retained<AnyObject>] = &[value_obj];
    let user_info = NSDictionary::from_retained_objects(keys, objects);
    unsafe {
        notification.setUserInfo(Some(&user_info));
    }

    // Set default sound
    let default_sound = NSString::from_str("NSUserNotificationDefaultSoundName");
    notification.setSoundName(Some(&default_sound));

    let center = NSUserNotificationCenter::defaultUserNotificationCenter();
    center.deliverNotification(&notification);
}

/// Take and return any pending channel_id from a cold-start notification click.
pub fn take_pending_channel_id() -> Option<String> {
    PENDING_CHANNEL.lock().ok().and_then(|mut p| p.take())
}
