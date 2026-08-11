// English (US). Typed against zh-CN: a missing key will not compile.

import type { Locale } from './zh-CN'

export const enUS: Locale = {
  language: { name: 'English' },

  common: {
    cancel: 'Cancel',
    confirm: 'OK',
    delete: 'Delete',
    save: 'Save',
    close: 'Close',
    open: 'Open',
    add: 'Add',
    edit: 'Edit',
    rename: 'Rename',
    reset: 'Reset',
    seconds: 'sec',
    minutes: 'min',
    pixels: 'px',
  },

  settings: {
    title: 'Settings',
    navGlobal: 'General',
    navGeneral: 'Appearance',
    navWidgets: 'Widgets',
    navShortcuts: 'Shortcuts',
    navStartup: 'Startup & background',
    navAbout: 'About',
    navNotebook: 'Notebook',
    navNotebookGeneral: 'General',
    navTemplates: 'Templates',
    navSchedule: 'Schedule',
    navReminders: 'Reminders',
    navTags: 'Categories',
    navMoo: 'Moo clock',
    navMooShape: 'Appearance',
    navWork: 'Hours & pay',
    navActivity: 'Activity',
    navLlm: 'AI lines',
    navLauncher: 'Launcher',
    navPlugins: 'Plugins',
    navDev: 'Developer',
  },

  general: {
    title: 'Appearance',
    theme: 'Theme',
    language: 'Language',
    timeZone: 'Time zone',
    followSystem: 'Follow system',
    fixedZone: 'Fixed zone',
  },

  startup: {
    title: 'Startup & background',
    autostart: 'Start with Windows',
    autostartHint: 'Opens DeskTime’s windows after you sign in. No administrator rights needed.',
    service: 'Background protection',
    serviceHint:
      'Keeps collection and reminders working after every window closes. This internal capability only needs attention when repair is shown.',
    serviceOff: 'Protection is not installed; running in degraded mode',
    serviceInstalled: 'Protection is installed but stopped',
    serviceRunning: 'Protection is ready',
    waiting: 'Waiting for approval…',
    dismissed: 'Approval was cancelled; DeskTime will keep running in degraded mode.',
    repair: 'Repair',
  },

  templates: {
    title: 'Note templates',
    intro:
      'Templates are .md files in the templates folder — add and remove them there directly. The arrow beside “New” in the notebook lists them; picking one starts a draft from it.',
    variables: 'Variables: {{date}} {{time}} {{datetime}} {{weekday}} {{title}}',
    create: 'New template',
    remove: 'Delete template',
    openFolder: 'Open templates folder',
    newName: 'New template',
    confirmRemove: (name: string) => `Delete the template “${name}”? It goes to the recycle bin.`,
    empty: 'Pick a template on the left to edit it.',
  },

  clock: {
    lunarPrefix: 'Lunar',
    pomodoroDone: '🍅 Pomodoro finished',
    pomodoroDoneBody: 'Focus time is up — take a break',
    hourlyChime: 'Hourly chime',
    hourlyBody: (hour: number, zone: string) => `It is ${hour}:00 in ${zone}`,
    hourlyOn: 'Hourly chime: on',
    hourlyOff: 'Hourly chime: off',
    startFocus: 'Start focus',
    pauseFocus: 'Pause',
    resetFocus: 'Reset pomodoro',
    toMoo: 'Switch to the moo clock',
  },

  schedule: {
    newSchedule: 'New event',
    done: 'Mark done',
    undone: 'Mark not done',
    today: 'Today',
    week: 'This week',
    all: 'All',
    month: 'Month',
    allTags: 'All',
    empty: 'Nothing scheduled',
    overdue: 'Overdue',
    edit: 'Edit event',
    muteOn: 'Reminders on — click to mute',
    muteOff: 'Reminders muted — click to unmute',
    stop: 'Stop reminder',
    snooze: 'Snooze',
    minutesShort: (value: number) => `${value} min`,
    complete: 'Done',
    moreBanners: (value: number) => `${value} more reminder(s)`,
  },

  scheduleEditor: {
    title: 'Edit event',
    newTitle: 'New event',
    name: 'Title',
    date: 'Date',
    time: 'Time',
    repeat: 'Repeat',
    tag: 'Category',
    noTag: 'No category',
    reminder: 'Reminder',
  },

  reminderFields: {
    channel: 'Channel',
    lead: 'Ahead by',
    topmost: 'Always on top',
    focus: 'Take focus',
    visual: 'Style',
    repeat: 'Repeat',
    every: 'every',
    atMost: 'at most',
    times: 'times',
    unlimited: '0 = until stopped',
  },

  reminderWindow: {
    title: 'Reminder',
    stop: 'Stop',
    stopAll: 'Stop all',
    snooze: 'Snooze',
    done: 'Done',
    minutes: (value: number) => `${value} min`,
    overdue: (value: number) => `${value} min overdue`,
    round: (value: number) => `ring ${value}`,
    more: (value: number) => `${value} more`,
  },

  widgetSettings: {
    title: 'Widgets',
    show: 'Show',
    pin: 'Keep on top',
    resetPositions: 'Reset every window position',
  },

  mooSettings: {
    title: 'Appearance',
    shape: 'Window shape',
    float: 'Floating',
    island: 'Island',
    islandHint: 'The island sits centred at the top of the screen and opens on hover.',
  },

  reminderSettings: {
    title: 'Reminders',
    mute: 'Mute everything',
    fallback: 'Use a popup when an in-app reminder fires and the schedule widget is hidden',
    defaults: 'Defaults for new events',
  },

  notebookSettings: {
    vaultLock: 'Lock the vault after no activity for',
    vaultBackup:
      'Backing the vault up means copying the whole "vault" folder next to the program; restoring means copying it back. It holds nothing but ciphertext under random names, and copying one file out of it is not enough to restore anything.',
    title: 'Notebook',
    autoSave: 'Auto-save after',
  },

  tagSettings: {
    title: 'Event categories',
    intro:
      'The list and the month view are coloured by category. Deleting one leaves its events uncategorised; it does not delete them.',
    name: 'Name',
    color: 'Colour',
    add: 'Add category',
    reset: 'Restore defaults',
    untitled: 'New category',
  },

  workSettings: {
    schedule: 'Work schedule',
    mode: 'Pattern',
    weekly: 'Same every week',
    biweekly: 'Alternating weeks',
    weekA: 'Week A',
    weekB: 'Week B',
    anchor: 'Anchor date',
    anchorEmpty: 'Not set',
    anchorPick: 'Pick in calendar',
    anchorDone: 'Close calendar',
    anchorHint: 'The calendar week containing this date counts as week A; the rest alternate from it.',
    breakLabel: 'Lunch break',
    overtimePaid: 'Overtime is paid',
    overtimeRate: 'Overtime rate',
    salary: 'Pay structure',
    incomes: 'Income',
    deducts: 'Deductions',
    addIncome: 'Add income',
    addDeduct: 'Add deduction',
    namePlaceholder: 'Name',
    monthly: 'Monthly',
    weekly2: 'Weekly',
    yearly: 'Yearly',
    once: 'One-off',
    payMonth: 'Paid in',
    fixed: 'Fixed amount',
    percent: 'Percentage',
    summary: 'Worked out',
    disposable: 'Take-home per month',
    standard: 'Standard monthly hours',
    baseRate: 'Base hourly rate',
    salaryHint:
      'One-off income (a year-end bonus, say) counts entirely in the month it is paid, so that month shows a noticeably higher hourly rate.',
    lossHint:
      'Pay is optional: the loss rate only looks at the share of unpaid overtime, never at the amount.',
    counter: 'Earnings counter',
    cycle: 'Period',
    cycleMonth: 'Monthly',
    cycleWeek: 'Weekly',
    cycleDay: 'Daily',
    cycleStart: 'Period starts',
    dayOfMonth: 'of the month',
    unit: 'Shown as',
    unitMonth: 'Per month',
    unitDay: 'Per day',
    unitHour: 'Per hour',
    unitMinute: 'Per minute',
    showCents: 'Show decimals (the ticking is the point)',
    counterHint:
      'It follows the scheduled hours — slacking still earns, because pay is for time, not output.',
  },

  activitySettings: {
    title: 'Activity',
    intro:
      'The moo clock uses computer activity to tell a busy day from a slack one. Everything stays on this machine and is never uploaded: only key counts (not which keys, not their order), mouse distance, the foreground program\'s exe name, and the environment signals switched on below. Window titles are never collected.',
    enable: 'Collect activity',
    mic: 'Microphone / camera in use',
    micHint:
      'Reads one boolean — whether a device is busy — to work out meeting time. It does not touch audio or video, and does not record which program is using it.',
    audio: 'Audio playback',
    audioHint: 'Reads whether the system is playing sound, to tell watching from working.',
    away: 'Away after',
    awayHint: 'No input for longer than this stops counting as at the desk.',
    retain: 'Keep data for',
    days: 'days',
    clear: 'Delete all activity data',
    cleared: 'Deleted',
    unknown: 'Unclassified programs',
    unknownHint: 'Until these are classified, the mood engine cannot tell chatting from coding.',
    autoClassify: 'Classify with AI',
    classifying: 'Classifying…',
    llmOff: 'Set an endpoint and key under “AI lines” first',
    autoHint:
      'Sends these programs\' file names and product names to your configured endpoint and asks it to guess a category. Only those two, never window titles.',
    classifyFailed: 'Classification failed: the endpoint returned nothing usable.',
    todayHead: 'Today',
    present: 'At the desk',
    effective: 'Working',
    meeting: 'Meetings',
    disabled: 'Collection is off, so every number below is 0.',
  },

  llmSettings: {
    title: 'AI lines (optional)',
    intro:
      'Point this at an OpenAI-compatible endpoint for more varied lines. The request is made by the local backend, so the key never enters the webview; on failure, timeout or an unexpected reply it falls back silently to the built-in lines and never blocks the interface.',
    enable: 'Use AI lines',
    baseUrl: 'Endpoint',
    model: 'Model',
    apiKey: 'API key',
    keySet: 'Key saved',
    keyEmpty: 'Not set',
    clear: 'Clear',
    timeout: 'Timeout',
    ms: 'ms',
    sendSalary: 'Allow sending pay figures (hourly rate, unpaid amount)',
    sends: 'Sent by default',
    never: 'Never sent',
    sendList:
      'The mood state name; loss, slack and intensity as three numbers between 0 and 1; minutes at the desk, in overtime and in meetings today.',
    neverList:
      'Application names, window titles, event titles, file paths, keystrokes. The backend\'s request struct has no field for any of them.',
    rate: 'Requested only when the mood state changes, and at most once every five minutes.',
  },

  shortcutSettings: {
    title: 'Shortcuts',
    intro:
      'Global shortcuts work in any application and re-register the moment you change them — no restart. The defaults use Ctrl+Alt+digit: a plain Ctrl+digit would take that key away from every other program (browser tabs, editor groups) with no hint as to why.',
    record: 'Click to record',
    recording: 'Press a shortcut… (Esc to cancel)',
    unbound: 'Not set',
    launcher:
      'The launcher hotkey is set under “Launcher”; a clash with it is reported here too.',
    conflict: (name: string) => `Same as “${name}” — only one of them will work`,
    failed: 'The system refused it: another program already owns that key. Pick another.',
    inWindow: 'Inside a widget',
    escapeLabel: 'Unpin the current widget',
    escapeHint:
      'Only while the focus is inside a widget window. It takes no global key, so it cannot be changed.',
    swap: 'Switch clock / moo clock',
    pin: 'Pin / unpin',
    launcherAction: 'Launcher hotkey',
  },

  devSettings: {
    title: 'Developer',
    root: 'Marker directory',
    hint: 'Put a file named devmod.dev in the directory above and restart to enable it.',
    open: 'Activity debugger',
    reload: 'Reload every window',
  },

  about: {
    title: 'About',
    storage: 'Config and data',
    storageHint:
      'Config, drafts and activity data all live in this folder, wherever the app is installed.',
    open: 'Open the folder',
    configFailed: 'Config could not be saved',
    configFailedBody: (path: string, reason: string) =>
      `Settings changes did not reach ${path}
${reason}
Check that the folder is writable.`,
  },

  mooPanel: {
    toNormal: 'Switch to the plain clock',
    toIsland: 'Switch to the island',
    toFloat: 'Switch to a floating window',
    monitorLocked: 'Turn on activity collection in settings to unlock today\'s figures',
    loss: 'Loss',
    slack: 'Slack',
    intensity: 'Intensity',
    startFishing: 'Slack off (disguised as a plain clock)',
    stopFishing: 'Leave slacking mode',
    feed: 'Feed it',
    report: 'Daily reckoning',
    feedEmpty: 'Nothing left to feed it today.',
    feedHint: 'Drag an unfinished item onto the face',
    feedNow: 'Feed',
  },

  report: {
    title: 'Daily reckoning',
    older: 'Previous day',
    newer: 'Next day',
    empty: 'No reckoning yet. One is written after your day ends.',
    present: 'At the desk',
    effective: 'Real work',
    slack: 'Slacking',
    meeting: 'Meetings',
    overtime: 'Overtime',
    wasted: 'Unpaid',
    earned: 'Earned',
    fishing: 'Paid slacking',
    fishingValue: 'Net',
    fed: 'Fed',
    times: 'times',
    mood: 'Today\'s mood',
    noActivity:
      'No activity was collected today — the machine may have been off, or collection may be switched off.',
  },

  earnings: {
    locked: 'Set up pay to unlock the earnings counter',
    earned: 'Earned',
    wasted: 'Unpaid',
    month: 'This month',
    week: 'This week',
    day: 'Today',
    unitMonth: 'Per month',
    unitDay: 'Per day',
    unitHour: 'Per hour',
    unitMinute: 'Per minute',
  },

  notebookPanel: {
    vaultBackedUp: 'Save failed; kept in an encrypted backup inside the vault',
    vaultSaveLost: 'The last change could not be saved',
    vaultFailed: (reason: string) => `Vault operation failed: ${reason}`,
    vaultNewNote: 'New note.dtnote',
    vaultKeptPlain: (name: string) =>
      `"${name}" was encrypted, but the plain copy could not be deleted — remove it by hand`,
    vaultNotMoved: (name: string, reason: string) => `"${name}" was not moved in: ${reason}`,
    vaultMoveInTitle: 'Move into the vault',
    vaultMovedIn: (count: number) =>
      `${count} notes are now encrypted in the vault. The plain files were deleted outright, not recycled.`,
    vaultDeleteTitle: 'Delete a private note',
    vaultDeleteBody: (name: string) =>
      `"${name}" will be removed from the vault for good. It does not go to the recycle bin and cannot be recovered.`,
    vaultMoveOutTitle: 'Move out of the vault',
    vaultMoveOutBody: (name: string) =>
      `"${name}" will be decrypted into an ordinary .dtnote file and removed from the vault.`,
    vaultMoveOutWarning:
      'This is the one operation that turns private content back into a readable file. Once written, anyone can open it.',
    vaultMoveOutAction: 'Decrypt and move out',
    placeholder: 'Jot something down…',
    toggleSidebar: 'Files',
    saveAs: 'Save as',
    openFile: 'Open an existing file',
    newFolderName: 'New folder',
    unsaved: 'Unsaved',
    saving: 'Saving…',
    saved: (at: string) => `Saved ${at}`,
    draft: 'Draft · not on disk',
    saveFailed: 'Save failed; the text is in a local backup',
    renameFailed: (reason: string) => `Rename failed: ${reason}`,
    deleteFailed: (reason: string) => `Delete failed: ${reason}`,
    empty: 'Create or open a file on the left',
    deleteFileTitle: 'Delete file',
    deleteFileBody: (name: string) =>
      `“${name}” goes to the Windows recycle bin, so it can be restored.`,
    deleteFolderTitle: 'Delete folder',
    deleteFolderEmpty: (name: string) => `“${name}” is empty and will be removed.`,
    deleteFolderBody: (name: string, count: number) =>
      `“${name}” holds ${count} file(s); all of them go to the Windows recycle bin:`,
    andMore: (count: number) => `and ${count} more`,
    deleteDraftTitle: 'Delete draft',
    deleteDraftBody: (name: string) =>
      `“${name}” has never been saved to disk; deleting it cannot be undone.`,
    deleteAnyway: 'Delete anyway',
    openFailed: (reason: string) => `Could not open: ${reason}`,
    migrateTitle: 'Convert older notes to .dtnote',
    migrateBody: (count: number) =>
      `Found ${count} notes in the older format. Each one becomes a single .dtnote file with its pictures inside; the original goes to the Windows recycle bin and can be restored, and the picture files stay where they are.`,
    migrateImages: (count: number) => `${count} images`,
    migrateWarnExternal: (reference: string) =>
      `This picture will not be taken into the note and stays where it is: ${reference}`,
    migrateWarnShared: (reference: string) =>
      `Used by more than one note; each keeps its own copy: ${reference}`,
    migrateWarnRemote: (reference: string) => `On the web, left as written: ${reference}`,
    migrateWarnTargetExists: 'A .dtnote of that name already exists; this note is skipped',
    migrateStart: 'Convert',
    migrateLater: 'Not now',
    migrateDoneTitle: 'Conversion finished',
    migrateDoneBody: (converted: number, failed: number) =>
      `${converted} converted, ${failed} left as they were. The full log is in the logs folder.`,
    migrateFailed: (reason: string) => `Conversion failed: ${reason}`,
    legacyNote: 'Scratch note (old)',
    /** Prefixes an auto-named draft: `Draft 1`. The trailing space is deliberate. */
    draftPrefix: 'Draft ',
  },

  editor: {
    bold: 'Bold',
    italic: 'Italic',
    heading: 'Heading',
    bullet: 'Bullet list',
    checklist: 'Task list',
    preview: 'Preview',
    edit: 'Edit',
    chars: 'chars',
  },

  sidebar: {
    vault: 'Vault',
    vaultLock: 'Lock now',
    vaultEmpty: 'The vault is empty',
    vaultMoveIn: 'Move into the vault',
    vaultMoveOut: 'Move out of the vault',
    search: 'Search',
    drafts: 'Drafts',
    reveal: 'Show in File Explorer',
    newFileHere: 'New file in this folder',
    missing: 'File is missing',
    unsaved: 'Unsaved',
    empty: 'No saved files yet',
    webOnly: 'Saving files needs the desktop app',
  },

  vault: {
    createTitle: 'Create the vault',
    createBody:
      'Set a password and a question of your own. Both are required, and the password is at least 8 characters.',
    unlockTitle: 'The vault is locked',
    recoverTitle: 'Unlock with your question',
    resetTitle: 'Set a new password',
    resetBody: 'That was right. Set a new password before going in.',
    password: 'Password',
    passwordAgain: 'Again',
    newPassword: 'New password',
    question: 'Your question',
    answer: 'Answer',
    answerAgain: 'Answer again',
    answerWarning:
      'The answer is a second password — it opens everything the password opens, so the vault is only as strong as the weaker of the two. Avoid anything guessable, like the name of your first school.',
    questionWarning:
      'The question itself is readable while the vault is locked, so do not put a secret in it.',
    forgot: 'Forgotten the password?',
    backToPassword: 'Back to the password',
    delayNote:
      'Repeated wrong answers wait longer each time, but that only slows attempts made here. Anyone holding a copy of the vault folder can try offline as fast as they like — the real defence is how strong the password and the answer are.',
    rejected: 'Wrong password or answer, or the data is damaged',
    working: 'Working…',
    createAction: 'Create',
    unlockAction: 'Unlock',
    resetAction: 'Set password',
  },

  calendar: {
    previous: 'Previous month',
    next: 'Next month',
    backToToday: 'Back to today',
    rest: 'Off',
    work: 'Work',
    weekdayHeads: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
    weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  },

  launcherWindow: {
    placeholder: 'Search apps, folders, shortcuts',
    empty: 'No matches',
    desktop: 'Desktop',
    menu: 'Start menu',
  },

  contextMenu: {
    pin: 'Keep on top',
    show: 'Show',
    reset: 'Reset this window position',
  },

  widgetShell: {
    pinTop: 'Keep on top',
    unpinTop: 'Stop keeping on top',
    resize: 'Drag to resize',
  },

  desktopPanel: {
    empty: 'Nothing on the desktop to show.',
  },

  widgetNames: {
    clock: 'Clock',
    note: 'Notebook',
    schedule: 'Schedule',
    moo: 'Moo clock',
    desktop: 'Desktop layer',
  },

  themeNames: {
    default: 'Default',
    cyber: 'Cyber cubicle',
    concrete: 'Concrete',
    fish: 'Slacker green',
    bossAway: 'Boss is out',
    paper: 'Paper',
  },

  categories: {
    chat: 'Chat',
    dev: 'Development',
    office: 'Documents',
    browser: 'Browser',
    media: 'Media',
    design: 'Design',
    other: 'Other',
  },

  scheduleData: {
    tagWork: 'Work',
    tagLife: 'Life',
    tagImportant: 'Important',
    tagStudy: 'Study',
    repeatNone: 'Does not repeat',
    repeatDaily: 'Every day',
    repeatWeekly: 'Every week',
    repeatWeekday: 'Weekdays',
    seedTitle: 'Sort out today\'s priorities',
    remaining: (count: number) => `${count} left`,
    allDone: 'All done 🎉',
  },

  reminderData: {
    channelOff: 'No reminder',
    channelInapp: 'In-app',
    channelDesktop: 'Popup',
    channelToast: 'System notification',
    visualStatic: 'No animation',
    visualBreathe: 'Breathing border',
    visualBlink: 'Blinking window',
    visualShake: 'Shake',
  },

  timeZones: {
    beijing: 'Beijing time',
    local: 'Local time',
  },

  moo: {
    moods: {
      nirvana: {
        label: 'Reborn',
        lines: [
          'Run. Run now. Do not look back.',
          'The moment the laptop shuts, I am a person again.',
          'No overtime today — this life is still mine.',
          'Clocked off. The company and I are square.',
        ],
      },
      clown: {
        label: 'The clown was me',
        lines: [
          'The boss has not left, so I have not left. 🎈',
          'Still editing at this hour — the spec, or your life?',
          'No overtime pay. Plenty of overtime.',
          'You are shining for the dream. You are also paying for the electricity.',
          'Today\'s effort becomes tomorrow\'s KPI. Someone else\'s.',
        ],
      },
      angry: {
        label: 'Do not touch it',
        lines: [
          'It runs. Leave it alone. I am not taking that ticket.',
          'Deleted it three times. One more change and I delete myself.',
          'Whoever wrote this spec can come and write the code.',
          'The backspace key is nearly through to the desk.',
        ],
      },
      burning: {
        label: 'CPU on fire',
        lines: [
          'Who am I? Where am I? Who tagged me?',
          'Eight windows flashing. Two eyes.',
          'The computer is multithreaded. You are not.',
          'This is not efficiency. This is a cooling problem.',
        ],
      },
      numb: {
        label: 'Body present',
        lines: [
          'Soul offline. Hands still typing.',
          'Ctrl+C, Ctrl+V, Ctrl+C, Ctrl+V…',
          'The only things awake at this hour are you and the server.',
          'Eyes open. Nobody home.',
        ],
      },
      smug: {
        label: 'Quietly winning',
        lines: [
          'Every second of slacking quietly raises the hourly rate.',
          'The work is dead. You are alive. The money arrives regardless.',
          'I did nothing this hour, and it counts as an hour.',
          'Paid staring into space is the best benefit this job has.',
        ],
      },
      idle: {
        label: 'Running normally',
        lines: [
          'All fine. Nothing worth complaining about yet.',
          'A quiet day. Enjoy it.',
          'Not bad — nobody has tagged you in a while.',
          'The work-to-slack ratio is about right.',
        ],
      },
    },

    modifiers: {
      zombie: 'Meeting, spiritually absent',
      meeting: 'In a meeting',
      chatStorm: 'Message storm',
      coding: 'Coding',
      spreadsheet: 'Spreadsheet hell',
      slacking: 'Slacking',
      aloneLate: 'Alone, late',
      none: '',
    },

    combos: {
      'clown:chatStorm': [
        'Replying in seconds at this hour. Are you support staff?',
        'The messages have not stopped. The pay has.',
        'Typing that fast, and not a penny of overtime.',
      ],
      'clown:coding': [
        'This line is worth nothing, because you are not paid for this hour.',
        'However elegant the midnight fix, it is a gift.',
        'You write the company an asset; it writes you an attendance record.',
      ],
      'clown:aloneLate': [
        'The whole floor is you and one lamp.',
        'Even the cleaners went home an hour ago.',
        'You moved yourself. You did not move finance.',
      ],
      'burning:meeting': [
        'Coding through a meeting. Dual core, are we?',
        'Mouth syncing, hands shipping.',
      ],
      'burning:chatStorm': [
        'Eight groups tagging you. Ten fingers.',
        'The messages arrive faster than the requirements.',
      ],
      'numb:zombie': [
        'Microphone on. Soul off.',
        'Forty minutes of meeting. Three characters typed.',
        'Full attendance, zero output. Flawless.',
      ],
      'numb:spreadsheet': [
        'Copy, paste, next cell. So goes a life.',
        'This spreadsheet is formatting you.',
      ],
      'smug:slacking': [
        'Twenty minutes of that episode, still on the clock. Profit.',
        'Paid browsing is the most dignified part of this job.',
        'Not slacking — harvesting.',
      ],
      'smug:meeting': [
        'A meeting is paid staring into space. No complaints.',
        'Camera off. Life is free.',
      ],
      'angry:spreadsheet': [
        'One more revision of this Excel and I resign.',
        'Whoever merged these cells should be merged.',
      ],
      'angry:coding': [
        'The backspace key is worn through and the spec is still moving.',
        'Rewritten four times. I hate it.',
      ],
      'idle:meeting': ['In a meeting. Slack quietly.', 'Syncing up. Zoning out.'],
      'idle:slacking': ['A little slack, just enough to recover.', 'Briefly offline. Back soon.'],
      'nirvana:aloneLate': ['Late, but honestly — that counted as leaving on time.'],
    } as Partial<Record<string, string[]>>,

    noModifier: 'none',
    efficiencyHigh: 'Less work, same money. Nicely played.',
    efficiencyLow: (percent: number) =>
      `Your own overtime has diluted your hourly rate by ${percent}%. Congratulations on the pay cut.`,
    praise: [
      'Delicious. That was a good task.',
      'One down. The day was not wasted.',
      'Chew, chew… another one?',
      'Chewy. Tastes like something important.',
      'Fed successfully. Mood +10.',
    ],
  },

  notebook: {
    newFile: 'New note',
    newFromTemplate: 'New from template',
    newFolder: 'New folder',
  },

  launcher: {
    title: 'Launcher',
    intro:
      'Press the hotkey to open the launcher in the centre of the screen, then type initials or part of a name to start anything on the desktop or in the Start menu. The index is built in the background, so typing never waits.',
    hotkey: 'Launcher hotkey',
    hotkeyHint:
      'Takes effect immediately. Registration fails if a full-screen game or another app already owns the key — pick a different one.',
  },

  plugins: {
    browserAccess: (sites: string) =>
      `This is a browser plugin: it opens ${sites}, and can read and change the page content you see on those sites. Its logins live in that plugin's own browser profile and are shared with neither DeskTime nor any other plugin.`,
    title: 'Plugins',
    intro:
      'Plugins live in the plugins folder, one directory each. After editing a plugin.json, press Reload — no restart needed.',
    openFolder: 'Open plugins folder',
    reload: 'Reload',
    reloading: 'Reloading…',
    options: 'Options',
    viewLog: 'View log',
    enabled: 'Enabled',
    permissions: 'Permissions',
    backend: 'Backend process',
    none: 'No plugins installed yet.',
    failed: (reason: string) => `Failed to load: ${reason}`,
    backendFailed: 'The backend process kept exiting; retries have stopped.',
  },
}
