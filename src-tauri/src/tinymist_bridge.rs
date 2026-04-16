//! In-process tinymist LSP: custom `sync-ls` channels + Tauri IPC (no stdio / no sidecar binary).
//!
//! **Workspace roots:** The web client sends `initialize.rootUri` / `workspaceFolders` using the same
//! absolute project paths as `tauri-plugin-fs` (desktop `currentFolder`, iOS `iosProjectPath`). Keep
//! LSP `file://` URIs aligned with Monaco model URIs and on-disk paths.

use std::sync::LazyLock;

use sync_ls::{Connection, LspBuilder, LspClientRoot, LspMessage, TConnectionRx, TConnectionTx};
use tauri::{AppHandle, Emitter, Manager};
use tinymist::{InitLogOpts, RegularInit, ServerState};
use tinymist::world::CompileFontArgs;

struct TinymistRuntimes {
    tokio: tokio::runtime::Runtime,
}

static TINYMIST_RUNTIMES: LazyLock<TinymistRuntimes> = LazyLock::new(|| TinymistRuntimes {
    tokio: tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("tokio runtime for tinymist"),
});

/// Holds the sender for JSON-RPC messages **editor → language server** (LSP inbound).
pub struct TinymistLspState {
    pub incoming_tx: crossbeam_channel::Sender<sync_ls::Message>,
}

fn lsp_wire_json(msg: &sync_ls::Message) -> serde_json::Value {
    let m = match msg {
        sync_ls::Message::Lsp(m) => m,
    };
    let mut v = serde_json::to_value(m).unwrap_or_else(|_| serde_json::json!({}));
    if let serde_json::Value::Object(ref mut map) = v {
        map.entry("jsonrpc").or_insert(serde_json::json!("2.0"));
    }
    v
}

/// Starts tinymist on a background thread and an outbound pump that emits `tinymist-lsp` events.
pub fn spawn_tinymist_lsp(app: AppHandle) -> Result<(), String> {
    let _ = tinymist::init_log(InitLogOpts {
        is_transient_cmd: false,
        is_test_no_verbose: false,
        output: None,
    })
    .map_err(|e| e.to_string())?;

    let (event_tx, event_rx) = crossbeam_channel::unbounded::<sync_ls::Event>();
    let (to_editor_tx, to_editor_rx) = crossbeam_channel::bounded::<sync_ls::Message>(0);
    let (from_editor_tx, from_editor_rx) = crossbeam_channel::bounded::<sync_ls::Message>(0);

    let conn: Connection<LspMessage> = Connection {
        sender: TConnectionTx::new(event_tx, to_editor_tx),
        receiver: TConnectionRx::new(event_rx, from_editor_rx),
    };

    let client = LspClientRoot::new(
        TINYMIST_RUNTIMES.tokio.handle().clone(),
        conn.sender,
    );

    let inbox = conn.receiver;
    std::thread::Builder::new()
        .name("tinymist-lsp".into())
        .spawn(move || {
            // `LsDriver` is not `Send`; build and run it only on this thread (same as stdio main thread).
            let mut driver = ServerState::install_lsp(LspBuilder::new(
                RegularInit {
                    client: client.weak().to_typed(),
                    font_opts: CompileFontArgs::default(),
                    exec_cmds: Vec::new(),
                },
                client.weak(),
            ))
            .build();
            if let Err(e) = driver.start(inbox, false) {
                log::error!("tinymist LSP server ended: {e:?}");
            }
        })
        .map_err(|e| e.to_string())?;

    let emit_handle = app.clone();
    std::thread::Builder::new()
        .name("tinymist-lsp-out".into())
        .spawn(move || {
            while let Ok(msg) = to_editor_rx.recv() {
                let payload = lsp_wire_json(&msg);
                let _ = emit_handle.emit("tinymist-lsp", payload);
            }
        })
        .map_err(|e| e.to_string())?;

    app.manage(TinymistLspState {
        incoming_tx: from_editor_tx,
    });

    Ok(())
}

/// Push one JSON-RPC message (body only, as sent over LSP) into the language server.
#[tauri::command(rename_all = "camelCase")]
pub fn tinymist_lsp_send(
    state: tauri::State<'_, TinymistLspState>,
    message: serde_json::Value,
) -> Result<(), String> {
    let lsp: LspMessage =
        serde_json::from_value(message).map_err(|e| format!("invalid LSP JSON: {e}"))?;
    state
        .incoming_tx
        .send(sync_ls::Message::Lsp(lsp))
        .map_err(|_| "tinymist LSP channel closed".to_string())
}
