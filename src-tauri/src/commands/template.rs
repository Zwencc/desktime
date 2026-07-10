//! Note templates.
//!
//! Templates are real `.md` files in `<root>/templates`, not entries in a
//! config blob. That is the same decision the notebook itself made: a file the
//! user can open, copy, edit in any editor and back up is worth more than a
//! managed list they can only reach through our UI. Adding one is dropping a
//! file in a folder.
//!
//! The built-in set is written out once, on the first run that finds no folder
//! at all. Never re-written after that — a user who deleted "日报" meant it, and
//! restoring it on every launch would be a bug they could not fix.

use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

use crate::error::BackendResult;

/// The built-in set, one per language.
///
/// Seeded on first run and swapped over when the language changes - see
/// [`relanguage`], which is where the one rule that matters lives: a template
/// the user has edited is never touched again.
///
/// A set per language rather than the two this started with: a template is a
/// *starting point the user edits*, and getting a sensible one in a language
/// they read is the whole requirement.
///
/// `{{...}}` placeholders are filled in by the frontend, which is the side that
/// knows the configured time zone.
type Builtin = &'static [(&'static str, &'static str)];


const BUILTIN_ZH: Builtin = &[
    ("空白.md", ""),
    ("日报.md", "# {{date}} 日报\n\n## 今天完成\n\n- \n\n## 遇到的问题\n\n- \n\n## 明天计划\n\n- \n"),
    ("周报.md", "# {{date}} 周报\n\n## 本周进展\n\n- \n\n## 下周计划\n\n- \n\n## 需要支持\n\n- \n"),
    ("会议纪要.md", "# {{title}}\n\n- 时间：{{datetime}}\n- 参会：\n\n## 议题\n\n- \n\n## 结论\n\n- \n\n## 待办\n\n- [ ] \n"),
    ("待办.md", "# {{date}} 待办\n\n- [ ] \n- [ ] \n- [ ] \n"),
];

const BUILTIN_EN: Builtin = &[
    ("Blank.md", ""),
    ("Daily.md", "# {{date}}\n\n## Done today\n\n- \n\n## Blocked by\n\n- \n\n## Tomorrow\n\n- \n"),
    ("Weekly.md", "# Week of {{date}}\n\n## Progress\n\n- \n\n## Next week\n\n- \n\n## Need help with\n\n- \n"),
    ("Meeting notes.md", "# {{title}}\n\n- When: {{datetime}}\n- Present:\n\n## Topics\n\n- \n\n## Decisions\n\n- \n\n## Actions\n\n- [ ] \n"),
    ("Todo.md", "# {{date}}\n\n- [ ] \n- [ ] \n- [ ] \n"),
];

const BUILTIN_JA: Builtin = &[
    ("空白.md", ""),
    ("日報.md", "# {{date}} 日報\n\n## 今日やったこと\n\n- \n\n## 詰まったこと\n\n- \n\n## 明日の予定\n\n- \n"),
    ("週報.md", "# {{date}} 週報\n\n## 今週の進捗\n\n- \n\n## 来週の予定\n\n- \n\n## 必要な支援\n\n- \n"),
    ("議事録.md", "# {{title}}\n\n- 日時：{{datetime}}\n- 出席者：\n\n## 議題\n\n- \n\n## 決定事項\n\n- \n\n## タスク\n\n- [ ] \n"),
    ("ToDo.md", "# {{date}} ToDo\n\n- [ ] \n- [ ] \n- [ ] \n"),
];

const BUILTIN_FR: Builtin = &[
    ("Vierge.md", ""),
    ("Journalier.md", "# {{date}}\n\n## Fait aujourd’hui\n\n- \n\n## Points bloquants\n\n- \n\n## Demain\n\n- \n"),
    ("Hebdomadaire.md", "# Semaine du {{date}}\n\n## Avancement\n\n- \n\n## Semaine prochaine\n\n- \n\n## Besoin d’aide\n\n- \n"),
    ("Compte rendu.md", "# {{title}}\n\n- Quand : {{datetime}}\n- Présents :\n\n## Sujets\n\n- \n\n## Décisions\n\n- \n\n## Actions\n\n- [ ] \n"),
    ("À faire.md", "# {{date}}\n\n- [ ] \n- [ ] \n- [ ] \n"),
];

const BUILTIN_IT: Builtin = &[
    ("Vuoto.md", ""),
    ("Giornaliero.md", "# {{date}}\n\n## Fatto oggi\n\n- \n\n## Punti bloccanti\n\n- \n\n## Domani\n\n- \n"),
    ("Settimanale.md", "# Settimana del {{date}}\n\n## Avanzamento\n\n- \n\n## Prossima settimana\n\n- \n\n## Serve aiuto con\n\n- \n"),
    ("Verbale riunione.md", "# {{title}}\n\n- Quando: {{datetime}}\n- Presenti:\n\n## Argomenti\n\n- \n\n## Decisioni\n\n- \n\n## Azioni\n\n- [ ] \n"),
    ("Da fare.md", "# {{date}}\n\n- [ ] \n- [ ] \n- [ ] \n"),
];

