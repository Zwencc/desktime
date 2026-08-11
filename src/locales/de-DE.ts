// Deutsch. Typed against zh-CN: a missing key will not compile.
//
// The longest of the seven, and therefore the one that decides whether a button
// is wide enough. Check layouts against this locale rather than against English:
// "Einstellungen" is fourteen characters where the Chinese is two.

import { enUS } from './en-US'
import type { Locale } from './zh-CN'

export const deDE: Locale = {
  language: { name: 'Deutsch' },

  common: {
    cancel: 'Abbrechen',
    confirm: 'OK',
    delete: 'Löschen',
    save: 'Speichern',
    close: 'Schließen',
    open: 'Öffnen',
    add: 'Hinzufügen',
    edit: 'Bearbeiten',
    rename: 'Umbenennen',
    reset: 'Zurücksetzen',
    seconds: 'Sek.',
    minutes: 'Min.',
    pixels: 'px',
  },

  settings: {
    title: 'Einstellungen',
    navGlobal: 'Allgemein',
    navGeneral: 'Darstellung',
    navWidgets: 'Widgets',
    navShortcuts: 'Tastenkürzel',
    navStartup: 'Start und Hintergrund',
    navAbout: 'Über',
    navNotebook: 'Notizen',
    navNotebookGeneral: 'Allgemein',
    navTemplates: 'Vorlagen',
    navSchedule: 'Termine',
    navReminders: 'Erinnerungen',
    navTags: 'Terminarten',
    navMoo: 'Malochuhr',
    navMooShape: 'Darstellung',
    navWork: 'Arbeitszeit und Gehalt',
    navActivity: 'Aktivität',
    navLlm: 'KI-Sprüche',
    navLauncher: 'Starter',
    navPlugins: 'Plugins',
    navDev: 'Entwickler',
  },

  general: {
    title: 'Darstellung',
    theme: 'Design',
    language: 'Sprache',
    timeZone: 'Zeitzone',
    followSystem: 'System folgen',
    fixedZone: 'Feste Zeitzone',
  },

  startup: {
    title: 'Start und Hintergrund',
    autostart: 'Mit Windows starten',
    autostartHint:
      'Öffnet die Fenster von DeskTime nach der Anmeldung. Keine Administratorrechte erforderlich.',
    service: 'Hintergrundschutz',
    serviceHint:
      'Hält Erfassung und Erinnerungen nach dem Schließen aller Fenster aktiv. Eine Reparatur wird nur bei Problemen angeboten.',
    serviceOff: 'Schutz fehlt; eingeschränkter Modus',
    serviceInstalled: 'Schutz installiert, aber angehalten',
    serviceRunning: 'Schutz bereit',
    waiting: 'Warte auf Bestätigung…',
    dismissed: 'Bestätigung abgebrochen – DeskTime bleibt im eingeschränkten Modus.',
    repair: 'Reparieren',
  },

  templates: {
    title: 'Notizvorlagen',
    intro:
      'Vorlagen sind .md-Dateien im Ordner templates und können dort direkt angelegt oder gelöscht werden. Der Pfeil neben „Neu“ in den Notizen zeigt sie an; eine Auswahl legt einen Entwurf daraus an.',
    variables: 'Variablen: {{date}} {{time}} {{datetime}} {{weekday}} {{title}}',
    create: 'Neue Vorlage',
    remove: 'Vorlage löschen',
    openFolder: 'Vorlagenordner öffnen',
    newName: 'Neue Vorlage',
    confirmRemove: (name: string) => `Vorlage „${name}“ löschen? Sie wandert in den Papierkorb.`,
    empty: 'Wählen Sie links eine Vorlage zum Bearbeiten.',
  },

  clock: {
    lunarPrefix: 'Mondkalender',
    pomodoroDone: '🍅 Pomodoro beendet',
    pomodoroDoneBody: 'Die Fokuszeit ist um — machen Sie eine Pause',
    hourlyChime: 'Stundenschlag',
    hourlyBody: (hour: number, zone: string) => `Es ist ${hour}:00 Uhr in ${zone}`,
    hourlyOn: 'Stundenschlag: an',
    hourlyOff: 'Stundenschlag: aus',
    startFocus: 'Fokus starten',
    pauseFocus: 'Pause',
    resetFocus: 'Pomodoro zurücksetzen',
    toMoo: 'Zur Malochuhr wechseln',
  },

  schedule: {
    newSchedule: 'Neuer Termin',
    done: 'Als erledigt markieren',
    undone: 'Als offen markieren',
    today: 'Heute',
    week: 'Diese Woche',
    all: 'Alle',
    month: 'Monat',
    allTags: 'Alle',
    empty: 'Keine Termine',
    overdue: 'Überfällig',
    edit: 'Termin bearbeiten',
    muteOn: 'Erinnerungen an — zum Stummschalten klicken',
    muteOff: 'Erinnerungen stumm — zum Einschalten klicken',
    stop: 'Erinnerung stoppen',
    snooze: 'Später',
    minutesShort: (value: number) => `${value} Min.`,
    complete: 'Erledigt',
    moreBanners: (value: number) => `${value} weitere Erinnerungen`,
  },

  scheduleEditor: {
    title: 'Termin bearbeiten',
    newTitle: 'Neuer Termin',
    name: 'Titel',
    date: 'Datum',
    time: 'Uhrzeit',
    repeat: 'Wiederholung',
    tag: 'Art',
    noTag: 'Ohne Art',
    reminder: 'Erinnerung',
  },

  reminderFields: {
    channel: 'Kanal',
    lead: 'Vorlauf',
    topmost: 'Immer oben',
    focus: 'Fokus übernehmen',
    visual: 'Darstellung',
    repeat: 'Wiederholung',
    every: 'alle',
    atMost: 'höchstens',
    times: 'mal',
    unlimited: '0 = bis zum Stoppen',
  },

  reminderWindow: {
    title: 'Erinnerung',
    stop: 'Stoppen',
    stopAll: 'Alle stoppen',
    snooze: 'Später',
    done: 'Erledigt',
    minutes: (value: number) => `${value} Min.`,
    overdue: (value: number) => `${value} Min. überfällig`,
    round: (value: number) => `${value}. Mal`,
    more: (value: number) => `${value} weitere`,
  },

  widgetSettings: {
    title: 'Widgets',
    show: 'Anzeigen',
    pin: 'Oben halten',
    resetPositions: 'Alle Fensterpositionen zurücksetzen',
  },

  mooSettings: {
    title: 'Darstellung',
    shape: 'Fensterform',
    float: 'Schwebend',
    island: 'Insel',
    islandHint: 'Die Insel sitzt mittig am oberen Bildschirmrand und öffnet sich beim Überfahren.',
  },

  reminderSettings: {
    title: 'Erinnerungen',
    mute: 'Alles stummschalten',
    fallback:
      'Popup verwenden, wenn eine In-App-Erinnerung fällig ist und das Termin-Widget ausgeblendet ist',
    defaults: 'Vorgaben für neue Termine',
  },

  notebookSettings: {
    vaultLock: 'Tresor sperren nach Untätigkeit von',
    vaultBackup:
      'Den Tresor sichern heißt: den ganzen Ordner „vault" neben dem Programm kopieren; wiederherstellen heißt, ihn zurückzukopieren. Darin liegt nur Chiffrat unter zufälligen Namen, und eine einzelne Datei daraus zu kopieren reicht für keine Wiederherstellung.',
    title: 'Notizen',
    autoSave: 'Automatisch speichern nach',
  },

  tagSettings: {
    title: 'Terminarten',
    intro:
      'Liste und Monatsansicht sind nach Art eingefärbt. Wird eine Art gelöscht, verlieren ihre Termine nur die Art — gelöscht werden sie nicht.',
    name: 'Name',
    color: 'Farbe',
    add: 'Art hinzufügen',
    reset: 'Vorgaben wiederherstellen',
    untitled: 'Neue Art',
  },

  workSettings: {
    schedule: 'Arbeitszeit',
    mode: 'Schichtmuster',
    weekly: 'Jede Woche gleich',
    biweekly: 'Wechselnde Wochen',
    weekA: 'Woche A',
    weekB: 'Woche B',
    anchor: 'Ankerdatum',
    anchorEmpty: 'Nicht gesetzt',
    anchorPick: 'Im Kalender wählen',
    anchorDone: 'Kalender schließen',
    anchorHint:
      'Die Kalenderwoche mit diesem Datum gilt als Woche A; die übrigen wechseln sich davon ausgehend ab.',
    breakLabel: 'Mittagspause',
    overtimePaid: 'Überstunden werden bezahlt',
    overtimeRate: 'Überstundenfaktor',
    salary: 'Gehaltsaufbau',
    incomes: 'Einnahmen',
    deducts: 'Abzüge',
    addIncome: 'Einnahme hinzufügen',
    addDeduct: 'Abzug hinzufügen',
    namePlaceholder: 'Bezeichnung',
    monthly: 'Monatlich',
    weekly2: 'Wöchentlich',
    yearly: 'Jährlich',
    once: 'Einmalig',
    payMonth: 'Ausgezahlt im',
    fixed: 'Fester Betrag',
    percent: 'Prozentsatz',
    summary: 'Umgerechnet',
    disposable: 'Netto pro Monat',
    standard: 'Monatliche Sollstunden',
    baseRate: 'Basisstundensatz',
    salaryHint:
      'Einmalige Zahlungen (etwa ein Bonus) zählen vollständig im Auszahlungsmonat, daher fällt der Stundensatz dort deutlich höher aus.',
    lossHint:
      'Gehaltsangaben sind optional: Die Verlustquote betrachtet nur den Anteil unbezahlter Überstunden, nie den Betrag.',
    counter: 'Verdienstzähler',
    cycle: 'Zeitraum',
    cycleMonth: 'Monatlich',
    cycleWeek: 'Wöchentlich',
    cycleDay: 'Täglich',
    cycleStart: 'Zeitraum beginnt am',
    dayOfMonth: '. des Monats',
    unit: 'Anzeige als',
    unitMonth: 'Pro Monat',
    unitDay: 'Pro Tag',
    unitHour: 'Pro Stunde',
    unitMinute: 'Pro Minute',
    showCents: 'Nachkommastellen zeigen (das Ticken ist der Punkt)',
    counterHint:
      'Er folgt der geplanten Arbeitszeit — Nichtstun verdient mit, denn bezahlt wird Zeit, nicht Ergebnis.',
  },

  activitySettings: {
    title: 'Aktivität',
    intro:
      'Die Malochuhr erkennt an der Rechneraktivität, ob der Tag wirklich voll war. Alles bleibt auf diesem Gerät und wird nie hochgeladen: nur Tastenanzahl (nicht welche Tasten, nicht ihre Reihenfolge), Mausweg, der exe-Name des Vordergrundprogramms und die unten einzeln schaltbaren Umgebungssignale. Fenstertitel werden nie erfasst.',
    enable: 'Aktivität erfassen',
    mic: 'Mikrofon / Kamera in Benutzung',
    micHint:
      'Liest genau einen Wahrheitswert — ob ein Gerät belegt ist — um Besprechungszeit zu erkennen. Audio und Video bleiben unberührt, und es wird nicht festgehalten, welches Programm sie nutzt.',
    audio: 'Audiowiedergabe',
    audioHint: 'Liest nur, ob gerade Ton läuft, um Zusehen von Arbeiten zu unterscheiden.',
    away: 'Abwesend nach',
    awayHint: 'Länger keine Eingabe, und die Zeit zählt nicht mehr als Anwesenheit.',
    retain: 'Daten behalten für',
    days: 'Tage',
    clear: 'Alle Aktivitätsdaten löschen',
    cleared: 'Gelöscht',
    unknown: 'Nicht zugeordnete Programme',
    unknownHint:
      'Erst nach der Zuordnung weiß die Stimmungslogik, ob Sie chatten oder programmieren.',
    autoClassify: 'Per KI zuordnen',
    classifying: 'Wird zugeordnet…',
    llmOff: 'Zuerst unter „KI-Sprüche“ Endpunkt und Schlüssel eintragen',
    autoHint:
      'Sendet nur Dateinamen und Produktnamen dieser Programme an Ihren Endpunkt und lässt ihn die Kategorie raten. Nur diese beiden, keine Fenstertitel.',
    classifyFailed: 'Zuordnung fehlgeschlagen: Der Endpunkt lieferte kein brauchbares Ergebnis.',
    todayHead: 'Heute',
    present: 'Am Platz',
    effective: 'Gearbeitet',
    meeting: 'Besprechungen',
    disabled: 'Die Erfassung ist aus, daher sind alle Zahlen unten 0.',
  },

  llmSettings: {
    title: 'KI-Sprüche (optional)',
    intro:
      'Mit einem OpenAI-kompatiblen Endpunkt werden die Sprüche abwechslungsreicher. Die Anfrage stellt das lokale Backend, der Schlüssel gelangt also nie in die Webansicht. Bei Fehler, Zeitüberschreitung oder unerwarteter Antwort wird still auf die eingebauten Sprüche zurückgefallen; die Oberfläche blockiert nie.',
    enable: 'KI-Sprüche verwenden',
    baseUrl: 'Endpunkt',
    model: 'Modell',
    apiKey: 'API-Schlüssel',
    keySet: 'Schlüssel gespeichert',
    keyEmpty: 'Nicht gesetzt',
    clear: 'Löschen',
    timeout: 'Zeitlimit',
    ms: 'ms',
    sendSalary: 'Senden von Gehaltszahlen erlauben (Stundensatz, unbezahlter Betrag)',
    sends: 'Wird standardmäßig gesendet',
    never: 'Wird nie gesendet',
    sendList:
      'Name des Stimmungszustands; Verlust, Nichtstun und Intensität als drei Zahlen zwischen 0 und 1; Minuten am Platz, in Überstunden und in Besprechungen für heute.',
    neverList:
      'Anwendungsnamen, Fenstertitel, Termintitel, Dateipfade, Tastenanschläge. Die Anfragestruktur des Backends hat für all das kein Feld.',
    rate: 'Nur beim Wechsel des Stimmungszustands, und höchstens alle fünf Minuten.',
  },

  shortcutSettings: {
    title: 'Tastenkürzel',
    intro:
      'Globale Kürzel wirken in jedem Programm und werden sofort nach der Änderung neu registriert — kein Neustart nötig. Die Vorgaben nutzen Strg+Alt+Ziffer: Ein bloßes Strg+Ziffer würde diese Taste jedem anderen Programm entziehen (Browser-Tabs, Editor-Gruppen), ohne dass erkennbar wäre, warum.',
    record: 'Zum Aufzeichnen klicken',
    recording: 'Tastenkombination drücken… (Esc bricht ab)',
    unbound: 'Nicht gesetzt',
    launcher:
      'Das Kürzel des Starters wird unter „Starter“ gesetzt; ein Konflikt damit wird hier ebenfalls gemeldet.',
    conflict: (name: string) => `Gleich wie „${name}“ — nur eines von beiden wird wirken`,
    failed:
      'Das System hat abgelehnt: Ein anderes Programm belegt die Taste bereits. Bitte eine andere wählen.',
    inWindow: 'Innerhalb eines Widgets',
    escapeLabel: 'Aktuelles Widget nicht mehr oben halten',
    escapeHint:
      'Nur solange der Fokus in einem Widget-Fenster liegt. Es belegt keine globale Taste und ist deshalb nicht änderbar.',
    swap: 'Uhr / Malochuhr wechseln',
    pin: 'Oben halten / lösen',
    launcherAction: 'Tastenkürzel für den Starter',
  },

  devSettings: {
    title: 'Entwickler',
    root: 'Markierungsordner',
    hint:
      'Legen Sie eine Datei namens devmod.dev in den Ordner oben und starten Sie die App neu.',
    open: 'Aktivitäts-Debugger',
    reload: 'Alle Fenster neu laden',
  },

  about: {
    title: 'Über',
    storage: 'Konfiguration und Daten',
    storageHint:
      'Konfiguration, Entwürfe und Aktivitätsdaten liegen alle in diesem Ordner, wo auch immer die App installiert ist.',
    open: 'Ordner öffnen',
    configFailed: 'Konfiguration konnte nicht gespeichert werden',
    configFailedBody: (path: string, reason: string) =>
      `Die Änderungen erreichten ${path} nicht
${reason}
Prüfen Sie, ob der Ordner beschreibbar ist.`,
  },

  mooPanel: {
    toNormal: 'Zur einfachen Uhr wechseln',
    toIsland: 'Zur Insel wechseln',
    toFloat: 'Zum schwebenden Fenster wechseln',
    monitorLocked:
      'Aktivitätserfassung in den Einstellungen einschalten, um die heutigen Werte zu sehen',
    loss: 'Verlust',
    slack: 'Nichtstun',
    intensity: 'Intensität',
    startFishing: 'Blaumachen (als einfache Uhr getarnt)',
    stopFishing: 'Blaumach-Modus verlassen',
    feed: 'Füttern',
    report: 'Tagesabrechnung',
    feedEmpty: 'Heute gibt es nichts mehr zu füttern.',
    feedHint: 'Eine offene Aufgabe auf das Gesicht ziehen',
    feedNow: 'Füttern',
  },

  report: {
    title: 'Tagesabrechnung',
    older: 'Vorheriger Tag',
    newer: 'Nächster Tag',
    empty: 'Noch keine Abrechnung. Sie entsteht nach Feierabend von selbst.',
    present: 'Am Platz',
    effective: 'Echte Arbeit',
    slack: 'Nichtstun',
    meeting: 'Besprechungen',
    overtime: 'Überstunden',
    wasted: 'Unbezahlt',
    earned: 'Verdient',
    fishing: 'Bezahltes Nichtstun',
    fishingValue: 'Netto',
    fed: 'Gefüttert',
    times: 'mal',
    mood: 'Stimmung heute',
    noActivity:
      'Heute wurde keine Aktivität erfasst — der Rechner war vielleicht aus, oder die Erfassung ist abgeschaltet.',
  },

  earnings: {
    locked: 'Gehalt einrichten, um den Verdienstzähler freizuschalten',
    earned: 'Verdient',
    wasted: 'Unbezahlt',
    month: 'Dieser Monat',
    week: 'Diese Woche',
    day: 'Heute',
    unitMonth: 'Pro Monat',
    unitDay: 'Pro Tag',
    unitHour: 'Pro Stunde',
    unitMinute: 'Pro Minute',
  },

  notebookPanel: {
    vaultBackedUp: 'Speichern fehlgeschlagen; der Text liegt in einer verschlüsselten Sicherung im Tresor',
    vaultSaveLost: 'Die letzte Änderung konnte nicht gespeichert werden',
    vaultFailed: (reason: string) => `Tresor-Vorgang fehlgeschlagen: ${reason}`,
    vaultNewNote: 'Neue Notiz.dtnote',
    vaultKeptPlain: (name: string) =>
      `„${name}" wurde verschlüsselt, aber die Klartextkopie ließ sich nicht löschen — bitte von Hand entfernen`,
    vaultNotMoved: (name: string, reason: string) => `„${name}" wurde nicht verschoben: ${reason}`,
    vaultMoveInTitle: 'In den Tresor verschieben',
    vaultMovedIn: (count: number) =>
      `${count} Notizen liegen jetzt verschlüsselt im Tresor. Die Klartextdateien wurden direkt gelöscht, nicht in den Papierkorb gelegt.`,
    vaultDeleteTitle: 'Private Notiz löschen',
    vaultDeleteBody: (name: string) =>
      `„${name}" wird endgültig aus dem Tresor gelöscht. Sie landet nicht im Papierkorb und ist nicht wiederherstellbar.`,
    vaultMoveOutTitle: 'Aus dem Tresor holen',
    vaultMoveOutBody: (name: string) =>
      `„${name}" wird in eine gewöhnliche .dtnote-Datei entschlüsselt und aus dem Tresor entfernt.`,
    vaultMoveOutWarning:
      'Das ist der einzige Vorgang, der private Inhalte wieder lesbar macht. Einmal geschrieben, kann sie jeder öffnen.',
    vaultMoveOutAction: 'Entschlüsseln und herausholen',
    placeholder: 'Kurz etwas notieren…',
    toggleSidebar: 'Dateien',
    saveAs: 'Speichern unter',
    openFile: 'Vorhandene Datei öffnen',
    newFolderName: 'Neuer Ordner',
    unsaved: 'Nicht gespeichert',
    saving: 'Wird gespeichert…',
    saved: (at: string) => `Gespeichert ${at}`,
    draft: 'Entwurf · nicht auf der Platte',
    saveFailed: 'Speichern fehlgeschlagen; der Text liegt in einer lokalen Sicherung',
    renameFailed: (reason: string) => `Umbenennen fehlgeschlagen: ${reason}`,
    deleteFailed: (reason: string) => `Löschen fehlgeschlagen: ${reason}`,
    empty: 'Links eine Datei anlegen oder öffnen',
    deleteFileTitle: 'Datei löschen',
    deleteFileBody: (name: string) =>
      `„${name}“ wandert in den Papierkorb und lässt sich wiederherstellen.`,
    deleteFolderTitle: 'Ordner löschen',
    deleteFolderEmpty: (name: string) => `„${name}“ ist leer und wird entfernt.`,
    deleteFolderBody: (name: string, count: number) =>
      `„${name}“ enthält ${count} Datei(en); alle wandern in den Papierkorb:`,
    andMore: (count: number) => `und ${count} weitere`,
    deleteDraftTitle: 'Entwurf löschen',
    deleteDraftBody: (name: string) =>
      `„${name}“ wurde nie gespeichert; das Löschen lässt sich nicht rückgängig machen.`,
    deleteAnyway: 'Trotzdem löschen',
    openFailed: (reason: string) => `Konnte nicht geöffnet werden: ${reason}`,
    migrateTitle: 'Ältere Notizen in .dtnote umwandeln',
    migrateBody: (count: number) =>
      `${count} Notizen im alten Format gefunden. Jede wird zu einer einzigen .dtnote-Datei mit den Bildern darin; das Original wandert in den Windows-Papierkorb und bleibt wiederherstellbar, die Bilddateien bleiben, wo sie sind.`,
    migrateImages: (count: number) => `${count} Bilder`,
    migrateWarnExternal: (reference: string) =>
      `Dieses Bild wird nicht in die Notiz übernommen und bleibt, wo es ist: ${reference}`,
    migrateWarnShared: (reference: string) =>
      `Wird von mehreren Notizen benutzt; jede behält ihre eigene Kopie: ${reference}`,
    migrateWarnRemote: (reference: string) => `Liegt im Web, bleibt unverändert: ${reference}`,
    migrateWarnTargetExists: 'Eine .dtnote dieses Namens gibt es schon; diese Notiz wird übersprungen',
    migrateStart: 'Umwandeln',
    migrateLater: 'Später',
    migrateDoneTitle: 'Umwandlung abgeschlossen',
    migrateDoneBody: (converted: number, failed: number) =>
      `${converted} umgewandelt, ${failed} unverändert. Das vollständige Protokoll liegt im Ordner logs.`,
    migrateFailed: (reason: string) => `Umwandlung fehlgeschlagen: ${reason}`,
    legacyNote: 'Notizzettel (alt)',
    draftPrefix: 'Entwurf ',
  },

  editor: {
    bold: 'Fett',
    italic: 'Kursiv',
    heading: 'Überschrift',
    bullet: 'Aufzählung',
    checklist: 'Aufgabenliste',
    preview: 'Vorschau',
    edit: 'Bearbeiten',
    chars: 'Zeichen',
  },

  sidebar: {
    vault: 'Tresor',
    vaultLock: 'Jetzt sperren',
    vaultEmpty: 'Der Tresor ist leer',
    vaultMoveIn: 'In den Tresor verschieben',
    vaultMoveOut: 'Aus dem Tresor holen',
    search: 'Suchen',
    drafts: 'Entwürfe',
    reveal: 'Im Explorer anzeigen',
    newFileHere: 'Neue Datei in diesem Ordner',
    missing: 'Datei fehlt',
    unsaved: 'Nicht gespeichert',
    empty: 'Noch keine gespeicherten Dateien',
    webOnly: 'Zum Speichern wird die Desktop-App gebraucht',
  },

  vault: {
    createTitle: 'Tresor anlegen',
    createBody:
      'Ein Passwort und eine eigene Frage festlegen. Beides ist Pflicht, das Passwort mindestens 8 Zeichen.',
    unlockTitle: 'Der Tresor ist gesperrt',
    recoverTitle: 'Mit der eigenen Frage öffnen',
    resetTitle: 'Neues Passwort setzen',
    resetBody: 'Stimmt. Vor dem Betreten ein neues Passwort setzen.',
    password: 'Passwort',
    passwordAgain: 'Noch einmal',
    newPassword: 'Neues Passwort',
    question: 'Deine Frage',
    answer: 'Antwort',
    answerAgain: 'Antwort wiederholen',
    answerWarning:
      'Die Antwort ist ein zweites Passwort — sie öffnet alles, was das Passwort öffnet, also ist der Tresor nur so stark wie das Schwächere von beiden. Nichts Erratbares nehmen, etwa den Namen der ersten Schule.',
    questionWarning:
      'Die Frage selbst ist auch bei gesperrtem Tresor lesbar: kein Geheimnis hineinschreiben.',
    forgot: 'Passwort vergessen?',
    backToPassword: 'Zurück zum Passwort',
    delayNote:
      'Nach mehreren Fehlversuchen wird die Wartezeit länger, aber das bremst nur Versuche über dieses Fenster. Wer eine Kopie des Tresor-Ordners hat, kann offline beliebig schnell probieren — die eigentliche Verteidigung ist, wie stark Passwort und Antwort sind.',
    rejected: 'Passwort oder Antwort falsch, oder die Daten sind beschädigt',
    working: 'Läuft…',
    createAction: 'Anlegen',
    unlockAction: 'Entsperren',
    resetAction: 'Passwort setzen',
  },

  calendar: {
    previous: 'Vorheriger Monat',
    next: 'Nächster Monat',
    backToToday: 'Zurück zu heute',
    rest: 'Frei',
    work: 'Dienst',
    weekdayHeads: ['S', 'M', 'D', 'M', 'D', 'F', 'S'],
    weekdays: [
      'Sonntag',
      'Montag',
      'Dienstag',
      'Mittwoch',
      'Donnerstag',
      'Freitag',
      'Samstag',
    ],
  },

  launcherWindow: {
    placeholder: 'Programme, Ordner, Verknüpfungen suchen',
    empty: 'Keine Treffer',
    desktop: 'Desktop',
    menu: 'Startmenü',
  },

  contextMenu: {
    pin: 'Oben halten',
    show: 'Anzeigen',
    reset: 'Position dieses Fensters zurücksetzen',
  },

  widgetShell: {
    pinTop: 'Immer im Vordergrund',
    unpinTop: 'Nicht mehr im Vordergrund',
    resize: 'Zum Ändern der Größe ziehen',
  },

  desktopPanel: {
    empty: 'Auf dem Desktop gibt es nichts anzuzeigen.',
  },

  widgetNames: {
    clock: 'Uhr',
    note: 'Notizen',
    schedule: 'Termine',
    moo: 'Malochuhr',
    desktop: 'Desktop-Ebene',
  },

  themeNames: {
    default: 'Standard',
    cyber: 'Cyber-Büro',
    concrete: 'Beton',
    fish: 'Blaumach-Grün',
    bossAway: 'Chef ist weg',
    paper: 'Papier',
  },

  categories: {
    chat: 'Chat',
    dev: 'Entwicklung',
    office: 'Dokumente',
    browser: 'Browser',
    media: 'Medien',
    design: 'Design',
    other: 'Sonstiges',
  },

  scheduleData: {
    tagWork: 'Arbeit',
    tagLife: 'Privat',
    tagImportant: 'Wichtig',
    tagStudy: 'Lernen',
    repeatNone: 'Keine Wiederholung',
    repeatDaily: 'Täglich',
    repeatWeekly: 'Wöchentlich',
    repeatWeekday: 'Werktags',
    seedTitle: 'Die Schwerpunkte für heute sortieren',
    remaining: (count: number) => `${count} offen`,
    allDone: 'Alles erledigt 🎉',
  },

  reminderData: {
    channelOff: 'Keine Erinnerung',
    channelInapp: 'In der App',
    channelDesktop: 'Popup',
    channelToast: 'Systembenachrichtigung',
    visualStatic: 'Ohne Animation',
    visualBreathe: 'Atmender Rahmen',
    visualBlink: 'Blinkendes Fenster',
    visualShake: 'Wackeln',
  },

  timeZones: {
    beijing: 'Pekinger Zeit',
    local: 'Ortszeit',
  },

  // Not translated: these lines are the widget's personality, and the joke does
  // not survive a literal rendering. Localising them means rewriting them for
  // the language, which is a writing job — until someone does it, English is a
  // more honest answer than a flat translation.
  moo: enUS.moo,

  notebook: {
    newFile: 'Neue Notiz',
    newFromTemplate: 'Neu aus Vorlage',
    newFolder: 'Neuer Ordner',
  },

  launcher: {
    title: 'Starter',
    intro:
      'Das Tastenkürzel öffnet den Starter in der Bildschirmmitte. Anfangsbuchstaben oder Namensteile tippen, um Programme vom Desktop und aus dem Startmenü zu öffnen. Der Index entsteht im Hintergrund, das Tippen wartet nie.',
    hotkey: 'Tastenkürzel für den Starter',
    hotkeyHint:
      'Wirkt sofort. Belegt bereits ein Vollbildspiel oder ein anderes Programm die Taste, schlägt die Registrierung fehl – dann eine andere wählen.',
  },

  plugins: {
    browserAccess: (sites: string) =>
      `Das ist ein Browser-Plugin: es öffnet ${sites} und kann die Seiteninhalte lesen und verändern, die du dort siehst. Seine Anmeldungen liegen im eigenen Browser-Profil des Plugins und werden weder mit DeskTime noch mit anderen Plugins geteilt.`,
    title: 'Plugins',
    intro:
      'Plugins liegen im Ordner plugins, je ein Verzeichnis. Nach dem Bearbeiten einer plugin.json auf Neu laden klicken — ein Neustart ist nicht nötig.',
    openFolder: 'Plugin-Ordner öffnen',
    reload: 'Neu laden',
    reloading: 'Wird geladen…',
    options: 'Optionen',
    viewLog: 'Protokoll ansehen',
    enabled: 'Aktiviert',
    permissions: 'Berechtigungen',
    backend: 'Backend-Prozess',
    none: 'Noch keine Plugins installiert.',
    failed: (reason: string) => `Laden fehlgeschlagen: ${reason}`,
    backendFailed: 'Der Backend-Prozess wurde wiederholt beendet; es wird nicht mehr neu gestartet.',
  },
}
