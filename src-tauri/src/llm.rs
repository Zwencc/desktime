//! Optional LLM line generation.
//!
//! Off by default, and an enhancement rather than a dependency: every failure
//! path — no key, bad endpoint, timeout, malformed JSON — returns an error that
//! the frontend turns straight back into a local line. Nothing here can block
//! the widget.
//!
//! Two things live in Rust rather than in the webview, and both are deliberate:
//!
//! * **The API key.** It is written to the app data directory and read here. The
//!   frontend can set it and ask whether one exists, but can never read it back,
//!   so the key is not sitting in localStorage for anything running in the page
//!   to pick up.
//! * **The prompt.** `Context` below is the *entire* vocabulary the model is
//!   ever told about. There is no field for an application name, a window title
//!   or a schedule entry — the privacy rule is enforced by the shape of the
//!   struct rather than by remembering not to fill one in.

use std::path::PathBuf;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::error::{BackendError, BackendResult};

pub const KEY_FILE: &str = "llm.key";
const MAX_TIMEOUT_MS: u64 = 30_000;

const SYSTEM_PROMPT: &str = concat!(
    "你是一个毒舌但善良的打工人陪伴助手。根据给出的工作状态，写一句中文台词，",
    "可以吐槽、调侃或安慰，不超过 30 个字，不要说教，不要emoji以外的符号堆砌。",
    "只输出 JSON，不要任何解释或代码块标记，格式为：",
    r#"{"line":"台词","tone":"sarcastic|warm|angry","emoji":"一个emoji"}"#
);

const CLASSIFY_PROMPT: &str = concat!(
    "你会拿到一批 Windows 程序，每行是「可执行文件名 — 产品名」，产品名可能缺失。",
    "为每一个判断它属于哪一类。类别只能是这七个之一：",
    "chat, dev, office, browser, media, design, other。拿不准就用 other。",
    "只输出 JSON 数组，不要任何解释或代码块标记，格式为：",
    r#"[{"exe":"code.exe","category":"dev"}]"#
);

/// Everything the model is ever told. Adding a field here is the only way to
/// widen what leaves the machine, which is the point of it being a closed type.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Context {
    pub mood: String,
    pub modifier: String,
    /// 0-1.
    pub loss: f64,
    pub slack: f64,
    pub intensity: f64,
    pub present_minutes: u32,
    pub overtime_minutes: u32,
    pub meeting_minutes: u32,
    /// Only present when the user turned salary sharing on.
    #[serde(default)]
    pub hourly: Option<f64>,
    #[serde(default)]
    pub wasted: Option<f64>,
    /// The interface language, so the model answers in it.
    ///
    /// The prompt itself is **not** translated — it is an instruction to a
    /// model, not interface text — but the reply has to match the language the
    /// user is reading. This is the only field here that varies with locale,
    /// and it says nothing about the user beyond which language they picked.
    #[serde(default)]
    pub language: Option<String>,
}

/// One application to be classified, and a **separate type from [`Context`] on
/// purpose**.
///
/// `Context` has no field for an application name and must never grow one — the
/// mood line's privacy rule is enforced by its shape, not by remembering. This
/// request cannot do its job without application names, so it gets its own
/// closed type and its own prompt, and neither can widen the other. What that
/// buys is still a boundary and not a hole: an executable name and a product
/// name say *which program*, never what is open in it.
#[derive(Debug, Deserialize)]
pub struct AppRef {
    pub exe: String,
    /// From the executable's version resource; empty when there was none.
    #[serde(default)]
    pub product: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct AppGuess {
    pub exe: String,
    pub category: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Endpoint {
    pub base_url: String,
    pub model: String,
    pub timeout_ms: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Line {
    pub line: String,
    #[serde(default)]
    pub tone: String,
    #[serde(default)]
    pub emoji: String,
}

#[derive(Serialize)]
struct ChatMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Serialize)]
struct ChatRequest<'a> {
    model: &'a str,
    messages: Vec<ChatMessage<'a>>,
    temperature: f32,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: ChatMessageOut,
}

#[derive(Deserialize)]
struct ChatMessageOut {
    content: String,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

/// Next to the executable, like every other piece of user data — see config.rs.
/// The key is still the one thing that never travels to the webview: there is no
/// command that reads it back, only ones that write it and ask whether it exists.
fn key_path() -> BackendResult<PathBuf> {
    let dir = crate::devmode::root_dir();
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join(KEY_FILE))
}

pub fn store_key(key: &str) -> BackendResult<()> {
    let path = key_path()?;
    if key.is_empty() {
        // An empty key means "forget it", so the file goes away rather than
        // being left behind holding nothing.
        if path.exists() {
            std::fs::remove_file(path)?;
        }
        return Ok(());
    }
    std::fs::write(path, key)?;
    Ok(())
}

