use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum FeatureId {
    CoreIpc,
    CoreStorage,
    NoteContainer,
    Vault,
    BrowserWidget,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum FeatureState {
    Scaffolded,
    Ready,
    Degraded,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FeatureStatus {
    pub feature: FeatureId,
    pub state: FeatureState,
    pub api_version: u16,
    pub owner: String,
    pub next_module: String,
}
