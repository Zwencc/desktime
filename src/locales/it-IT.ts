// Italiano. Typed against zh-CN: a missing key will not compile.

import { enUS } from './en-US'
import type { Locale } from './zh-CN'

export const itIT: Locale = {
  language: { name: 'Italiano' },

  common: {
    cancel: 'Annulla',
    confirm: 'OK',
    delete: 'Elimina',
    save: 'Salva',
    close: 'Chiudi',
    open: 'Apri',
    add: 'Aggiungi',
    edit: 'Modifica',
    rename: 'Rinomina',
    reset: 'Reimposta',
    seconds: 's',
    minutes: 'min',
    pixels: 'px',
  },

  settings: {
    title: 'Impostazioni',
    navGlobal: 'Generale',
    navGeneral: 'Aspetto',
    navWidgets: 'Widget',
    navShortcuts: 'Scorciatoie',
    navStartup: 'Avvio e background',
    navAbout: 'Informazioni',
    navNotebook: 'Note',
    navNotebookGeneral: 'Generale',
    navTemplates: 'Modelli',
    navSchedule: 'Agenda',
    navReminders: 'Promemoria',
    navTags: 'Tipi di evento',
    navMoo: 'Orologio del somaro',
    navMooShape: 'Aspetto',
    navWork: 'Orario e stipendio',
    navActivity: 'Attività',
    navLlm: 'Battute IA',
    navLauncher: 'Avvio rapido',
    navPlugins: 'Plugin',
    navDev: 'Sviluppatore',
  },

  general: {
    title: 'Aspetto',
    theme: 'Tema',
    language: 'Lingua',
    timeZone: 'Fuso orario',
    followSystem: 'Segui il sistema',
    fixedZone: 'Fuso fisso',
  },

  startup: {
    title: 'Avvio e background',
    autostart: 'Avvia con Windows',
    autostartHint:
      'Apre le finestre di DeskTime dopo l’accesso. Non servono diritti di amministratore.',
    service: 'Protezione in background',
    serviceHint:
      'Mantiene raccolta e promemoria dopo la chiusura delle finestre. Richiede attenzione solo quando viene proposta la riparazione.',
    serviceOff: 'Protezione assente, modalità degradata',
    serviceInstalled: 'Protezione installata ma arrestata',
    serviceRunning: 'Protezione pronta',
    waiting: 'In attesa di autorizzazione…',
    dismissed: 'Autorizzazione annullata: DeskTime resta in modalità degradata.',
    repair: 'Ripara',
  },

  templates: {
    title: 'Modelli di nota',
    intro:
      'I modelli sono file .md nella cartella templates e si possono aggiungere o eliminare direttamente lì. La freccia accanto a «Nuova» nelle note li elenca; sceglierne uno crea una bozza a partire da esso.',
    variables: 'Variabili: {{date}} {{time}} {{datetime}} {{weekday}} {{title}}',
    create: 'Nuovo modello',
    remove: 'Elimina modello',
    openFolder: 'Apri la cartella dei modelli',
    newName: 'Nuovo modello',
    confirmRemove: (name: string) => `Eliminare il modello «${name}»? Finirà nel cestino.`,
    empty: 'Scegli un modello a sinistra per modificarlo.',
  },

  clock: {
    lunarPrefix: 'Calendario lunare',
    pomodoroDone: '🍅 Pomodoro finito',
    pomodoroDoneBody: 'Il tempo di concentrazione è finito: fai una pausa',
    hourlyChime: 'Segnale orario',
    hourlyBody: (hour: number, zone: string) => `Sono le ${hour}:00 a ${zone}`,
    hourlyOn: 'Segnale orario: attivo',
    hourlyOff: 'Segnale orario: disattivo',
    startFocus: 'Inizia',
    pauseFocus: 'Pausa',
    resetFocus: 'Reimposta il pomodoro',
    toMoo: 'Passa all orologio del somaro',
  },

  schedule: {
    newSchedule: 'Nuovo evento',
    done: 'Segna come fatto',
    undone: 'Segna come da fare',
    today: 'Oggi',
    week: 'Questa settimana',
    all: 'Tutto',
    month: 'Mese',
    allTags: 'Tutti',
    empty: 'Niente in programma',
    overdue: 'In ritardo',
    edit: 'Modifica evento',
    muteOn: 'Promemoria attivi: clicca per silenziare',
    muteOff: 'Promemoria silenziati: clicca per attivare',
    stop: 'Ferma il promemoria',
    snooze: 'Più tardi',
    minutesShort: (value: number) => `${value} min`,
    complete: 'Fatto',
    moreBanners: (value: number) => `altri ${value} promemoria`,
  },

  scheduleEditor: {
    title: 'Modifica evento',
    newTitle: 'Nuovo evento',
    name: 'Titolo',
    date: 'Data',
    time: 'Ora',
    repeat: 'Ripetizione',
    tag: 'Tipo',
    noTag: 'Senza tipo',
    reminder: 'Promemoria',
  },

  reminderFields: {
    channel: 'Canale',
    lead: 'Anticipo',
    topmost: 'Sempre in primo piano',
    focus: 'Prendi il focus',
    visual: 'Stile',
    repeat: 'Ripetizione',
    every: 'ogni',
    atMost: 'al massimo',
    times: 'volte',
    unlimited: '0 = finché non lo fermi',
  },

  reminderWindow: {
    title: 'Promemoria',
    stop: 'Ferma',
    stopAll: 'Ferma tutto',
    snooze: 'Più tardi',
    done: 'Fatto',
    minutes: (value: number) => `${value} min`,
    overdue: (value: number) => `${value} min di ritardo`,
    round: (value: number) => `avviso ${value}`,
    more: (value: number) => `altri ${value}`,
  },

  widgetSettings: {
    title: 'Widget',
    show: 'Mostra',
    pin: 'Tieni in primo piano',
    resetPositions: 'Reimposta tutte le posizioni',
  },

  mooSettings: {
    title: 'Aspetto',
    shape: 'Forma della finestra',
    float: 'Fluttuante',
    island: 'Isola',
    islandHint: 'L isola sta centrata in alto sullo schermo e si apre al passaggio del mouse.',
  },

  reminderSettings: {
    title: 'Promemoria',
    mute: 'Silenzia tutto',
    fallback:
      'Usa una finestra quando scatta un promemoria interno e il widget Agenda è nascosto',
    defaults: 'Valori predefiniti dei nuovi eventi',
  },

  notebookSettings: {
    vaultLock: 'Blocca la cassaforte dopo inattività di',
    vaultBackup:
      'Fare il backup della cassaforte significa copiare l\'intera cartella «vault» accanto al programma; ripristinare significa ricopiarla indietro. Contiene solo testo cifrato con nomi casuali, e copiarne un singolo file non basta a ripristinare nulla.',
    title: 'Note',
    autoSave: 'Salvataggio automatico dopo',
  },

  tagSettings: {
    title: 'Tipi di evento',
    intro:
      'Elenco e vista mensile sono colorati per tipo. Eliminando un tipo i suoi eventi restano senza tipo: non vengono eliminati.',
    name: 'Nome',
    color: 'Colore',
    add: 'Aggiungi tipo',
    reset: 'Ripristina i valori predefiniti',
    untitled: 'Nuovo tipo',
  },

  workSettings: {
    schedule: 'Orario',
    mode: 'Turni',
    weekly: 'Uguale ogni settimana',
    biweekly: 'Settimane alternate',
    weekA: 'Settimana A',
    weekB: 'Settimana B',
    anchor: 'Data di riferimento',
    anchorEmpty: 'Non impostata',
    anchorPick: 'Scegli nel calendario',
    anchorDone: 'Chiudi il calendario',
    anchorHint:
      'La settimana di calendario che contiene questa data vale come settimana A; le altre si alternano a partire da lì.',
    breakLabel: 'Pausa pranzo',
    overtimePaid: 'Gli straordinari sono pagati',
    overtimeRate: 'Maggiorazione',
    salary: 'Struttura dello stipendio',
    incomes: 'Entrate',
    deducts: 'Trattenute',
    addIncome: 'Aggiungi entrata',
    addDeduct: 'Aggiungi trattenuta',
    namePlaceholder: 'Nome',
    monthly: 'Mensile',
    weekly2: 'Settimanale',
    yearly: 'Annuale',
    once: 'Una tantum',
    payMonth: 'Pagata a',
    fixed: 'Importo fisso',
    percent: 'Percentuale',
    summary: 'Risultato',
    disposable: 'Netto al mese',
    standard: 'Ore mensili di riferimento',
    baseRate: 'Tariffa oraria base',
    salaryHint:
      'Un importo una tantum (una tredicesima, per esempio) conta tutto nel mese in cui viene pagato: in quel mese la tariffa oraria sale parecchio.',
    lossHint:
      'Lo stipendio è facoltativo: il tasso di perdita guarda solo la quota di straordinari non pagati, mai l importo.',
    counter: 'Contatore dei guadagni',
    cycle: 'Periodo',
    cycleMonth: 'Mensile',
    cycleWeek: 'Settimanale',
    cycleDay: 'Giornaliero',
    cycleStart: 'Il periodo inizia il',
    dayOfMonth: 'del mese',
    unit: 'Mostra come',
    unitMonth: 'Al mese',
    unitDay: 'Al giorno',
    unitHour: 'All ora',
    unitMinute: 'Al minuto',
    showCents: 'Mostra i decimali (vederli scorrere è il bello)',
    counterHint:
      'Segue l orario previsto: anche battere la fiacca rende, perché quello che si paga è il tempo.',
  },

  activitySettings: {
    title: 'Attività',
    intro:
      'L orologio del somaro usa l attività del computer per distinguere una giornata piena da una vuota. Tutto resta su questa macchina e non viene mai caricato: solo il numero di tasti premuti (non quali, non in che ordine), la distanza percorsa dal mouse, il nome dell exe in primo piano e i segnali attivati qui sotto. I titoli delle finestre non vengono mai raccolti.',
    enable: 'Raccogli attività',
    mic: 'Microfono / videocamera in uso',
    micHint:
      'Legge un solo valore vero/falso — se il dispositivo è occupato — per stimare il tempo in riunione. Non tocca audio né video e non annota quale programma li usa.',
    audio: 'Riproduzione audio',
    audioHint: 'Legge solo se il sistema sta emettendo suono, per distinguere il guardare dal lavorare.',
    away: 'Assente dopo',
    awayHint: 'Senza input per più di questo tempo, non conta più come presenza.',
    retain: 'Conserva i dati per',
    days: 'giorni',
    clear: 'Elimina tutti i dati di attività',
    cleared: 'Eliminati',
    unknown: 'Programmi non classificati',
    unknownHint:
      'Finché non sono classificati, il motore dell umore non sa se stai chattando o scrivendo codice.',
    autoClassify: 'Classifica con l IA',
    classifying: 'Classificazione…',
    llmOff: 'Imposta prima un endpoint e una chiave in «Battute IA»',
    autoHint:
      'Invia solo il nome del file e il nome del prodotto di questi programmi al tuo endpoint perché indovini la categoria. Solo questi due, mai i titoli delle finestre.',
    classifyFailed: 'Classificazione non riuscita: l endpoint non ha restituito nulla di utile.',
    todayHead: 'Oggi',
    present: 'Alla scrivania',
    effective: 'Lavoro effettivo',
    meeting: 'Riunioni',
    disabled: 'La raccolta è disattivata, quindi tutti i numeri qui sotto sono 0.',
  },

  llmSettings: {
    title: 'Battute IA (facoltativo)',
    intro:
      'Con un endpoint compatibile con OpenAI le battute sono più varie. La richiesta parte dal backend locale, quindi la chiave non entra mai nella vista web; in caso di errore, timeout o risposta inattesa si torna in silenzio alle battute locali e l interfaccia non si blocca mai.',
    enable: 'Usa le battute IA',
    baseUrl: 'Endpoint',
    model: 'Modello',
    apiKey: 'Chiave API',
    keySet: 'Chiave salvata',
    keyEmpty: 'Non impostata',
    clear: 'Cancella',
    timeout: 'Timeout',
    ms: 'ms',
    sendSalary: 'Consenti l invio dei dati di paga (tariffa oraria, importo non pagato)',
    sends: 'Inviato per impostazione predefinita',
    never: 'Mai inviato',
    sendList:
      'Il nome dello stato d umore; perdita, fiacca e intensità come tre numeri fra 0 e 1; minuti alla scrivania, di straordinario e in riunione di oggi.',
    neverList:
      'Nomi di applicazioni, titoli di finestre, titoli di eventi, percorsi di file, tasti premuti. La struttura della richiesta del backend non ha un campo per nessuno di questi.',
    rate: 'Solo quando cambia lo stato d umore, e al massimo una volta ogni cinque minuti.',
  },

  shortcutSettings: {
    title: 'Scorciatoie',
    intro:
      'Le scorciatoie globali funzionano in qualsiasi programma e vengono registrate di nuovo appena le cambi, senza riavviare. Le impostazioni predefinite usano Ctrl+Alt+numero: un semplice Ctrl+numero toglierebbe quel tasto a tutti gli altri programmi (schede del browser, gruppi dell editor) senza che si capisca perché.',
    record: 'Clicca per registrare',
    recording: 'Premi una combinazione… (Esc per annullare)',
    unbound: 'Non impostata',
    launcher:
      'La scorciatoia di avvio rapido si imposta in «Avvio rapido»; anche un conflitto con quella viene segnalato qui.',
    conflict: (name: string) => `Uguale a «${name}»: ne funzionerà solo una`,
    failed: 'Il sistema ha rifiutato: un altro programma usa già quel tasto. Scegline un altro.',
    inWindow: 'Dentro un widget',
    escapeLabel: 'Togli il widget dal primo piano',
    escapeHint:
      'Solo mentre il focus è nella finestra di un widget. Non occupa alcun tasto globale e per questo non è modificabile.',
    swap: 'Alterna orologio / orologio del somaro',
    pin: 'Fissa / libera',
    launcherAction: 'Scorciatoia di avvio rapido',
  },

  devSettings: {
    title: 'Sviluppatore',
    root: 'Cartella del marcatore',
    hint: 'Metti un file chiamato devmod.dev nella cartella qui sopra e riavvia l applicazione.',
    open: 'Debug dell attività',
    reload: 'Ricarica tutte le finestre',
  },

  about: {
    title: 'Informazioni',
    storage: 'Configurazione e dati',
    storageHint:
      'Configurazione, bozze e dati di attività stanno tutti in questa cartella, ovunque sia installata l applicazione.',
    open: 'Apri la cartella',
    configFailed: 'Impossibile salvare la configurazione',
    configFailedBody: (path: string, reason: string) =>
      `Le modifiche non sono arrivate in ${path}
${reason}
Verifica che la cartella sia scrivibile.`,
  },

  mooPanel: {
    toNormal: 'Passa all orologio normale',
    toIsland: 'Passa all isola',
    toFloat: 'Passa a finestra fluttuante',
    monitorLocked: 'Attiva la raccolta attività nelle impostazioni per vedere i dati di oggi',
    loss: 'Perdita',
    slack: 'Fiacca',
    intensity: 'Intensità',
    startFishing: 'Battere la fiacca (travestito da orologio normale)',
    stopFishing: 'Esci dalla modalità fiacca',
    feed: 'Dagli da mangiare',
    report: 'Resoconto del giorno',
    feedEmpty: 'Oggi non è rimasto nulla da dargli.',
    feedHint: 'Trascina un impegno da fare sulla faccia',
    feedNow: 'Dai',
  },

  report: {
    title: 'Resoconto del giorno',
    older: 'Giorno precedente',
    newer: 'Giorno successivo',
    empty: 'Ancora nessun resoconto. Viene scritto dopo la fine della giornata.',
    present: 'Alla scrivania',
    effective: 'Lavoro effettivo',
    slack: 'Fiacca',
    meeting: 'Riunioni',
    overtime: 'Straordinari',
    wasted: 'Non pagato',
    earned: 'Guadagnato',
    fishing: 'Fiacca pagata',
    fishingValue: 'Netto',
    fed: 'Pasti dati',
    times: 'volte',
    mood: 'Umore di oggi',
    noActivity:
      'Oggi non è stata registrata alcuna attività: forse il computer era spento, o la raccolta è disattivata.',
  },

  earnings: {
    locked: 'Imposta lo stipendio per sbloccare il contatore',
    earned: 'Guadagnato',
    wasted: 'Non pagato',
    month: 'Questo mese',
    week: 'Questa settimana',
    day: 'Oggi',
    unitMonth: 'Al mese',
    unitDay: 'Al giorno',
    unitHour: 'All ora',
    unitMinute: 'Al minuto',
  },

  notebookPanel: {
    vaultBackedUp: 'Salvataggio non riuscito; il testo è in un backup cifrato dentro la cassaforte',
    vaultSaveLost: "L'ultima modifica non è stata salvata",
    vaultFailed: (reason: string) => `Operazione della cassaforte non riuscita: ${reason}`,
    vaultNewNote: 'Nuova nota.dtnote',
    vaultKeptPlain: (name: string) =>
      `«${name}» è stata cifrata, ma la copia in chiaro non è stata eliminata — rimuovila a mano`,
    vaultNotMoved: (name: string, reason: string) => `«${name}» non spostata: ${reason}`,
    vaultMoveInTitle: 'Sposta nella cassaforte',
    vaultMovedIn: (count: number) =>
      `${count} note ora sono cifrate nella cassaforte. I file in chiaro sono stati eliminati subito, senza passare dal cestino.`,
    vaultDeleteTitle: 'Elimina una nota privata',
    vaultDeleteBody: (name: string) =>
      `«${name}» sarà eliminata definitivamente dalla cassaforte. Non va nel cestino e non si può recuperare.`,
    vaultMoveOutTitle: 'Porta fuori dalla cassaforte',
    vaultMoveOutBody: (name: string) =>
      `«${name}» sarà decifrata in un normale file .dtnote e tolta dalla cassaforte.`,
    vaultMoveOutWarning:
      "È l'unica operazione che riporta un contenuto privato a essere leggibile. Una volta scritto, chiunque può aprirlo.",
    vaultMoveOutAction: 'Decifra ed esci',
    placeholder: 'Annota qualcosa…',
    toggleSidebar: 'File',
    saveAs: 'Salva con nome',
    openFile: 'Apri un file esistente',
    newFolderName: 'Nuova cartella',
    unsaved: 'Non salvato',
    saving: 'Salvataggio…',
    saved: (at: string) => `Salvato ${at}`,
    draft: 'Bozza · non su disco',
    saveFailed: 'Salvataggio non riuscito; il testo è in una copia locale',
    renameFailed: (reason: string) => `Rinomina non riuscita: ${reason}`,
    deleteFailed: (reason: string) => `Eliminazione non riuscita: ${reason}`,
    empty: 'Crea o apri un file a sinistra',
    deleteFileTitle: 'Elimina il file',
    deleteFileBody: (name: string) =>
      `«${name}» finirà nel cestino di Windows e potrà essere ripristinato.`,
    deleteFolderTitle: 'Elimina la cartella',
    deleteFolderEmpty: (name: string) => `«${name}» è vuota e verrà rimossa.`,
    deleteFolderBody: (name: string, count: number) =>
      `«${name}» contiene ${count} file; finiranno tutti nel cestino di Windows:`,
    andMore: (count: number) => `e altri ${count}`,
    deleteDraftTitle: 'Elimina la bozza',
    deleteDraftBody: (name: string) =>
      `«${name}» non è mai stata salvata su disco; eliminarla è irreversibile.`,
    deleteAnyway: 'Elimina comunque',
    openFailed: (reason: string) => `Impossibile aprire: ${reason}`,
    migrateTitle: 'Converti le note vecchie in .dtnote',
    migrateBody: (count: number) =>
      `Trovate ${count} note nel vecchio formato. Ognuna diventa un solo file .dtnote con le immagini dentro; l'originale va nel cestino di Windows e resta recuperabile, i file immagine restano dove sono.`,
    migrateImages: (count: number) => `${count} immagini`,
    migrateWarnExternal: (reference: string) =>
      `Questa immagine non entrerà nella nota e resta dov'è: ${reference}`,
    migrateWarnShared: (reference: string) =>
      `Usata da più note; ognuna ne tiene una copia: ${reference}`,
    migrateWarnRemote: (reference: string) => `Sul web, lasciata com'è: ${reference}`,
    migrateWarnTargetExists: 'Esiste già un .dtnote con quel nome; questa nota viene saltata',
    migrateStart: 'Converti',
    migrateLater: 'Più tardi',
    migrateDoneTitle: 'Conversione completata',
    migrateDoneBody: (converted: number, failed: number) =>
      `${converted} convertite, ${failed} lasciate invariate. Il registro completo è nella cartella logs.`,
    migrateFailed: (reason: string) => `Conversione non riuscita: ${reason}`,
    legacyNote: 'Appunto rapido (vecchio)',
    draftPrefix: 'Bozza ',
  },

  editor: {
    bold: 'Grassetto',
    italic: 'Corsivo',
    heading: 'Titolo',
    bullet: 'Elenco puntato',
    checklist: 'Elenco di cose da fare',
    preview: 'Anteprima',
    edit: 'Modifica',
    chars: 'car.',
  },

  sidebar: {
    vault: 'Cassaforte',
    vaultLock: 'Blocca adesso',
    vaultEmpty: 'La cassaforte è vuota',
    vaultMoveIn: 'Sposta nella cassaforte',
    vaultMoveOut: 'Porta fuori dalla cassaforte',
    search: 'Cerca',
    drafts: 'Bozze',
    reveal: 'Mostra in Esplora file',
    newFileHere: 'Nuovo file in questa cartella',
    missing: 'File mancante',
    unsaved: 'Non salvato',
    empty: 'Ancora nessun file salvato',
    webOnly: 'Per salvare serve l applicazione desktop',
  },

  vault: {
    createTitle: 'Crea la cassaforte',
    createBody:
      'Scegli una password e una domanda tua. Servono entrambe, e la password è di almeno 8 caratteri.',
    unlockTitle: 'La cassaforte è bloccata',
    recoverTitle: 'Sblocca con la tua domanda',
    resetTitle: 'Imposta una nuova password',
    resetBody: 'Risposta esatta. Imposta una nuova password prima di entrare.',
    password: 'Password',
    passwordAgain: 'Di nuovo',
    newPassword: 'Nuova password',
    question: 'La tua domanda',
    answer: 'Risposta',
    answerAgain: 'Ripeti la risposta',
    answerWarning:
      'La risposta è una seconda password: apre tutto quello che apre la password, quindi la cassaforte vale quanto la più debole delle due. Evita cose indovinabili, come il nome della tua prima scuola.',
    questionWarning:
      'La domanda è leggibile anche a cassaforte bloccata: non metterci dentro un segreto.',
    forgot: 'Password dimenticata?',
    backToPassword: 'Torna alla password',
    delayNote:
      'Ogni errore allunga l\'attesa, ma questo rallenta solo i tentativi fatti da qui. Chi ha una copia della cartella può provare offline quanto vuole: la difesa vera è quanto sono forti la password e la risposta.',
    rejected: 'Password o risposta sbagliata, oppure i dati sono danneggiati',
    working: 'In corso…',
    createAction: 'Crea',
    unlockAction: 'Sblocca',
    resetAction: 'Imposta la password',
  },

  calendar: {
    previous: 'Mese precedente',
    next: 'Mese successivo',
    backToToday: 'Torna a oggi',
    rest: 'Libero',
    work: 'Lavoro',
    weekdayHeads: ['D', 'L', 'M', 'M', 'G', 'V', 'S'],
    weekdays: ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'],
  },

  launcherWindow: {
    placeholder: 'Cerca applicazioni, cartelle, collegamenti',
    empty: 'Nessun risultato',
    desktop: 'Desktop',
    menu: 'Menu Start',
  },

  contextMenu: {
    pin: 'Tieni in primo piano',
    show: 'Mostra',
    reset: 'Reimposta la posizione di questa finestra',
  },

  widgetShell: {
    pinTop: 'Tieni in primo piano',
    unpinTop: 'Non tenere più in primo piano',
    resize: 'Trascina per ridimensionare',
  },

  desktopPanel: {
    empty: 'Non c è nulla da mostrare sul desktop.',
  },

  widgetNames: {
    clock: 'Orologio',
    note: 'Note',
    schedule: 'Agenda',
    moo: 'Orologio del somaro',
    desktop: 'Livello desktop',
  },

  themeNames: {
    default: 'Predefinito',
    cyber: 'Ufficio cyber',
    concrete: 'Cemento',
    fish: 'Verde fiacca',
    bossAway: 'Il capo non c è',
    paper: 'Carta',
  },

  categories: {
    chat: 'Messaggistica',
    dev: 'Sviluppo',
    office: 'Documenti',
    browser: 'Browser',
    media: 'Media',
    design: 'Design',
    other: 'Altro',
  },

  scheduleData: {
    tagWork: 'Lavoro',
    tagLife: 'Personale',
    tagImportant: 'Importante',
    tagStudy: 'Studio',
    repeatNone: 'Non si ripete',
    repeatDaily: 'Ogni giorno',
    repeatWeekly: 'Ogni settimana',
    repeatWeekday: 'Nei giorni feriali',
    seedTitle: 'Mettere in ordine le priorità di oggi',
    remaining: (count: number) => `${count} da fare`,
    allDone: 'Tutto fatto 🎉',
  },

  reminderData: {
    channelOff: 'Nessun promemoria',
    channelInapp: 'Nell applicazione',
    channelDesktop: 'Finestra',
    channelToast: 'Notifica di sistema',
    visualStatic: 'Senza animazione',
    visualBreathe: 'Bordo che respira',
    visualBlink: 'Finestra lampeggiante',
    visualShake: 'Scossa',
  },

  timeZones: {
    beijing: 'Ora di Pechino',
    local: 'Ora locale',
  },

  // Not translated: these lines are the widget's personality, and the joke does
  // not survive a literal rendering. Localising them means rewriting them for
  // the language, which is a writing job — until someone does it, English is a
  // more honest answer than a flat translation.
  moo: enUS.moo,

  notebook: {
    newFile: 'Nuova nota',
    newFromTemplate: 'Nuova da modello',
    newFolder: 'Nuova cartella',
  },

  launcher: {
    title: 'Avvio rapido',
    intro:
      'La scorciatoia apre la barra al centro dello schermo: digita le iniziali o parte del nome per avviare i programmi del desktop e del menu Start. L’indice si costruisce in background, quindi la digitazione non attende mai.',
    hotkey: 'Scorciatoia di avvio rapido',
    hotkeyHint:
      'Ha effetto subito. Se un gioco a schermo intero o un’altra applicazione usa già quel tasto la registrazione fallisce: scegline un altro.',
  },

  plugins: {
    browserAccess: (sites: string) =>
      `Questo è un plugin browser: apre ${sites} e può leggere e modificare il contenuto delle pagine che vedi su quei siti. I suoi accessi restano nel profilo di navigazione del plugin, non condiviso né con DeskTime né con altri plugin.`,
    title: 'Plugin',
    intro:
      'I plugin vivono nella cartella plugins, una directory ciascuno. Dopo aver modificato un plugin.json, premi Ricarica — non serve riavviare.',
    openFolder: 'Apri la cartella dei plugin',
    reload: 'Ricarica',
    reloading: 'Ricaricamento…',
    options: 'Opzioni',
    viewLog: 'Vedi il registro',
    enabled: 'Attivo',
    permissions: 'Autorizzazioni',
    backend: 'Processo di backend',
    none: 'Nessun plugin installato.',
    failed: (reason: string) => `Caricamento non riuscito: ${reason}`,
    backendFailed: 'Il processo di backend è uscito ripetutamente; i tentativi sono stati interrotti.',
  },
}