const BUILTIN_ES: Builtin = &[
    ("En blanco.md", ""),
    ("Diario.md", "# {{date}}\n\n## Hecho hoy\n\n- \n\n## Bloqueos\n\n- \n\n## Mañana\n\n- \n"),
    ("Semanal.md", "# Semana del {{date}}\n\n## Avances\n\n- \n\n## Próxima semana\n\n- \n\n## Necesito ayuda con\n\n- \n"),
    ("Acta de reunión.md", "# {{title}}\n\n- Cuándo: {{datetime}}\n- Asistentes:\n\n## Temas\n\n- \n\n## Decisiones\n\n- \n\n## Acciones\n\n- [ ] \n"),
    ("Tareas.md", "# {{date}}\n\n- [ ] \n- [ ] \n- [ ] \n"),
];

const BUILTIN_DE: Builtin = &[
    ("Leer.md", ""),
    ("Täglich.md", "# {{date}}\n\n## Heute erledigt\n\n- \n\n## Blockiert durch\n\n- \n\n## Morgen\n\n- \n"),
    ("Wöchentlich.md", "# Woche vom {{date}}\n\n## Fortschritt\n\n- \n\n## Nächste Woche\n\n- \n\n## Brauche Hilfe bei\n\n- \n"),
    ("Besprechungsnotiz.md", "# {{title}}\n\n- Wann: {{datetime}}\n- Anwesend:\n\n## Themen\n\n- \n\n## Entscheidungen\n\n- \n\n## Aufgaben\n\n- [ ] \n"),
    ("Aufgaben.md", "# {{date}}\n\n- [ ] \n- [ ] \n- [ ] \n"),
];

/// The language tag reduced to the set it selects, so `zh-CN` and a future
/// `zh-TW` are one set and switching between them moves no files. This is what
/// gets recorded on disk, rather than the full tag.
fn set_of(language: &str) -> &'static str {
    match language.split('-').next().unwrap_or("") {
        "zh" => "zh",
        "ja" => "ja",
        "fr" => "fr",
        "it" => "it",
        "es" => "es",
        "de" => "de",
        // Anything unrecognised gets the English set: an untranslated starting
        // point in English is more use than one in a script the reader cannot
        // follow.
        _ => "en",
    }
}

