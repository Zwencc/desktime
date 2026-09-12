use crate::llm::{self, AppGuess, AppRef, Context, Endpoint, Line};

/// Writes the API key next to the executable. There is no command to read it
/// back — the point of storing it here is that the webview never sees it again.
#[tauri::command]
pub fn set_llm_key(key: String) -> Result<(), String> {
    llm::store_key(key.trim()).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn has_llm_key() -> bool {
    llm::has_key()
}

/// Asks the configured endpoint for one line. Every failure is the caller's cue
/// to use the local line library instead, so the error text is for diagnosis
/// only and is never shown in place of a line.
#[tauri::command]
pub async fn llm_line(endpoint: Endpoint, context: Context) -> Result<Line, String> {
    llm::complete(endpoint, context)
        .await
        .map_err(|error| error.to_string())
}

/// Guesses a category for a batch of applications the built-in tables did not
/// recognise. Unlike `llm_line` this is user-initiated — nothing sends
/// application names anywhere until the button is pressed.
#[tauri::command]
pub async fn llm_classify(endpoint: Endpoint, apps: Vec<AppRef>) -> Result<Vec<AppGuess>, String> {
    llm::classify(endpoint, apps)
        .await
        .map_err(|error| error.to_string())
}
