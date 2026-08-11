// Français. Typed against zh-CN: a missing key will not compile.

import { enUS } from './en-US'
import type { Locale } from './zh-CN'

export const frFR: Locale = {
  language: { name: 'Français' },

  common: {
    cancel: 'Annuler',
    confirm: 'OK',
    delete: 'Supprimer',
    save: 'Enregistrer',
    close: 'Fermer',
    open: 'Ouvrir',
    add: 'Ajouter',
    edit: 'Modifier',
    rename: 'Renommer',
    reset: 'Réinitialiser',
    seconds: 's',
    minutes: 'min',
    pixels: 'px',
  },

  settings: {
    title: 'Paramètres',
    navGlobal: 'Général',
    navGeneral: 'Apparence',
    navWidgets: 'Widgets',
    navShortcuts: 'Raccourcis',
    navStartup: 'Démarrage et arrière-plan',
    navAbout: 'À propos',
    navNotebook: 'Notes',
    navNotebookGeneral: 'Général',
    navTemplates: 'Modèles',
    navSchedule: 'Agenda',
    navReminders: 'Rappels',
    navTags: 'Types d’événement',
    navMoo: 'Horloge du forçat',
    navMooShape: 'Apparence',
    navWork: 'Horaires et salaire',
    navActivity: 'Activité',
    navLlm: 'Répliques IA',
    navLauncher: 'Lanceur',
    navPlugins: 'Extensions',
    navDev: 'Développeur',
  },

  general: {
    title: 'Apparence',
    theme: 'Thème',
    language: 'Langue',
    timeZone: 'Fuseau horaire',
    followSystem: 'Suivre le système',
    fixedZone: 'Fuseau fixe',
  },

  startup: {
    title: 'Démarrage et arrière-plan',
    autostart: 'Lancer au démarrage de Windows',
    autostartHint:
      'Ouvre les fenêtres de DeskTime après la connexion. Aucun droit administrateur requis.',
    service: 'Protection en arrière-plan',
    serviceHint:
      'Maintient la collecte et les rappels après la fermeture des fenêtres. Une réparation est proposée uniquement en cas d’anomalie.',
    serviceOff: 'Protection absente, mode dégradé',
    serviceInstalled: 'Protection installée mais arrêtée',
    serviceRunning: 'Protection opérationnelle',
    waiting: 'En attente d’autorisation…',
    dismissed: 'Autorisation annulée : DeskTime reste en mode dégradé.',
    repair: 'Réparer',
  },

  templates: {
    title: 'Modèles de note',
    intro:
      'Les modèles sont des fichiers .md du dossier templates ; ajoutez-les ou supprimez-les directement dans ce dossier. La flèche à côté de « Nouveau » dans les notes les répertorie ; en choisir un crée un brouillon à partir de celui-ci.',
    variables: 'Variables : {{date}} {{time}} {{datetime}} {{weekday}} {{title}}',
    create: 'Nouveau modèle',
    remove: 'Supprimer le modèle',
    openFolder: 'Ouvrir le dossier des modèles',
    newName: 'Nouveau modèle',
    confirmRemove: (name: string) =>
      `Supprimer le modèle « ${name} » ? Il ira à la corbeille.`,
    empty: 'Choisissez un modèle à gauche pour le modifier.',
  },

  clock: {
    lunarPrefix: 'Calendrier lunaire',
    pomodoroDone: '🍅 Pomodoro terminé',
    pomodoroDoneBody: 'Le temps de concentration est écoulé — faites une pause',
    hourlyChime: 'Carillon horaire',
    hourlyBody: (hour: number, zone: string) => `Il est ${hour} h à ${zone}`,
    hourlyOn: 'Carillon horaire : activé',
    hourlyOff: 'Carillon horaire : désactivé',
    startFocus: 'Démarrer',
    pauseFocus: 'Pause',
    resetFocus: 'Réinitialiser le pomodoro',
    toMoo: 'Passer à l’horloge du forçat',
  },

  schedule: {
    newSchedule: 'Nouvel événement',
    done: 'Marquer comme fait',
    undone: 'Marquer comme à faire',
    today: 'Aujourd’hui',
    week: 'Cette semaine',
    all: 'Tout',
    month: 'Mois',
    allTags: 'Tous',
    empty: 'Rien de prévu',
    overdue: 'En retard',
    edit: 'Modifier l’événement',
    muteOn: 'Rappels activés — cliquer pour couper',
    muteOff: 'Rappels coupés — cliquer pour activer',
    stop: 'Arrêter le rappel',
    snooze: 'Plus tard',
    minutesShort: (value: number) => `${value} min`,
    complete: 'Fait',
    moreBanners: (value: number) => `${value} rappels de plus`,
  },

  scheduleEditor: {
    title: 'Modifier l’événement',
    newTitle: 'Nouvel événement',
    name: 'Titre',
    date: 'Date',
    time: 'Heure',
    repeat: 'Répétition',
    tag: 'Type',
    noTag: 'Sans type',
    reminder: 'Rappel',
  },

  reminderFields: {
    channel: 'Canal',
    lead: 'À l’avance',
    topmost: 'Au premier plan',
    focus: 'Prendre le focus',
    visual: 'Style',
    repeat: 'Répétition',
    every: 'toutes les',
    atMost: 'au plus',
    times: 'fois',
    unlimited: '0 = jusqu’à l’arrêt',
  },

  reminderWindow: {
    title: 'Rappel',
    stop: 'Arrêter',
    stopAll: 'Tout arrêter',
    snooze: 'Plus tard',
    done: 'Fait',
    minutes: (value: number) => `${value} min`,
    overdue: (value: number) => `${value} min de retard`,
    round: (value: number) => `sonnerie ${value}`,
    more: (value: number) => `${value} de plus`,
  },

  widgetSettings: {
    title: 'Widgets',
    show: 'Afficher',
    pin: 'Garder au-dessus',
    resetPositions: 'Réinitialiser toutes les positions',
  },

  mooSettings: {
    title: 'Apparence',
    shape: 'Forme de la fenêtre',
    float: 'Flottante',
    island: 'Îlot',
    islandHint: 'L’îlot se place en haut au centre de l’écran et s’ouvre au survol.',
  },

  reminderSettings: {
    title: 'Rappels',
    mute: 'Tout couper',
    fallback:
      'Utiliser une fenêtre lorsqu’un rappel intégré se déclenche et que le widget Agenda est masqué',
    defaults: 'Valeurs par défaut des nouveaux événements',
  },

  notebookSettings: {
    vaultLock: 'Verrouiller le coffre après une inactivité de',
    vaultBackup:
      "Sauvegarder le coffre, c'est copier tout le dossier « vault » situé à côté du programme ; restaurer, c'est le recopier. Il ne contient que du chiffré sous des noms aléatoires, et copier un seul fichier ne suffit pas à restaurer quoi que ce soit.",
    title: 'Notes',
    autoSave: 'Enregistrement automatique après',
  },

  tagSettings: {
    title: 'Types d’événement',
    intro:
      'La liste et la vue mensuelle sont colorées par type. Supprimer un type laisse ses événements sans type ; il ne les supprime pas.',
    name: 'Nom',
    color: 'Couleur',
    add: 'Ajouter un type',
    reset: 'Rétablir les valeurs par défaut',
    untitled: 'Nouveau type',
  },

  workSettings: {
    schedule: 'Horaires',
    mode: 'Rythme',
    weekly: 'Identique chaque semaine',
    biweekly: 'Semaines alternées',
    weekA: 'Semaine A',
    weekB: 'Semaine B',
    anchor: 'Date de référence',
    anchorEmpty: 'Non définie',
    anchorPick: 'Choisir dans le calendrier',
    anchorDone: 'Fermer le calendrier',
    anchorHint:
      'La semaine civile contenant cette date compte comme semaine A ; les autres alternent à partir de là.',
    breakLabel: 'Pause déjeuner',
    overtimePaid: 'Les heures supplémentaires sont payées',
    overtimeRate: 'Majoration',
    salary: 'Structure de la paie',
    incomes: 'Revenus',
    deducts: 'Retenues',
    addIncome: 'Ajouter un revenu',
    addDeduct: 'Ajouter une retenue',
    namePlaceholder: 'Intitulé',
    monthly: 'Mensuel',
    weekly2: 'Hebdomadaire',
    yearly: 'Annuel',
    once: 'Ponctuel',
    payMonth: 'Versé en',
    fixed: 'Montant fixe',
    percent: 'Pourcentage',
    summary: 'Résultat',
    disposable: 'Net par mois',
    standard: 'Heures mensuelles de référence',
    baseRate: 'Taux horaire de base',
    salaryHint:
      'Un revenu ponctuel (une prime, par exemple) compte entièrement le mois de son versement : le taux horaire y est nettement plus élevé.',
    lossHint:
      'La paie est facultative : le taux de perte ne regarde que la part des heures non payées, jamais le montant.',
    counter: 'Compteur de gains',
    cycle: 'Période',
    cycleMonth: 'Mensuelle',
    cycleWeek: 'Hebdomadaire',
    cycleDay: 'Quotidienne',
    cycleStart: 'Début de période',
    dayOfMonth: 'du mois',
    unit: 'Afficher en',
    unitMonth: 'Par mois',
    unitDay: 'Par jour',
    unitHour: 'Par heure',
    unitMinute: 'Par minute',
    showCents: 'Afficher les décimales (le défilement, c’est tout l’intérêt)',
    counterHint:
      'Il suit les horaires prévus : tirer au flanc rapporte aussi, puisque c’est le temps qui est payé.',
  },

  activitySettings: {
    title: 'Activité',
    intro:
      'L’horloge du forçat se sert de l’activité de l’ordinateur pour distinguer une journée chargée d’une journée creuse. Tout reste sur cette machine et n’est jamais envoyé : seulement le nombre de frappes (ni lesquelles, ni leur ordre), la distance parcourue par la souris, le nom de l’exe au premier plan, et les signaux activés ci-dessous. Les titres de fenêtre ne sont jamais collectés.',
    enable: 'Collecter l’activité',
    mic: 'Microphone / caméra utilisés',
    micHint:
      'Lit un seul booléen — l’appareil est-il occupé — pour estimer le temps en réunion. Ni l’audio ni la vidéo ne sont touchés, et le programme qui les utilise n’est pas noté.',
    audio: 'Lecture audio',
    audioHint: 'Lit seulement si le système émet du son, pour distinguer regarder de travailler.',
    away: 'Absent après',
    awayHint: 'Passé ce délai sans saisie, le temps ne compte plus comme présence.',
    retain: 'Conserver les données',
    days: 'jours',
    clear: 'Supprimer toutes les données d’activité',
    cleared: 'Supprimées',
    unknown: 'Programmes non classés',
    unknownHint:
      'Tant qu’ils ne sont pas classés, le moteur d’humeur ne sait pas si vous discutez ou codez.',
    autoClassify: 'Classer par IA',
    classifying: 'Classement…',
    llmOff: 'Renseignez d’abord un point d’accès et une clé dans « Répliques IA »',
    autoHint:
      'Envoie uniquement le nom de fichier et le nom de produit de ces programmes à votre point d’accès pour qu’il devine la catégorie. Ces deux-là seulement, jamais les titres de fenêtre.',
    classifyFailed: 'Échec du classement : le point d’accès n’a rien renvoyé d’exploitable.',
    todayHead: 'Aujourd’hui',
    present: 'Au poste',
    effective: 'Travail réel',
    meeting: 'Réunions',
    disabled: 'La collecte est désactivée : tous les chiffres ci-dessous sont à 0.',
  },

  llmSettings: {
    title: 'Répliques IA (facultatif)',
    intro:
      'Avec un point d’accès compatible OpenAI, les répliques sont plus variées. La requête part du backend local, la clé n’entre donc jamais dans la vue web ; en cas d’échec, de délai dépassé ou de réponse inattendue, on retombe silencieusement sur les répliques locales sans jamais bloquer l’interface.',
    enable: 'Utiliser les répliques IA',
    baseUrl: 'Point d’accès',
    model: 'Modèle',
    apiKey: 'Clé API',
    keySet: 'Clé enregistrée',
    keyEmpty: 'Non définie',
    clear: 'Effacer',
    timeout: 'Délai',
    ms: 'ms',
    sendSalary: 'Autoriser l’envoi des chiffres de paie (taux horaire, montant non payé)',
    sends: 'Envoyé par défaut',
    never: 'Jamais envoyé',
    sendList:
      'Le nom de l’état d’humeur ; perte, oisiveté et intensité sous forme de trois nombres entre 0 et 1 ; minutes au poste, en heures supplémentaires et en réunion aujourd’hui.',
    neverList:
      'Noms d’applications, titres de fenêtres, titres d’événements, chemins de fichiers, frappes clavier. La structure de requête du backend n’a de champ pour aucun d’eux.',
    rate: 'Uniquement au changement d’état d’humeur, et au plus une fois toutes les cinq minutes.',
  },

  shortcutSettings: {
    title: 'Raccourcis',
    intro:
      'Les raccourcis globaux fonctionnent dans tous les programmes et sont réenregistrés dès la modification — sans redémarrage. Les valeurs par défaut utilisent Ctrl+Alt+chiffre : un simple Ctrl+chiffre prendrait cette touche à tous les autres programmes (onglets du navigateur, groupes de l’éditeur) sans qu’on puisse deviner pourquoi.',
    record: 'Cliquer pour enregistrer',
    recording: 'Appuyez sur une combinaison… (Échap pour annuler)',
    unbound: 'Non défini',
    launcher:
      'Le raccourci du lanceur se règle dans « Lanceur » ; un conflit avec lui est aussi signalé ici.',
    conflict: (name: string) => `Identique à « ${name} » — un seul des deux fonctionnera`,
    failed:
      'Le système a refusé : un autre programme occupe déjà cette touche. Choisissez-en une autre.',
    inWindow: 'Dans un widget',
    escapeLabel: 'Ne plus garder le widget au-dessus',
    escapeHint:
      'Uniquement quand le focus est dans une fenêtre de widget. Il n’occupe aucune touche globale et n’est donc pas modifiable.',
    swap: 'Basculer horloge / horloge du forçat',
    pin: 'Épingler / détacher',
    launcherAction: 'Raccourci du lanceur',
  },

  devSettings: {
    title: 'Développeur',
    root: 'Dossier du marqueur',
    hint:
      'Placez un fichier nommé devmod.dev dans le dossier ci-dessus et redémarrez l’application.',
    open: 'Débogueur d’activité',
    reload: 'Recharger toutes les fenêtres',
  },

  about: {
    title: 'À propos',
    storage: 'Configuration et données',
    storageHint:
      'La configuration, les brouillons et les données d’activité sont tous dans ce dossier, là où l’application est installée.',
    open: 'Ouvrir le dossier',
    configFailed: 'La configuration n’a pas pu être enregistrée',
    configFailedBody: (path: string, reason: string) =>
      `Les modifications ne sont pas arrivées dans ${path}
${reason}
Vérifiez que le dossier est accessible en écriture.`,
  },

  mooPanel: {
    toNormal: 'Passer à l’horloge simple',
    toIsland: 'Passer à l’îlot',
    toFloat: 'Passer en fenêtre flottante',
    monitorLocked:
      'Activez la collecte d’activité dans les paramètres pour voir les chiffres du jour',
    loss: 'Perte',
    slack: 'Oisiveté',
    intensity: 'Intensité',
    startFishing: 'Tirer au flanc (déguisé en horloge simple)',
    stopFishing: 'Quitter le mode tire-au-flanc',
    feed: 'Nourrir',
    report: 'Bilan du jour',
    feedEmpty: 'Plus rien à lui donner aujourd’hui.',
    feedHint: 'Faites glisser une tâche en cours sur le visage',
    feedNow: 'Donner',
  },

  report: {
    title: 'Bilan du jour',
    older: 'Jour précédent',
    newer: 'Jour suivant',
    empty: 'Pas encore de bilan. Il est écrit après la fin de la journée.',
    present: 'Au poste',
    effective: 'Travail réel',
    slack: 'Oisiveté',
    meeting: 'Réunions',
    overtime: 'Heures sup.',
    wasted: 'Non payé',
    earned: 'Gagné',
    fishing: 'Oisiveté payée',
    fishingValue: 'Net',
    fed: 'Nourri',
    times: 'fois',
    mood: 'Humeur du jour',
    noActivity:
      'Aucune activité n’a été collectée aujourd’hui : la machine était peut-être éteinte, ou la collecte est désactivée.',
  },

  earnings: {
    locked: 'Renseignez la paie pour débloquer le compteur',
    earned: 'Gagné',
    wasted: 'Non payé',
    month: 'Ce mois',
    week: 'Cette semaine',
    day: 'Aujourd’hui',
    unitMonth: 'Par mois',
    unitDay: 'Par jour',
    unitHour: 'Par heure',
    unitMinute: 'Par minute',
  },

  notebookPanel: {
    vaultBackedUp: "Échec de l'enregistrement ; le texte est dans une sauvegarde chiffrée du coffre",
    vaultSaveLost: "La dernière modification n'a pas pu être enregistrée",
    vaultFailed: (reason: string) => `Opération du coffre échouée : ${reason}`,
    vaultNewNote: 'Nouvelle note.dtnote',
    vaultKeptPlain: (name: string) =>
      `« ${name} » a été chiffrée, mais la copie en clair n'a pas pu être supprimée — supprimez-la à la main`,
    vaultNotMoved: (name: string, reason: string) => `« ${name} » non déplacée : ${reason}`,
    vaultMoveInTitle: 'Déplacer dans le coffre',
    vaultMovedIn: (count: number) =>
      `${count} notes sont maintenant chiffrées dans le coffre. Les fichiers en clair ont été supprimés directement, sans passer par la corbeille.`,
    vaultDeleteTitle: 'Supprimer une note privée',
    vaultDeleteBody: (name: string) =>
      `« ${name} » sera supprimée définitivement du coffre. Elle ne va pas à la corbeille et ne peut pas être récupérée.`,
    vaultMoveOutTitle: 'Sortir du coffre',
    vaultMoveOutBody: (name: string) =>
      `« ${name} » sera déchiffrée dans un fichier .dtnote ordinaire et retirée du coffre.`,
    vaultMoveOutWarning:
      "C'est la seule opération qui rend un contenu privé de nouveau lisible. Une fois écrit, n'importe qui peut l'ouvrir.",
    vaultMoveOutAction: 'Déchiffrer et sortir',
    placeholder: 'Notez quelque chose…',
    toggleSidebar: 'Fichiers',
    saveAs: 'Enregistrer sous',
    openFile: 'Ouvrir un fichier existant',
    newFolderName: 'Nouveau dossier',
    unsaved: 'Non enregistré',
    saving: 'Enregistrement…',
    saved: (at: string) => `Enregistré ${at}`,
    draft: 'Brouillon · pas sur le disque',
    saveFailed: 'Échec de l’enregistrement ; le texte est dans une sauvegarde locale',
    renameFailed: (reason: string) => `Échec du renommage : ${reason}`,
    deleteFailed: (reason: string) => `Échec de la suppression : ${reason}`,
    empty: 'Créez ou ouvrez un fichier à gauche',
    deleteFileTitle: 'Supprimer le fichier',
    deleteFileBody: (name: string) =>
      `« ${name} » ira à la corbeille de Windows et pourra être restauré.`,
    deleteFolderTitle: 'Supprimer le dossier',
    deleteFolderEmpty: (name: string) => `« ${name} » est vide et sera retiré.`,
    deleteFolderBody: (name: string, count: number) =>
      `« ${name} » contient ${count} fichier(s) ; tous iront à la corbeille de Windows :`,
    andMore: (count: number) => `et ${count} de plus`,
    deleteDraftTitle: 'Supprimer le brouillon',
    deleteDraftBody: (name: string) =>
      `« ${name} » n’a jamais été enregistré ; la suppression est irréversible.`,
    deleteAnyway: 'Supprimer quand même',
    openFailed: (reason: string) => `Ouverture impossible : ${reason}`,
    migrateTitle: 'Convertir les anciennes notes en .dtnote',
    migrateBody: (count: number) =>
      `${count} notes à l'ancien format ont été trouvées. Chacune devient un seul fichier .dtnote contenant ses images ; l'original part à la corbeille Windows et reste récupérable, les fichiers image restent où ils sont.`,
    migrateImages: (count: number) => `${count} images`,
    migrateWarnExternal: (reference: string) =>
      `Cette image ne sera pas intégrée à la note et reste où elle est : ${reference}`,
    migrateWarnShared: (reference: string) =>
      `Utilisée par plusieurs notes ; chacune en garde une copie : ${reference}`,
    migrateWarnRemote: (reference: string) => `Sur le web, laissée telle quelle : ${reference}`,
    migrateWarnTargetExists: 'Un .dtnote de ce nom existe déjà ; cette note est ignorée',
    migrateStart: 'Convertir',
    migrateLater: 'Plus tard',
    migrateDoneTitle: 'Conversion terminée',
    migrateDoneBody: (converted: number, failed: number) =>
      `${converted} converties, ${failed} inchangées. Le journal complet est dans le dossier logs.`,
    migrateFailed: (reason: string) => `Échec de la conversion : ${reason}`,
    legacyNote: 'Note rapide (ancienne)',
    draftPrefix: 'Brouillon ',
  },

  editor: {
    bold: 'Gras',
    italic: 'Italique',
    heading: 'Titre',
    bullet: 'Liste à puces',
    checklist: 'Liste de tâches',
    preview: 'Aperçu',
    edit: 'Modifier',
    chars: 'car.',
  },

  sidebar: {
    vault: 'Coffre',
    vaultLock: 'Verrouiller',
    vaultEmpty: 'Le coffre est vide',
    vaultMoveIn: 'Déplacer dans le coffre',
    vaultMoveOut: 'Sortir du coffre',
    search: 'Rechercher',
    drafts: 'Brouillons',
    reveal: 'Afficher dans l’Explorateur',
    newFileHere: 'Nouveau fichier dans ce dossier',
    missing: 'Fichier introuvable',
    unsaved: 'Non enregistré',
    empty: 'Aucun fichier enregistré',
    webOnly: 'L’enregistrement nécessite l’application de bureau',
  },

  vault: {
    createTitle: 'Créer le coffre',
    createBody:
      'Choisissez un mot de passe et une question à vous. Les deux sont obligatoires, et le mot de passe fait au moins 8 caractères.',
    unlockTitle: 'Le coffre est verrouillé',
    recoverTitle: 'Déverrouiller avec votre question',
    resetTitle: 'Définir un nouveau mot de passe',
    resetBody: "C'était la bonne réponse. Définissez un nouveau mot de passe avant d'entrer.",
    password: 'Mot de passe',
    passwordAgain: 'Encore une fois',
    newPassword: 'Nouveau mot de passe',
    question: 'Votre question',
    answer: 'Réponse',
    answerAgain: 'Répétez la réponse',
    answerWarning:
      "La réponse est un second mot de passe : elle ouvre tout ce que le mot de passe ouvre, donc le coffre ne vaut que le plus faible des deux. Évitez tout ce qui se devine, comme le nom de votre première école.",
    questionWarning:
      'La question elle-même est lisible coffre verrouillé : ne mettez pas de secret dedans.',
    forgot: 'Mot de passe oublié ?',
    backToPassword: 'Revenir au mot de passe',
    delayNote:
      "Chaque erreur allonge l'attente, mais cela ne ralentit que les tentatives faites ici. Qui possède une copie du dossier du coffre peut essayer hors ligne aussi vite qu'il veut — la vraie défense, c'est la solidité du mot de passe et de la réponse.",
    rejected: 'Mot de passe ou réponse incorrect, ou données endommagées',
    working: 'En cours…',
    createAction: 'Créer',
    unlockAction: 'Déverrouiller',
    resetAction: 'Définir le mot de passe',
  },

  calendar: {
    previous: 'Mois précédent',
    next: 'Mois suivant',
    backToToday: 'Revenir à aujourd’hui',
    rest: 'Repos',
    work: 'Travail',
    weekdayHeads: ['D', 'L', 'M', 'M', 'J', 'V', 'S'],
    weekdays: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
  },

  launcherWindow: {
    placeholder: 'Rechercher applications, dossiers, raccourcis',
    empty: 'Aucun résultat',
    desktop: 'Bureau',
    menu: 'Menu Démarrer',
  },

  contextMenu: {
    pin: 'Garder au-dessus',
    show: 'Afficher',
    reset: 'Réinitialiser la position de cette fenêtre',
  },

  widgetShell: {
    pinTop: 'Garder au premier plan',
    unpinTop: 'Ne plus garder au premier plan',
    resize: 'Glisser pour redimensionner',
  },

  desktopPanel: {
    empty: 'Rien à afficher sur le bureau.',
  },

  widgetNames: {
    clock: 'Horloge',
    note: 'Notes',
    schedule: 'Agenda',
    moo: 'Horloge du forçat',
    desktop: 'Couche bureau',
  },

  themeNames: {
    default: 'Par défaut',
    cyber: 'Bureau cyber',
    concrete: 'Béton',
    fish: 'Vert tire-au-flanc',
    bossAway: 'Le chef est sorti',
    paper: 'Papier',
  },

  categories: {
    chat: 'Messagerie',
    dev: 'Développement',
    office: 'Documents',
    browser: 'Navigateur',
    media: 'Médias',
    design: 'Design',
    other: 'Autre',
  },

  scheduleData: {
    tagWork: 'Travail',
    tagLife: 'Perso',
    tagImportant: 'Important',
    tagStudy: 'Études',
    repeatNone: 'Ne se répète pas',
    repeatDaily: 'Tous les jours',
    repeatWeekly: 'Toutes les semaines',
    repeatWeekday: 'En semaine',
    seedTitle: 'Trier les priorités du jour',
    remaining: (count: number) => `${count} en cours`,
    allDone: 'Tout est fait 🎉',
  },

  reminderData: {
    channelOff: 'Pas de rappel',
    channelInapp: 'Dans l’application',
    channelDesktop: 'Fenêtre',
    channelToast: 'Notification système',
    visualStatic: 'Sans animation',
    visualBreathe: 'Bordure qui respire',
    visualBlink: 'Fenêtre clignotante',
    visualShake: 'Secousse',
  },

  timeZones: {
    beijing: 'Heure de Pékin',
    local: 'Heure locale',
  },

  // Not translated: these lines are the widget's personality, and the joke does
  // not survive a literal rendering. Localising them means rewriting them for
  // the language, which is a writing job — until someone does it, English is a
  // more honest answer than a flat translation.
  moo: enUS.moo,

  notebook: {
    newFile: 'Nouvelle note',
    newFromTemplate: 'Nouveau depuis un modèle',
    newFolder: 'Nouveau dossier',
  },

  launcher: {
    title: 'Lanceur',
    intro:
      'Le raccourci ouvre le lanceur au centre de l’écran : tapez les initiales ou une partie du nom pour lancer un programme du bureau ou du menu Démarrer. L’index est construit en arrière-plan, la saisie n’attend jamais.',
    hotkey: 'Raccourci du lanceur',
    hotkeyHint:
      'Effet immédiat. Si un jeu en plein écran ou une autre application occupe déjà la touche, l’enregistrement échoue — choisissez-en une autre.',
  },

  plugins: {
    browserAccess: (sites: string) =>
      `Ceci est un plugin navigateur : il ouvre ${sites} et peut lire et modifier le contenu des pages que vous y consultez. Ses connexions restent dans le profil de navigation propre au plugin, partagé ni avec DeskTime ni avec un autre plugin.`,
    title: 'Extensions',
    intro:
      'Les extensions vivent dans le dossier plugins, un répertoire chacune. Après avoir modifié un plugin.json, cliquez sur Recharger — aucun redémarrage nécessaire.',
    openFolder: 'Ouvrir le dossier des extensions',
    reload: 'Recharger',
    reloading: 'Rechargement…',
    options: 'Options',
    viewLog: 'Voir le journal',
    enabled: 'Activée',
    permissions: 'Autorisations',
    backend: 'Processus dorsal',
    none: 'Aucune extension installée.',
    failed: (reason: string) => `Échec du chargement : ${reason}`,
    backendFailed: 'Le processus dorsal s’est arrêté à répétition ; les tentatives ont cessé.',
  },
}