pub fn has_key() -> bool {
    key_path().map(|path| path.exists()).unwrap_or(false)
}

fn read_key() -> BackendResult<String> {
    let key = std::fs::read_to_string(key_path()?)?;
    let key = key.trim().to_owned();
    if key.is_empty() {
        return Err(BackendError::LlmUnavailable("no api key"));
    }
    Ok(key)
}

fn describe(context: &Context) -> String {
    let mut lines = vec![
        format!("当前状态：{}（{}）", context.mood, context.modifier),
        format!(
            "亏损率 {}%，摸鱼率 {}%，当下强度 {}%",
            (context.loss * 100.0).round(),
            (context.slack * 100.0).round(),
            (context.intensity * 100.0).round()
        ),
        format!(
            "今日在岗 {} 分钟，加班 {} 分钟，会议 {} 分钟",
            context.present_minutes, context.overtime_minutes, context.meeting_minutes
        ),
    ];

    if let Some(hourly) = context.hourly {
        lines.push(format!("基准时薪 {hourly:.2}"));
    }
    if let Some(wasted) = context.wasted {
        lines.push(format!("今日白干 {wasted:.2}"));
    }

    // Last, so it is the instruction closest to the answer.
    if let Some(language) = context.language.as_deref().filter(|value| !value.is_empty()) {
        lines.push(format!("用 {language} 回答"));
    }

    lines.join("\n")
}

/// Models like to wrap JSON in a fenced block however firmly they are asked not
/// to, so one layer of fencing is peeled off before parsing.
fn unfence(content: &str) -> &str {
    let trimmed = content.trim();
    let Some(rest) = trimmed.strip_prefix("```") else {
        return trimmed;
    };
    let body = rest.strip_prefix("json").unwrap_or(rest);
    body.trim_end_matches('`').trim()
}

/// One round trip, shared by both callers. Each of them owns its own prompt and
/// its own closed input type; what they share is only the transport.
async fn chat(
    endpoint: &Endpoint,
    system: &str,
    user: &str,
    temperature: f32,
) -> BackendResult<String> {
    let key = read_key()?;
    let base = endpoint.base_url.trim_end_matches('/');

    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(endpoint.timeout_ms.min(MAX_TIMEOUT_MS)))
        .build()?;

    let response = client
        .post(format!("{base}/chat/completions"))
        .bearer_auth(key)
        .json(&ChatRequest {
            model: &endpoint.model,
            messages: vec![
                ChatMessage {
                    role: "system",
                    content: system,
                },
                ChatMessage {
                    role: "user",
                    content: user,
                },
            ],
            temperature,
        })
        .send()
        .await?;

    if !response.status().is_success() {
        return Err(BackendError::LlmUnavailable("endpoint rejected the request"));
    }

    let body: ChatResponse = response.json().await?;
    let content = body
        .choices
        .into_iter()
        .next()
        .map(|choice| choice.message.content)
        .ok_or(BackendError::LlmUnavailable("empty response"))?;

    Ok(content)
}

pub async fn complete(endpoint: Endpoint, context: Context) -> BackendResult<Line> {
    let content = chat(&endpoint, SYSTEM_PROMPT, &describe(&context), 1.0).await?;

    let line: Line = serde_json::from_str(unfence(&content))
        .map_err(|_| BackendError::LlmUnavailable("response was not the requested JSON"))?;

    if line.line.trim().is_empty() {
        return Err(BackendError::LlmUnavailable("empty line"));
    }
    Ok(line)
}

/// Guesses a category for each application it is given.
///
/// Temperature 0: this is a lookup, not a piece of writing, and the same list
/// twice should give the same answer twice.
pub async fn classify(endpoint: Endpoint, apps: Vec<AppRef>) -> BackendResult<Vec<AppGuess>> {
    if apps.is_empty() {
        return Ok(Vec::new());
    }

    let listing = apps
        .iter()
        .map(|app| {
            if app.product.trim().is_empty() {
                app.exe.clone()
            } else {
                format!("{} — {}", app.exe, app.product)
            }
        })
        .collect::<Vec<_>>()
        .join("\n");

    let content = chat(&endpoint, CLASSIFY_PROMPT, &listing, 0.0).await?;

    serde_json::from_str(unfence(&content))
        .map_err(|_| BackendError::LlmUnavailable("response was not the requested JSON"))
}

#[cfg(test)]
mod tests {
    use super::unfence;

    #[test]
    fn strips_a_fenced_json_block() {
        assert_eq!(unfence("```json\n{\"line\":\"a\"}\n```"), "{\"line\":\"a\"}");
        assert_eq!(unfence("```\n{\"line\":\"a\"}\n```"), "{\"line\":\"a\"}");
        assert_eq!(unfence("  {\"line\":\"a\"}  "), "{\"line\":\"a\"}");
    }
}
