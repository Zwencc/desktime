// Simplified Chinese — the source locale.
//
// Every other language is typed against this one (`Locale = typeof zhCN`), so a
// missing key or a mismatched interpolation signature is a compile error rather
// than a blank spot in the interface. That is the one thing an ini file, or a
// JSON file, cannot do — and the reason these are TypeScript modules.
//
// Strings that take arguments are functions, not templates with `%s` markers:
// the argument names are then part of the type, and a translator who reorders
// them for their language cannot get the order wrong.
//
// **Grouped by where they appear**, not by what they say. A translator works
// through one screen at a time, and so does whoever checks the result.

export const zhCN = {
  language: {
    /** Shown in the language picker, always in the language itself. */
    name: '简体中文',
  },

  common: {
    cancel: '取消',
    confirm: '确定',
    delete: '删除',
    save: '保存',
    close: '关闭',
    open: '打开',
    add: '添加',
    edit: '编辑',
    rename: '重命名',
    reset: '重置',
    seconds: '秒',
    minutes: '分钟',
    pixels: '像素',
  },

  settings: {
    title: '设置',
    navGlobal: '全局',
    navGeneral: '通用',
    navWidgets: '组件',
    navShortcuts: '快捷键',
    navStartup: '启动与后台',
    navAbout: '关于',
    navNotebook: '记事本',
    navNotebookGeneral: '通用',
    navTemplates: '模板',
    navSchedule: '日程',
    navReminders: '提醒',
    navTags: '日程类型',
    navMoo: '牛马时钟',
    navMooShape: '外观',
    navWork: '工时与薪资',
    navActivity: '活动监测',
    navLlm: 'AI 台词',
    navLauncher: '启动器',
    navPlugins: '插件',
    navDev: '开发者',
  },

  general: {
    title: '通用',
    theme: '主题',
    language: '语言',
    timeZone: '时区',
    followSystem: '跟随系统',
    fixedZone: '指定时区',
  },

  startup: {
    title: '启动与后台',
    autostart: '开机自启',
    autostartHint: '登录 Windows 后自动打开 DeskTime 的窗口。不需要管理员权限。',
    service: '后台保护',
    serviceHint:
      '后台保护负责在窗口关闭后继续采集和提醒。它是内部能力，仅在异常时需要修复。',
    serviceOff: '保护未安装，当前为降级运行',
    serviceInstalled: '保护已安装但未运行',
    serviceRunning: '保护正常',
    waiting: '等待授权…',
    dismissed: '授权被取消，DeskTime 将继续以降级模式运行。',
    repair: '修复',
  },

  templates: {
    title: '笔记模板',
    intro:
      '模板是 templates 文件夹里的 .md 文件，可以直接在文件夹里增删。记事本「新建」旁边的箭头会列出它们，选中即按模板建一篇草稿。',
    variables: '可用变量：{{date}} {{time}} {{datetime}} {{weekday}} {{title}}',
    create: '新建模板',
    remove: '删除模板',
    openFolder: '打开模板文件夹',
    newName: '新模板',
    confirmRemove: (name: string) => `删除模板「${name}」？会移到回收站。`,
    empty: '选择左侧的模板开始编辑。',
  },

  clock: {
    lunarPrefix: '农历',
    pomodoroDone: '🍅 番茄钟完成',
    pomodoroDoneBody: '专注时间到，休息一下吧',
    hourlyChime: '整点报时',
    hourlyBody: (hour: number, zone: string) => `现在是${zone} ${hour} 点整`,
    hourlyOn: '整点报时：开',
    hourlyOff: '整点报时：关',
    startFocus: '开始专注',
    pauseFocus: '暂停',
    resetFocus: '重置番茄钟',
    toMoo: '切换到牛马时钟',
  },

  schedule: {
    newSchedule: '新日程',
    done: '标记完成',
    undone: '标记未完成',
    today: '今日',
    week: '本周',
    all: '全部',
    month: '月历',
    allTags: '全部',
    empty: '暂无日程',
    overdue: '已逾期',
    edit: '编辑日程',
    muteOn: '提醒已开启，点击静音',
    muteOff: '提醒已静音，点击开启',
    stop: '停止提醒',
    snooze: '稍后',
    minutesShort: (value: number) => `${value} 分`,
    complete: '完成',
    moreBanners: (value: number) => `还有 ${value} 条提醒`,
  },

  scheduleEditor: {
    title: '编辑日程',
    newTitle: '新建日程',
    name: '标题',
    date: '日期',
    time: '时间',
    repeat: '重复',
    tag: '标签',
    noTag: '无标签',
    reminder: '提醒',
  },

  reminderFields: {
    channel: '渠道',
    lead: '提前',
    topmost: '置顶',
    focus: '抢占焦点',
    visual: '提醒方式',
    repeat: '重复',
    every: '每',
    atMost: '最多',
    times: '次',
    unlimited: '0 = 不限，直到停止',
  },

  reminderWindow: {
    title: '提醒',
    stop: '停止提醒',
    stopAll: '全部停止',
    snooze: '稍后',
    done: '完成',
    minutes: (value: number) => `${value} 分钟`,
    overdue: (value: number) => `已逾期 ${value} 分钟`,
    round: (value: number) => `第 ${value} 次`,
    more: (value: number) => `还有 ${value} 条`,
  },

  widgetSettings: {
    title: '组件',
    show: '显示',
    pin: '钉在上层',
    resetPositions: '重置所有窗口位置',
  },

  mooSettings: {
    title: '外观',
    shape: '窗口形态',
    float: '浮窗',
    island: '灵动岛',
    islandHint: '灵动岛固定在屏幕顶端居中，鼠标移上去展开',
  },

  reminderSettings: {
    title: '提醒',
    mute: '全局静音',
    fallback: '应用内提醒时若日程组件已隐藏，改用弹窗提醒',
    defaults: '新建日程默认',
  },

  notebookSettings: {
    vaultLock: '隐私空间无操作自动锁定',
    vaultBackup: '备份隐私空间 = 整个复制程序目录下的 vault 文件夹；恢复 = 复制回去。里面只有密文和随机文件名，单独复制某一个文件不保证能恢复。',
    title: '记事本',
    autoSave: '自动保存间隔',
  },

  tagSettings: {
    title: '日程类型',
    intro:
      '日程列表和月历都按类型上色。删掉一个类型，用着它的日程会变成无标签，不会连日程一起删。',
    name: '名称',
    color: '颜色',
    add: '新增类型',
    reset: '恢复默认',
    untitled: '新类型',
  },

  workSettings: {
    schedule: '工时表',
    mode: '排班',
    weekly: '每周固定',
    biweekly: '大小周',
    weekA: 'A 周',
    weekB: 'B 周',
    anchor: '锚点日期',
    anchorEmpty: '未选择',
    anchorPick: '在日历里选',
    anchorDone: '收起日历',
    anchorHint: '该日期所在的自然周算作 A 周，往前往后交替推算',
    breakLabel: '午休',
    overtimePaid: '加班有加班费',
    overtimeRate: '加班倍率',
    salary: '薪资结构',
    incomes: '收入项',
    deducts: '扣除项',
    addIncome: '添加收入',
    addDeduct: '添加扣除',
    namePlaceholder: '名称',
    monthly: '每月',
    weekly2: '每周',
    yearly: '每年',
    once: '一次性',
    payMonth: '发放月份',
    fixed: '固定金额',
    percent: '百分比',
    summary: '折算结果',
    disposable: '月可支配',
    standard: '标准月工时',
    baseRate: '基准时薪',
    salaryHint: '一次性收入（年终奖等）只计入发放当月，那个月的时薪会明显变高',
    lossHint: '不填薪资也能用：亏损率只看加班占比，与金额无关',
    counter: '时薪计数器',
    cycle: '统计周期',
    cycleMonth: '每月',
    cycleWeek: '每周',
    cycleDay: '每天',
    cycleStart: '周期起点',
    dayOfMonth: '号',
    unit: '展示粒度',
    unitMonth: '月薪',
    unitDay: '日薪',
    unitHour: '时薪',
    unitMinute: '分薪',
    showCents: '显示小数（滚动更有感觉）',
    counterHint: '按排班时间自然增长——摸鱼也照涨，工资本来就是按时间发的',
  },

  activitySettings: {
    title: '活动监测',
    intro:
      '牛马时钟靠电脑活动判断你今天是真忙还是在摸鱼。采集全部只存在本机，永不上传：只有按键次数（不记是哪个键、不记顺序）、鼠标位移、前台程序的 exe 名，以及下面单独开关的环境信号。窗口标题永不采集。',
    enable: '开启活动监测',
    mic: '麦克风 / 摄像头占用检测',
    micHint:
      '只读「设备是否被占用」这一个布尔值，用来识别开会时长；不碰音视频内容，也不记录是哪个程序在用',
    audio: '音频播放检测',
    audioHint: '只读系统是否有声音在播放，用来区分看视频和干活',
    away: '离开判定',
    awayHint: '连续无输入超过这个时长就不再算在岗',
    retain: '数据保留',
    days: '天',
    clear: '清空所有活动数据',
    cleared: '已清空',
    unknown: '未分类的程序',
    unknownHint: '归类之后，情绪判定才知道你在聊天还是在写代码',
    autoClassify: 'AI 自动归类',
    classifying: '归类中…',
    llmOff: '需要先在「AI 台词」里填好接口和密钥',
    autoHint:
      '把下面这些程序的文件名和产品名发给你配置的接口，让它猜类别。只发这两样，不发窗口标题。',
    classifyFailed: '归类失败，接口没有返回可用结果',
    todayHead: '今天',
    present: '在岗',
    effective: '有效',
    meeting: '会议',
    disabled: '未开启采集，下面的数字都是 0',
  },

  llmSettings: {
    title: 'AI 台词（可选）',
    intro:
      '配置一个 OpenAI 兼容接口，台词会更多样。请求由本地后端发出，密钥不进网页层；失败、超时或返回格式不对时静默回落到本地台词，不会卡住界面。',
    enable: '启用 AI 台词',
    baseUrl: '接口地址',
    model: '模型',
    apiKey: '密钥',
    keySet: '已保存密钥',
    keyEmpty: '未设置',
    clear: '清除',
    timeout: '超时',
    ms: '毫秒',
    sendSalary: '允许发送薪资相关数字（时薪、白干金额）',
    sends: '默认会发送的内容',
    never: '永不发送的内容',
    sendList: '情绪状态名、亏损率 / 摸鱼率 / 强度三个 0~1 的数、今日在岗与加班与会议的分钟数。',
    neverList:
      '应用名、窗口标题、日程标题、文件路径、按键内容。这些在后端的请求结构里就没有字段。',
    rate: '只在情绪状态切换时请求，且最少间隔 5 分钟。',
  },

  shortcutSettings: {
    title: '快捷键',
    intro:
      '全局快捷键，在任何程序里按下都生效，改完立即重新注册，不用重启。默认用 Ctrl+Alt+数字：普通的 Ctrl+数字会从所有程序手里抢走这组键（浏览器切标签页、编辑器切分组都会失效）。',
    record: '点击录制',
    recording: '按下快捷键…（Esc 取消）',
    unbound: '未设置',
    launcher: '启动器的热键在「启动器」里设置；它和这里的键冲突时同样会有提示。',
    conflict: (name: string) => `与「${name}」重复，两者只会生效一个`,
    failed: '系统拒绝注册：已被其它程序占用，换一个键',
    inWindow: '窗口内按键',
    escapeLabel: '取消当前组件的置顶',
    escapeHint: '焦点在组件窗口内时才生效，不占用全局按键，因此不可修改。',
    swap: '普通时钟 / 牛马时钟 切换',
    pin: '置顶 / 取消置顶',
    launcherAction: '启动器热键',
  },

  devSettings: {
    title: '开发者',
    root: '标记目录',
    hint: '在上面的目录放一个名为 devmod.dev 的文件即可开启；重启应用后生效',
    open: '活动检测调试',
    reload: '重载所有窗口',
  },

  about: {
    title: '关于',
    storage: '配置与数据',
    storageHint: '配置、草稿、活动数据都放在这个目录下，跟着应用装在哪就在哪。',
    open: '打开所在文件夹',
    configFailed: '配置保存失败',
    configFailedBody: (path: string, reason: string) =>
      `设置改动没能写入 ${path}
${reason}
请检查该目录是否可写。`,
  },

  mooPanel: {
    toNormal: '切换到普通时钟',
    toIsland: '切换到灵动岛',
    toFloat: '切换到浮窗',
    monitorLocked: '在设置里开启活动监测，解锁今日指标',
    loss: '亏损率',
    slack: '摸鱼率',
    intensity: '强度',
    startFishing: '摸鱼（伪装成普通时钟）',
    stopFishing: '退出摸鱼模式',
    feed: '投喂电子马粮',
    report: '扎心日报',
    feedEmpty: '今天没有待办可以喂了。',
    feedHint: '把未完成的事项拖到脸上',
    feedNow: '喂',
  },

  report: {
    title: '扎心日报',
    older: '前一天',
    newer: '后一天',
    empty: '还没有日报。下班时间过后会自动生成一份。',
    present: '在岗',
    effective: '有效工作',
    slack: '摸鱼',
    meeting: '会议',
    overtime: '加班',
    wasted: '白干',
    earned: '已赚',
    fishing: '带薪离线',
    fishingValue: '净赚',
    fed: '投喂',
    times: '次',
    mood: '今天的心情',
    noActivity: '今天没有采集到任何活动，可能是没开机，也可能是监测被关了。',
  },

  earnings: {
    locked: '配置薪资后解锁时薪计数器',
    earned: '已赚',
    wasted: '白干',
    month: '本月',
    week: '本周',
    day: '今日',
    unitMonth: '月薪',
    unitDay: '日薪',
    unitHour: '时薪',
    unitMinute: '分薪',
  },

  notebookPanel: {
    vaultBackedUp: '保存失败，已存入隐私空间内的加密备份',
    vaultSaveLost: '最后一次修改未能保存',
    vaultFailed: (reason: string) => `隐私空间操作失败：${reason}`,
    vaultNewNote: '新建笔记.dtnote',
    vaultKeptPlain: (name: string) => `「${name}」已加密存入，但原明文文件未能删除，请手动删除`,
    vaultNotMoved: (name: string, reason: string) => `「${name}」未移入：${reason}`,
    vaultMoveInTitle: '移入隐私空间',
    vaultMovedIn: (count: number) => `${count} 篇已加密存入隐私空间，原明文文件已直接删除（不进回收站）。`,
    vaultDeleteTitle: '删除隐私笔记',
    vaultDeleteBody: (name: string) => `「${name}」将从隐私空间彻底删除，不进回收站，无法恢复。`,
    vaultMoveOutTitle: '移出隐私空间',
    vaultMoveOutBody: (name: string) => `「${name}」将被解密写成一个普通 .dtnote 文件，并从隐私空间移除。`,
    vaultMoveOutWarning: '这是唯一一个把内容变回明文的操作。写出后任何人都能直接打开它。',
    vaultMoveOutAction: '解密并移出',
    placeholder: '随手记点什么...',
    toggleSidebar: '文件列表',
    saveAs: '另存为',
    openFile: '打开已有文件',
    newFolderName: '新建文件夹',
    unsaved: '未保存',
    saving: '保存中…',
    saved: (at: string) => `已保存 ${at}`,
    draft: '草稿 · 未落盘',
    saveFailed: '保存失败，已存入本地备份',
    renameFailed: (reason: string) => `重命名失败：${reason}`,
    deleteFailed: (reason: string) => `删除失败：${reason}`,
    empty: '左侧新建或打开一个文件',
    deleteFileTitle: '删除文件',
    deleteFileBody: (name: string) => `「${name}」将被删除到 Windows 回收站（可恢复）。`,
    deleteFolderTitle: '删除文件夹',
    deleteFolderEmpty: (name: string) => `「${name}」是空文件夹，将被移除。`,
    deleteFolderBody: (name: string, count: number) =>
      `「${name}」内含 ${count} 个文件，将一并删除到 Windows 回收站（可恢复）：`,
    andMore: (count: number) => `等 ${count} 个文件`,
    deleteDraftTitle: '删除草稿',
    deleteDraftBody: (name: string) => `「${name}」尚未保存到磁盘，删除后内容将不可恢复。`,
    deleteAnyway: '直接删除',
    openFailed: (reason: string) => `打开失败：${reason}`,
    migrateTitle: '把旧笔记转成 .dtnote',
    migrateBody: (count: number) =>
      `找到 ${count} 篇旧格式笔记。转换后每篇笔记连同图片会变成一个 .dtnote 文件，原文件移到 Windows 回收站（可恢复），原图片仍留在原目录。`,
    migrateImages: (count: number) => `${count} 张图片`,
    migrateWarnExternal: (reference: string) => `图片不会被收进笔记，仍留在原处：${reference}`,
    migrateWarnShared: (reference: string) => `多篇笔记共用，每篇各存一份：${reference}`,
    migrateWarnRemote: (reference: string) => `网络图片，保持原样不下载：${reference}`,
    migrateWarnTargetExists: '同名 .dtnote 已存在，这篇跳过',
    migrateStart: '开始转换',
    migrateLater: '以后再说',
    migrateDoneTitle: '转换完成',
    migrateDoneBody: (converted: number, failed: number) =>
      `${converted} 篇已转换，${failed} 篇保持原样。详细日志在 logs 目录。`,
    migrateFailed: (reason: string) => `转换失败：${reason}`,
    legacyNote: '临时记事（旧）',
    /** Prefixes an auto-named draft: `草稿1`. Any trailing space is deliberate. */
    draftPrefix: '草稿',
  },

  editor: {
    bold: '加粗',
    italic: '斜体',
    heading: '标题',
    bullet: '无序列表',
    checklist: '待办项',
    preview: '预览',
    edit: '编辑',
    chars: '字',
  },

  sidebar: {
    vault: '隐私空间',
    vaultLock: '立即锁定',
    vaultEmpty: '隐私空间还是空的',
    vaultMoveIn: '移入隐私空间',
    vaultMoveOut: '移出隐私空间',
    search: '搜索',
    drafts: '草稿',
    reveal: '在资源管理器中显示',
    newFileHere: '在此文件夹新建文件',
    missing: '文件已丢失',
    unsaved: '未保存',
    empty: '还没有已保存的文件',
    webOnly: '文件保存仅桌面版可用',
  },

  vault: {
    createTitle: '创建隐私空间',
    createBody: '设置密码和一个自定义密保问题，两项都必填。密码至少 8 位。',
    unlockTitle: '隐私空间已锁定',
    recoverTitle: '用密保问题解锁',
    resetTitle: '设置新密码',
    resetBody: '验证通过。设置新密码后才能进入隐私空间。',
    password: '密码',
    passwordAgain: '再输一次',
    newPassword: '新密码',
    question: '密保问题',
    answer: '答案',
    answerAgain: '再输一次答案',
    answerWarning: '密保答案相当于第二个密码——它能解开全部内容，所以整个隐私空间的强度等于密码和答案里较弱的那一个。别用「小学叫什么」这种能猜到的答案。',
    questionWarning: '问题本身在锁定状态下是明文可见的，别把秘密写进问题里。',
    forgot: '忘记密码？',
    backToPassword: '返回用密码解锁',
    delayNote: '连续输错会逐次延长等待，但这只挡得住从这个界面试。拿到 vault 文件夹的人可以离线爆破，真正的防线是密码和密保答案本身的强度。',
    rejected: '密码 / 密保答案错误，或数据已损坏',
    working: '处理中…',
    createAction: '创建',
    unlockAction: '解锁',
    resetAction: '设置新密码',
  },

  calendar: {
    previous: '上个月',
    next: '下个月',
    backToToday: '回到今天',
    rest: '休',
    work: '班',
    /** Seven single characters, Sunday first. */
    weekdayHeads: ['日', '一', '二', '三', '四', '五', '六'],
    /** Seven names, Sunday first; used by the `{{weekday}}` template variable. */
    weekdays: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
  },

  launcherWindow: {
    placeholder: '搜索应用、文件夹、快捷方式',
    empty: '没有匹配项',
    desktop: '桌面',
    menu: '开始菜单',
  },

  contextMenu: {
    pin: '钉在上层',
    show: '显示',
    reset: '重置当前窗口位置',
  },

  /** The title bar every widget carries — see App.tsx. */
  widgetShell: {
    pinTop: '钉在最上层',
    unpinTop: '取消钉在最上层',
    resize: '拖拽调整大小',
  },

  desktopPanel: {
    empty: '桌面上没有可显示的项目。',
  },

  widgetNames: {
    clock: '时钟',
    note: '记事本',
    schedule: '日程',
    moo: '牛马时钟',
    desktop: '桌面层',
  },

  themeNames: {
    default: '默认',
    cyber: '赛博工位',
    concrete: '水泥灰',
    fish: '摸鱼绿',
    bossAway: '老板不在',
    paper: '纸质',
  },

  categories: {
    chat: '聊天',
    dev: '开发',
    office: '文档',
    browser: '浏览器',
    media: '娱乐',
    design: '设计',
    other: '其它',
  },

  scheduleData: {
    tagWork: '工作',
    tagLife: '生活',
    tagImportant: '重要',
    tagStudy: '学习',
    repeatNone: '不重复',
    repeatDaily: '每天',
    repeatWeekly: '每周',
    repeatWeekday: '工作日',
    seedTitle: '整理今天的重点',
    remaining: (count: number) => `${count} 项未完成`,
    allDone: '全部完成 🎉',
  },

  reminderData: {
    channelOff: '不提醒',
    channelInapp: '应用内提醒',
    channelDesktop: '弹窗提醒',
    channelToast: '系统通知',
    visualStatic: '无动画',
    visualBreathe: '边框呼吸',
    visualBlink: '整窗闪烁',
    visualShake: '抖动',
  },

  timeZones: {
    beijing: '北京时间',
    local: '本地时间',
  },

  moo: {
    moods: {
      nirvana: {
        label: '涅槃重生',
        lines: [
          '跑！快跑！别回头！',
          '合上电脑的那一刻，我又是个人了。',
          '今天没加班，这条命还是我自己的。',
          '下班了，公司和我从此互不相欠。',
        ],
      },
      clown: {
        label: '小丑竟是我',
        lines: [
          '领导不走我不走，我是公司小舔狗 🎈',
          '这个点还在改，改的是需求还是命？',
          '加班费没有，加班倒是管够。',
          '你在为梦想发光，只是电费是你自己交的。',
          '今天的努力，明天会变成别人的 KPI。',
        ],
      },
      angry: {
        label: '暴躁老哥',
        lines: [
          '代码能跑别动它，这个需求我不接。',
          '删了三遍了，再改我就删自己。',
          '谁提的需求，让他自己来写。',
          '退格键都快按穿了。',
        ],
      },
      burning: {
        label: '燃烧的 CPU',
        lines: [
          '我是谁？我在哪？哪个艾特我的？',
          '八个窗口同时在闪，我只有两只眼睛。',
          '多线程的是电脑，不是人。',
          '这不叫高效，这叫散热不良。',
        ],
      },
      numb: {
        label: '物理超度',
        lines: [
          '灵魂已下线，肉体在敲击。',
          'Ctrl+C，Ctrl+V，Ctrl+C，Ctrl+V……',
          '这个点还醒着的，只有你和服务器。',
          '眼睛睁着，人已经不在了。',
        ],
      },
      smug: {
        label: '资本的窃喜',
        lines: [
          '摸鱼的每一秒，时薪都在偷偷上涨。',
          '活是死的，人是活的，钱是照发的。',
          '这一小时我什么都没干，但它算工时。',
          '带薪发呆，是这份工作最好的福利。',
        ],
      },
      idle: {
        label: '正常运转',
        lines: [
          '一切正常，暂时没什么好吐槽的。',
          '平静的一天，珍惜。',
          '还行，至少现在没人艾特你。',
          '摸鱼和干活的比例刚刚好。',
        ],
      },
    },

    modifiers: {
      zombie: '会议养生',
      meeting: '会议中',
      chatStorm: '聊天轰炸',
      coding: '编码中',
      spreadsheet: '表格地狱',
      slacking: '摸鱼中',
      aloneLate: '独自加班',
      none: '',
    },

    /** Keyed `mood:modifier`; a pair with nothing written falls back to the mood. */
    combos: {
      'clown:chatStorm': [
        '这个点还在群里秒回，你是客服吗。',
        '下班了消息还没停，工资倒是停了。',
        '打字这么快，加班费一分没有。',
      ],
      'clown:coding': [
        '这行代码值 0 块钱，因为你没有加班费。',
        '深夜的 bug 修得再漂亮，也是白送的。',
        '你在给公司写资产，公司在给你写考勤。',
      ],
      'clown:aloneLate': [
        '整层楼就剩你和一盏灯。',
        '这个点了，连保洁阿姨都下班了。',
        '感动了自己，没感动财务。',
      ],
      'burning:meeting': ['一边开会一边写代码，你是双核的？', '嘴上在同步，手上在赶工。'],
      'burning:chatStorm': ['八个群同时艾特你，你只有十根手指。', '消息比需求来得还快。'],
      'numb:zombie': [
        '麦克风开着，灵魂关着。',
        '会开了四十分钟，你敲了三个字。',
        '在线时长有了，产出为零，完美。',
      ],
      'numb:spreadsheet': ['复制、粘贴、下一格，人生也就这样。', '这张表格正在把你格式化。'],
      'smug:slacking': [
        '这集我看了二十分钟，时薪照发，血赚。',
        '带薪冲浪，是这份工作最体面的部分。',
        '摸的不是鱼，是资本主义的羊毛。',
      ],
      'smug:meeting': ['开会就是带薪发呆，不亏。', '摄像头关着，人生是自由的。'],
      'angry:spreadsheet': ['这个 Excel 再改一次我就辞职。', '合并单元格的人应该被合并。'],
      'angry:coding': ['退格键都快按穿了，需求还在变。', '删了重写第四遍，我恨。'],
      'idle:meeting': ['会议中，摸鱼请轻声。', '正在同步，实际在放空。'],
      'idle:slacking': ['摸得不多，刚好够回血。', '短暂离线，马上回来。'],
      'nirvana:aloneLate': ['虽然晚了点，但今天算是准时下班了。'],
    } as Partial<Record<string, string[]>>,

    /** Shown for “no modifier applies” when a name is required. */
    noModifier: '无',
    efficiencyHigh: '活干得少，钱一分没少，会玩。',
    efficiencyLow: (percent: number) =>
      `你的时薪被自己的加班稀释了 ${percent}%，恭喜降薪。`,
    praise: [
      '好吃！这条待办真香。',
      '干完一件是一件，你今天没白活。',
      '嚼嚼嚼……再来一个？',
      '这口有嚼劲，是重要任务的味道。',
      '投喂成功，心情 +10。',
    ],
  },

  notebook: {
    newFile: '新建文件',
    newFromTemplate: '从模板新建',
    newFolder: '新建文件夹',
  },

  launcher: {
    title: '启动器',
    intro:
      '按热键在屏幕中央打开启动器，输入首字母或名称片段即可启动桌面和开始菜单里的程序。索引在后台建好，敲键时不等 IPC。',
    hotkey: '启动器热键',
    hotkeyHint: '改完立即生效。被全屏游戏或其它软件占用时会注册失败，换一个即可。',
  },

  plugins: {
    browserAccess: (sites: string) =>
      `这是浏览器型插件：它会打开 ${sites}，并且可以读取和修改你在这些网站上的页面内容。登录状态保存在该插件自己的浏览器数据目录里，不与 DeskTime 或其它插件共享。`,
    title: '插件',
    intro:
      '插件放在 plugins 文件夹里，每个插件一个目录。改动 plugin.json 后点「重新加载」即可生效，不必重启。',
    openFolder: '打开插件文件夹',
    reload: '重新加载',
    reloading: '加载中…',
    /** Heading over the settings a plugin's manifest declared. */
    options: '选项',
    viewLog: '查看日志',
    enabled: '启用',
    permissions: '权限',
    backend: '后端进程',
    none: '还没有安装任何插件。',
    failed: (reason: string) => `加载失败：${reason}`,
    /** Shown in the plugin list for a plugin whose backend keeps crashing. */
    backendFailed: '后端进程反复退出，已停止重试。',
  },
}

/**
 * Deliberately **not** `as const`: that would make every value its own literal
 * type, and then a translation would have to equal the Chinese string to
 * type-check. What is wanted is the shape — the keys, and the signature of every
 * function — with the strings left as strings.
 */
export type Locale = typeof zhCN
