//! The handful of strings the backend shows on its own.
//!
//! Almost all of DeskTime's text is in `src/locales/` — this is only what the
//! backend produces without a webview being involved: the tray menu, the title
//! on a system notification, and the note templates seeded on first run.
//!
//! No i18n crate for eleven strings. A crate here would buy plural rules and
//! message formatting that none of these need, and would put the translations
//! somewhere other than beside the code that uses them.
//!
//! The language comes from the same `config.json` the frontend writes, so both
//! halves of the app always agree without either telling the other.

use tauri::{AppHandle, Manager, Runtime};

pub struct Strings {
    pub show_all: &'static str,
    pub hide_all: &'static str,
    pub quit: &'static str,
    /// Title on the notification a reminder raises when it cannot use a window.
    pub reminder_title: &'static str,
}

const ZH: Strings = Strings {
    show_all: "显示全部",
    hide_all: "隐藏全部",
    quit: "退出 DeskTime",
    reminder_title: "日程提醒",
};

const EN: Strings = Strings {
    show_all: "Show all",
    hide_all: "Hide all",
    quit: "Quit DeskTime",
    reminder_title: "Reminder",
};

const JA: Strings = Strings {
    show_all: "すべて表示",
    hide_all: "すべて非表示",
    quit: "DeskTime を終了",
    reminder_title: "リマインダー",
};

const DE: Strings = Strings {
    show_all: "Alle anzeigen",
    hide_all: "Alle ausblenden",
    quit: "DeskTime beenden",
    reminder_title: "Erinnerung",
};

const FR: Strings = Strings {
    show_all: "Tout afficher",
    hide_all: "Tout masquer",
    quit: "Quitter DeskTime",
    reminder_title: "Rappel",
};

const ES: Strings = Strings {
    show_all: "Mostrar todo",
    hide_all: "Ocultar todo",
    quit: "Salir de DeskTime",
    reminder_title: "Recordatorio",
};

const IT: Strings = Strings {
    show_all: "Mostra tutto",
    hide_all: "Nascondi tutto",
    quit: "Esci da DeskTime",
    reminder_title: "Promemoria",
};

/// Matched on the prefix, so `zh-CN` and a future `zh-TW` both land on Chinese.
/// Anything unrecognised falls back to English rather than to the source
/// language: an untranslated tray in English is readable almost anywhere.
pub fn strings_for(language: &str) -> &'static Strings {
    match language.split('-').next().unwrap_or("") {
        "zh" => &ZH,
        "ja" => &JA,
        "de" => &DE,
        "fr" => &FR,
        "es" => &ES,
        "it" => &IT,
        _ => &EN,
    }
}

/// The language the frontend recorded, or empty when it has not chosen yet.
pub fn language<R: Runtime>(app: &AppHandle<R>) -> String {
    app.try_state::<crate::config::Config>()
        .and_then(|config| config.language())
        .unwrap_or_default()
}

pub fn strings<R: Runtime>(app: &AppHandle<R>) -> &'static Strings {
    strings_for(&language(app))
}

#[cfg(test)]
mod tests {
    use super::strings_for;

    #[test]
    fn matches_on_the_language_not_the_region() {
        assert_eq!(strings_for("zh-CN").quit, strings_for("zh-TW").quit);
        assert_eq!(strings_for("de-DE").quit, strings_for("de-AT").quit);
    }

    #[test]
    fn unknown_languages_fall_back_to_english() {
        assert_eq!(strings_for("").quit, strings_for("en-US").quit);
        assert_eq!(strings_for("pt-BR").quit, strings_for("en-US").quit);
    }
}