fn builtin(language: &str) -> Builtin {
    match set_of(language) {
        "zh" => BUILTIN_ZH,
        "ja" => BUILTIN_JA,
        "fr" => BUILTIN_FR,
        "it" => BUILTIN_IT,
        "es" => BUILTIN_ES,
        "de" => BUILTIN_DE,
        _ => BUILTIN_EN,
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Template {
    /// File name without the extension — what the user sees and types.
    pub name: String,
    pub body: String,
}

pub fn dir() -> PathBuf {
    crate::devmode::root_dir().join("templates")
}

/// Which set is on disk. Recorded rather than inferred: the folder holds the
/// user's own templates too, and guessing from what is in it would be wrong the
/// first time someone writes a note called "Daily".
const LANGUAGE_KEY: &str = "templates.language";

/// Every template, seeding the built-in set the first time there is no folder
/// and swapping it over when the language has changed since.
#[tauri::command]
pub fn template_list<R: Runtime>(app: AppHandle<R>) -> Result<Vec<Template>, String> {
    let language = crate::i18n::language(&app);
    template_list_inner(&app, &language).map_err(|error| error.to_string())
}

/// Reconciled here, on the way to listing, rather than pushed from the settings
/// window when the language changes: this is the one path that every reader of
/// the templates already goes through, so there is no second moment for the two
/// to disagree at, and nothing to re-run if a switch happens while the app is
/// closed.
fn template_list_inner<R: Runtime>(
    app: &AppHandle<R>,
    language: &str,
) -> BackendResult<Vec<Template>> {
    let dir = dir();
    if !dir.exists() {
        std::fs::create_dir_all(&dir)?;
        for (name, body) in builtin(language) {
            let _ = std::fs::write(dir.join(name), body);
        }
        remember_set(app, language);
    } else {
        relanguage(app, language);
    }

    let mut templates = Vec::new();
    for entry in std::fs::read_dir(&dir)?.flatten() {
        let path = entry.path();
        if path.extension().is_none_or(|kind| kind != "md") {
            continue;
        }

        let Some(name) = path.file_stem().map(|stem| stem.to_string_lossy().into_owned()) else {
            continue;
        };

        templates.push(Template {
            name,
            body: std::fs::read_to_string(&path).unwrap_or_default(),
        });
    }

    // Stable order, so the list does not reshuffle between openings.
    templates.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(templates)
}

/// Puts the built-in set into the current language.
///
/// The rule that decides everything here: **a file is only replaced while it is
/// still byte-for-byte what we wrote.** One edit and it is the user's document,
/// whatever it is called — and deleting somebody's notes because they changed
/// the interface language would be the worst kind of data loss, the kind nobody
/// thinks to look for until they need the file.
///
/// So an edited template survives under its old name and the new language's
/// version appears beside it. Two similar templates is a mess the user can see
/// and fix in a second; a missing one is not.
fn relanguage<R: Runtime>(app: &AppHandle<R>, language: &str) {
    let Some(previous) = stored_set(app) else {
        // Written before this was recorded, so nothing on disk can be shown to
        // be untouched — and nothing that cannot be shown untouched is moved.
        remember_set(app, language);
        return;
    };

    if previous == set_of(language) {
        return;
    }

    let dir = dir();
    for (name, body) in builtin(&previous) {
        let path = dir.join(name);
        if std::fs::read_to_string(&path).is_ok_and(|on_disk| on_disk == *body) {
            let _ = std::fs::remove_file(&path);
        }
    }

    // Never overwrites: a name that is already taken belongs to whatever is
    // using it, which may well be the user's own file.
    for (name, body) in builtin(language) {
        let path = dir.join(name);
        if !path.exists() {
            let _ = std::fs::write(path, body);
        }
    }

    remember_set(app, language);
}

fn stored_set<R: Runtime>(app: &AppHandle<R>) -> Option<String> {
    app.try_state::<crate::config::Config>()?.raw(LANGUAGE_KEY)
}

fn remember_set<R: Runtime>(app: &AppHandle<R>, language: &str) {
    let Some(config) = app.try_state::<crate::config::Config>() else {
        return;
    };

    let _ = config.apply(vec![crate::config::ConfigEntry {
        key: LANGUAGE_KEY.to_owned(),
        value: Some(set_of(language).to_owned()),
    }]);
}

/// Creates or overwrites one template. The name is a file name, so it is checked
/// the same way a draft id is: anything with a separator in it could write
/// outside the folder.
#[tauri::command]
pub fn template_write(name: String, body: String) -> Result<(), String> {
    let path = template_path(&name)?;
    std::fs::write(path, body).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn template_delete(name: String) -> Result<(), String> {
    let path = template_path(&name)?;
    // Through the recycle bin, like notes: a template can be a page of writing.
    trash::delete(path).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn templates_directory() -> Result<String, String> {
    let dir = dir();
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.to_string_lossy().into_owned())
}

fn template_path(name: &str) -> Result<PathBuf, String> {
    if !is_safe_name(name) {
        return Err(format!("invalid template name: {name}"));
    }

    Ok(dir().join(format!("{name}.md")))
}

/// Names come from a text field, so a separator or a `..` would let a template
/// be written anywhere on disk. Same rule as `is_safe_draft_id`, loosened only
/// enough to allow the spaces and non-ASCII a person actually types.
fn is_safe_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 120
        && !name.starts_with('.')
        && !name.contains("..")
        && !name.contains(['/', '\\', ':', '*', '?', '"', '<', '>', '|'])
}

#[cfg(test)]
mod tests {
    use super::{builtin, is_safe_name, set_of};

    #[test]
    fn matches_the_set_on_the_language_not_the_region() {
        assert_eq!(set_of("zh-CN"), "zh");
        assert_eq!(set_of("zh-TW"), "zh");
        assert_eq!(set_of("de-DE"), "de");
    }

    #[test]
    fn unknown_languages_get_the_english_set() {
        assert_eq!(set_of("pt-BR"), "en");
        assert_eq!(set_of(""), "en");
    }

    /// Every set has to name the same number of templates, or switching
    /// language would quietly drop one of them: `relanguage` removes the old
    /// set's files and writes the new set's, and anything the new set does not
    /// name simply never comes back.
    #[test]
    fn every_set_offers_the_same_templates() {
        let expected = builtin("en").len();
        for language in ["zh", "ja", "fr", "it", "es", "de"] {
            assert_eq!(builtin(language).len(), expected, "{language}");
        }
    }

    /// A file name with a separator in it would be written outside the folder,
    /// and these are the names the app writes itself.
    #[test]
    fn every_builtin_name_is_safe() {
        for language in ["zh", "en", "ja", "fr", "it", "es", "de"] {
            for (name, _) in builtin(language) {
                let stem = name.strip_suffix(".md").unwrap_or(name);
                assert!(is_safe_name(stem), "{language}: {name}");
            }
        }
    }

    #[test]
    fn accepts_ordinary_names() {
        assert!(is_safe_name("日报"));
        assert!(is_safe_name("meeting notes"));
        assert!(is_safe_name("2026-08-18 周会"));
    }

    #[test]
    fn rejects_anything_that_could_escape_the_folder() {
        assert!(!is_safe_name(""));
        assert!(!is_safe_name(".."));
        assert!(!is_safe_name("../secrets"));
        assert!(!is_safe_name("nested/name"));
        assert!(!is_safe_name("nested\\name"));
        assert!(!is_safe_name("C:name"));
        assert!(!is_safe_name(".hidden"));
    }
}
