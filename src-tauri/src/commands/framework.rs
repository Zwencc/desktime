use crate::api::{FeatureId, FeatureState, FeatureStatus};

/// What is finished and what is still a scaffold.
///
/// `next_module` names where the remaining work goes, and a feature only moves
/// to `Ready` once its acceptance cases pass — so this list is a status report,
/// not a wish. Anything still `Scaffolded` has commands that return
/// `NOT_IMPLEMENTED` rather than a plausible empty answer.
#[tauri::command]
pub fn framework_status() -> Vec<FeatureStatus> {
    use FeatureState::{Ready, Scaffolded};

    [
        (FeatureId::CoreIpc, Ready, "DTCore", "ipc::transport"),
        (
            FeatureId::CoreStorage,
            Ready,
            "DTCore",
            "storage::repositories",
        ),
        (
            FeatureId::NoteContainer,
            Ready,
            "DeskTime",
            "note::container",
        ),
        (FeatureId::Vault, Ready, "DeskTime", "vault::controller"),
        (
            FeatureId::BrowserWidget,
            Scaffolded,
            "plugin host",
            "plugin::browser",
        ),
    ]
    .into_iter()
    .map(|(feature, state, owner, next_module)| FeatureStatus {
        feature,
        state,
        api_version: 1,
        owner: owner.to_owned(),
        next_module: next_module.to_owned(),
    })
    .collect()
}
