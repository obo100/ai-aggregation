#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::thread;
use std::time::Duration;

use tauri::menu::{Menu, MenuItemBuilder};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{
  image::Image, Emitter, EventTarget, Manager, UserAttentionType, WebviewUrl,
  WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, Modifiers, ShortcutState};

#[tauri::command]
fn eval_webview(app: tauri::AppHandle, label: String, script: String) -> Result<(), String> {
  let webview = app
    .get_webview(&label)
    .ok_or_else(|| format!("webview not found: {}", label))?;
  webview.eval(script).map_err(|error| error.to_string())
}

fn create_main_window(app: &tauri::AppHandle) -> Result<tauri::WebviewWindow, tauri::Error> {
  WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
    .title("AI Aggregation")
    .inner_size(980.0, 720.0)
    .visible(false)
    .build()
}

fn create_quick_window(app: &tauri::AppHandle) -> Result<tauri::WebviewWindow, tauri::Error> {
  let mut builder =
    WebviewWindowBuilder::new(app, "quick", WebviewUrl::App("index.html#/quick".into()))
      .title("Quick Prompt")
      .inner_size(720.0, 154.0)
      .center()
      .resizable(false)
      .decorations(false)
      .always_on_top(true)
      .shadow(true)
      .skip_taskbar(true)
      .visible(false);

  #[cfg(not(target_os = "macos"))]
  {
    builder = builder.transparent(true);
  }

  builder.build()
}

#[tauri::command]
fn show_quick_window(app: tauri::AppHandle) -> Result<(), String> {
  let window = if let Some(existing) = app.get_webview_window("quick") {
    existing
  } else {
    create_quick_window(&app).map_err(|error| error.to_string())?
  };

  let _ = window.set_focusable(true);
  let _ = window.show();
  let _ = window.unminimize();
  let _ = window.set_focus();
  let _ = window.request_user_attention(Some(UserAttentionType::Informational));
  let window_clone = window.clone();
  thread::spawn(move || {
    thread::sleep(Duration::from_millis(120));
    let _ = window_clone.set_focus();
    thread::sleep(Duration::from_millis(240));
    let _ = window_clone.set_focus();
  });
  Ok(())
}

fn show_main_window(app: &tauri::AppHandle) {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
    return;
  }
  if let Some(window) = app.get_window("main") {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
    return;
  }
  if let Ok(window) = create_main_window(app) {
    let _ = window.show();
    let _ = window.set_focus();
  }
}

fn open_settings(app: &tauri::AppHandle) {
  show_main_window(app);
  let _ = app.emit_to(
    EventTarget::Window {
      label: "main".into(),
    },
    "open-settings",
    (),
  );
}

fn main() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![eval_webview, show_quick_window])
    .plugin(
      tauri_plugin_global_shortcut::Builder::new()
        .with_shortcut("Esc")
        .expect("register Esc shortcut")
        .with_handler(|app, shortcut, event| {
          if event.state != ShortcutState::Pressed {
            return;
          }
          if shortcut.key != Code::Escape || shortcut.mods != Modifiers::empty() {
            return;
          }
          if let Some(window) = app.get_webview_window("quick") {
            let focused = window.is_focused().unwrap_or(false);
            let visible = window.is_visible().unwrap_or(false);
            if focused || visible {
              let _ = window.hide();
              return;
            }
          }
          if let Some(window) = app.get_webview_window("main") {
            let focused = window.is_focused().unwrap_or(false);
            let visible = window.is_visible().unwrap_or(false);
            if focused || visible {
              let _ = window.hide();
            }
          }
        })
        .build(),
    )
    .setup(|app| {
      create_quick_window(&app.handle())?;

      if let Ok(icon) = Image::from_bytes(include_bytes!("../icons/icon.png")) {
        let settings_item = MenuItemBuilder::with_id("settings", "设置中心").build(app)?;
        let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;
        let tray_menu = Menu::with_items(app, &[&settings_item, &quit_item])?;

        TrayIconBuilder::new()
          .icon(icon)
          .tooltip("AI Aggregation")
          .menu(&tray_menu)
          .show_menu_on_left_click(false)
          .on_menu_event(|app, event| {
            if event.id().as_ref() == "settings" {
              open_settings(app);
            }
            if event.id().as_ref() == "quit" {
              app.exit(0);
            }
          })
          .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button, .. } = event {
              if button == MouseButton::Left {
                show_main_window(tray.app_handle());
              }
            }
          })
          .build(app)?;
      }

      Ok(())
    })
    .on_window_event(|window, event| {
      if let WindowEvent::CloseRequested { api, .. } = event {
        if window.label() == "main" || window.label() == "quick" {
          api.prevent_close();
          let _ = window.hide();
        }
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
