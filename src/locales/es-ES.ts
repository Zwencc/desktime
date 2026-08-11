// Español. Typed against zh-CN: a missing key will not compile.

import { enUS } from './en-US'
import type { Locale } from './zh-CN'

export const esES: Locale = {
  language: { name: 'Español' },

  common: {
    cancel: 'Cancelar',
    confirm: 'Aceptar',
    delete: 'Eliminar',
    save: 'Guardar',
    close: 'Cerrar',
    open: 'Abrir',
    add: 'Añadir',
    edit: 'Editar',
    rename: 'Cambiar nombre',
    reset: 'Restablecer',
    seconds: 's',
    minutes: 'min',
    pixels: 'px',
  },

  settings: {
    title: 'Ajustes',
    navGlobal: 'General',
    navGeneral: 'Apariencia',
    navWidgets: 'Widgets',
    navShortcuts: 'Atajos',
    navStartup: 'Inicio y segundo plano',
    navAbout: 'Acerca de',
    navNotebook: 'Notas',
    navNotebookGeneral: 'General',
    navTemplates: 'Plantillas',
    navSchedule: 'Agenda',
    navReminders: 'Recordatorios',
    navTags: 'Tipos de evento',
    navMoo: 'Reloj del currante',
    navMooShape: 'Apariencia',
    navWork: 'Jornada y sueldo',
    navActivity: 'Actividad',
    navLlm: 'Frases de IA',
    navLauncher: 'Lanzador',
    navPlugins: 'Complementos',
    navDev: 'Desarrollador',
  },

  general: {
    title: 'Apariencia',
    theme: 'Tema',
    language: 'Idioma',
    timeZone: 'Zona horaria',
    followSystem: 'Seguir al sistema',
    fixedZone: 'Zona fija',
  },

  startup: {
    title: 'Inicio y segundo plano',
    autostart: 'Iniciar con Windows',
    autostartHint:
      'Abre las ventanas de DeskTime tras iniciar sesión. No requiere permisos de administrador.',
    service: 'Protección en segundo plano',
    serviceHint:
      'Mantiene la recopilación y los recordatorios tras cerrar las ventanas. Solo requiere atención cuando aparece la opción de reparar.',
    serviceOff: 'Protección no instalada; modo degradado',
    serviceInstalled: 'Protección instalada pero detenida',
    serviceRunning: 'Protección lista',
    waiting: 'Esperando autorización…',
    dismissed: 'Se canceló la autorización; DeskTime seguirá en modo degradado.',
    repair: 'Reparar',
  },

  templates: {
    title: 'Plantillas de nota',
    intro:
      'Las plantillas son archivos .md de la carpeta templates; puedes añadirlas o borrarlas ahí directamente. La flecha junto a «Nueva» en las notas las lista, y al elegir una se crea un borrador a partir de ella.',
    variables: 'Variables: {{date}} {{time}} {{datetime}} {{weekday}} {{title}}',
    create: 'Nueva plantilla',
    remove: 'Eliminar plantilla',
    openFolder: 'Abrir la carpeta de plantillas',
    newName: 'Nueva plantilla',
    confirmRemove: (name: string) => `¿Eliminar la plantilla «${name}»? Irá a la papelera.`,
    empty: 'Elige una plantilla a la izquierda para editarla.',
  },

  clock: {
    lunarPrefix: 'Calendario lunar',
    pomodoroDone: '🍅 Pomodoro terminado',
    pomodoroDoneBody: 'Se acabó el tiempo de concentración: descansa un poco',
    hourlyChime: 'Toque horario',
    hourlyBody: (hour: number, zone: string) => `Son las ${hour}:00 en ${zone}`,
    hourlyOn: 'Toque horario: activado',
    hourlyOff: 'Toque horario: desactivado',
    startFocus: 'Empezar',
    pauseFocus: 'Pausa',
    resetFocus: 'Reiniciar el pomodoro',
    toMoo: 'Cambiar al reloj del currante',
  },

  schedule: {
    newSchedule: 'Nuevo evento',
    done: 'Marcar como hecho',
    undone: 'Marcar como pendiente',
    today: 'Hoy',
    week: 'Esta semana',
    all: 'Todo',
    month: 'Mes',
    allTags: 'Todos',
    empty: 'Nada previsto',
    overdue: 'Vencido',
    edit: 'Editar evento',
    muteOn: 'Recordatorios activos: haz clic para silenciar',
    muteOff: 'Recordatorios silenciados: haz clic para activar',
    stop: 'Detener recordatorio',
    snooze: 'Más tarde',
    minutesShort: (value: number) => `${value} min`,
    complete: 'Hecho',
    moreBanners: (value: number) => `${value} recordatorios más`,
  },

  scheduleEditor: {
    title: 'Editar evento',
    newTitle: 'Nuevo evento',
    name: 'Título',
    date: 'Fecha',
    time: 'Hora',
    repeat: 'Repetición',
    tag: 'Tipo',
    noTag: 'Sin tipo',
    reminder: 'Recordatorio',
  },

  reminderFields: {
    channel: 'Canal',
    lead: 'Antelación',
    topmost: 'Siempre visible',
    focus: 'Robar el foco',
    visual: 'Estilo',
    repeat: 'Repetición',
    every: 'cada',
    atMost: 'como máximo',
    times: 'veces',
    unlimited: '0 = hasta detenerlo',
  },

  reminderWindow: {
    title: 'Recordatorio',
    stop: 'Detener',
    stopAll: 'Detener todo',
    snooze: 'Más tarde',
    done: 'Hecho',
    minutes: (value: number) => `${value} min`,
    overdue: (value: number) => `${value} min de retraso`,
    round: (value: number) => `aviso ${value}`,
    more: (value: number) => `${value} más`,
  },

  widgetSettings: {
    title: 'Widgets',
    show: 'Mostrar',
    pin: 'Mantener encima',
    resetPositions: 'Restablecer todas las posiciones',
  },

  mooSettings: {
    title: 'Apariencia',
    shape: 'Forma de la ventana',
    float: 'Flotante',
    island: 'Isla',
    islandHint: 'La isla se sitúa centrada en la parte superior y se abre al pasar el ratón.',
  },

  reminderSettings: {
    title: 'Recordatorios',
    mute: 'Silenciar todo',
    fallback:
      'Usar una ventana emergente cuando salte un recordatorio interno y el widget de agenda esté oculto',
    defaults: 'Valores por defecto de los eventos nuevos',
  },

  notebookSettings: {
    vaultLock: 'Bloquear la caja fuerte tras una inactividad de',
    vaultBackup:
      'Hacer copia de la caja fuerte es copiar entera la carpeta «vault» que está junto al programa; restaurar es volver a copiarla. Solo contiene texto cifrado con nombres aleatorios, y copiar un único archivo no basta para restaurar nada.',
    title: 'Notas',
    autoSave: 'Guardar automáticamente tras',
  },

  tagSettings: {
    title: 'Tipos de evento',
    intro:
      'La lista y la vista mensual se colorean por tipo. Al borrar un tipo, sus eventos se quedan sin tipo; no se borran.',
    name: 'Nombre',
    color: 'Color',
    add: 'Añadir tipo',
    reset: 'Restaurar valores por defecto',
    untitled: 'Tipo nuevo',
  },

  workSettings: {
    schedule: 'Jornada',
    mode: 'Turnos',
    weekly: 'Igual cada semana',
    biweekly: 'Semanas alternas',
    weekA: 'Semana A',
    weekB: 'Semana B',
    anchor: 'Fecha de referencia',
    anchorEmpty: 'Sin definir',
    anchorPick: 'Elegir en el calendario',
    anchorDone: 'Cerrar el calendario',
    anchorHint:
      'La semana natural que contiene esta fecha cuenta como semana A; las demás se alternan a partir de ahí.',
    breakLabel: 'Comida',
    overtimePaid: 'Las horas extra se pagan',
    overtimeRate: 'Recargo',
    salary: 'Estructura del sueldo',
    incomes: 'Ingresos',
    deducts: 'Deducciones',
    addIncome: 'Añadir ingreso',
    addDeduct: 'Añadir deducción',
    namePlaceholder: 'Nombre',
    monthly: 'Mensual',
    weekly2: 'Semanal',
    yearly: 'Anual',
    once: 'Puntual',
    payMonth: 'Se paga en',
    fixed: 'Importe fijo',
    percent: 'Porcentaje',
    summary: 'Resultado',
    disposable: 'Neto al mes',
    standard: 'Horas mensuales de referencia',
    baseRate: 'Precio hora base',
    salaryHint:
      'Un ingreso puntual (una paga extra, por ejemplo) cuenta entero en el mes en que se cobra: ese mes el precio hora sube bastante.',
    lossHint:
      'El sueldo es opcional: la tasa de pérdida solo mira la proporción de horas no pagadas, nunca el importe.',
    counter: 'Contador de ingresos',
    cycle: 'Periodo',
    cycleMonth: 'Mensual',
    cycleWeek: 'Semanal',
    cycleDay: 'Diario',
    cycleStart: 'El periodo empieza el',
    dayOfMonth: 'de cada mes',
    unit: 'Mostrar como',
    unitMonth: 'Al mes',
    unitDay: 'Al día',
    unitHour: 'Por hora',
    unitMinute: 'Por minuto',
    showCents: 'Mostrar decimales (verlo correr es la gracia)',
    counterHint:
      'Sigue el horario previsto: escaquearse también suma, porque lo que se paga es el tiempo.',
  },

  activitySettings: {
    title: 'Actividad',
    intro:
      'El reloj del currante usa la actividad del ordenador para distinguir un día ocupado de uno flojo. Todo se queda en este equipo y nunca se sube: solo el número de pulsaciones (ni cuáles ni en qué orden), la distancia del ratón, el nombre del exe en primer plano y las señales que se activen abajo. Los títulos de ventana no se recogen nunca.',
    enable: 'Recoger actividad',
    mic: 'Micrófono / cámara en uso',
    micHint:
      'Lee un único booleano —si el dispositivo está ocupado— para estimar el tiempo de reuniones. No toca audio ni vídeo, ni anota qué programa lo usa.',
    audio: 'Reproducción de audio',
    audioHint: 'Solo lee si el sistema está emitiendo sonido, para distinguir ver de trabajar.',
    away: 'Ausente tras',
    awayHint: 'Sin actividad durante más de este tiempo, deja de contar como presencia.',
    retain: 'Conservar los datos',
    days: 'días',
    clear: 'Borrar todos los datos de actividad',
    cleared: 'Borrados',
    unknown: 'Programas sin clasificar',
    unknownHint:
      'Hasta que se clasifiquen, el motor de ánimo no sabe si estás charlando o programando.',
    autoClassify: 'Clasificar con IA',
    classifying: 'Clasificando…',
    llmOff: 'Configura antes un punto de acceso y una clave en «Frases de IA»',
    autoHint:
      'Envía solo el nombre de archivo y el nombre de producto de estos programas a tu punto de acceso para que adivine la categoría. Solo esos dos, nunca los títulos de ventana.',
    classifyFailed: 'Fallo al clasificar: el punto de acceso no devolvió nada aprovechable.',
    todayHead: 'Hoy',
    present: 'En el puesto',
    effective: 'Trabajo real',
    meeting: 'Reuniones',
    disabled: 'La recogida está desactivada, así que todos los números de abajo son 0.',
  },

  llmSettings: {
    title: 'Frases de IA (opcional)',
    intro:
      'Con un punto de acceso compatible con OpenAI las frases son más variadas. La petición la hace el backend local, así que la clave nunca entra en la vista web; ante un fallo, un tiempo agotado o una respuesta inesperada se vuelve en silencio a las frases locales y la interfaz nunca se bloquea.',
    enable: 'Usar frases de IA',
    baseUrl: 'Punto de acceso',
    model: 'Modelo',
    apiKey: 'Clave API',
    keySet: 'Clave guardada',
    keyEmpty: 'Sin definir',
    clear: 'Borrar',
    timeout: 'Tiempo límite',
    ms: 'ms',
    sendSalary: 'Permitir enviar cifras del sueldo (precio hora, importe no pagado)',
    sends: 'Se envía por defecto',
    never: 'Nunca se envía',
    sendList:
      'El nombre del estado de ánimo; pérdida, escaqueo e intensidad como tres números entre 0 y 1; minutos en el puesto, en horas extra y en reuniones de hoy.',
    neverList:
      'Nombres de aplicaciones, títulos de ventana, títulos de eventos, rutas de archivos, pulsaciones. La estructura de la petición del backend no tiene campo para ninguno.',
    rate: 'Solo al cambiar el estado de ánimo, y como mucho una vez cada cinco minutos.',
  },

  shortcutSettings: {
    title: 'Atajos',
    intro:
      'Los atajos globales funcionan en cualquier programa y se vuelven a registrar en cuanto los cambias, sin reiniciar. Por defecto usan Ctrl+Alt+número: un simple Ctrl+número le quitaría esa tecla a todos los demás programas (pestañas del navegador, grupos del editor) sin que se entienda por qué.',
    record: 'Pulsa para grabar',
    recording: 'Pulsa una combinación… (Esc para cancelar)',
    unbound: 'Sin definir',
    launcher:
      'El atajo del lanzador se configura en «Lanzador»; si choca con alguno de aquí también se avisa.',
    conflict: (name: string) => `Igual que «${name}»: solo funcionará uno de los dos`,
    failed: 'El sistema lo rechazó: otro programa ya usa esa tecla. Elige otra.',
    inWindow: 'Dentro de un widget',
    escapeLabel: 'Dejar de mantener el widget encima',
    escapeHint:
      'Solo mientras el foco esté en la ventana de un widget. No ocupa ninguna tecla global y por eso no se puede cambiar.',
    swap: 'Cambiar entre reloj y reloj del currante',
    pin: 'Fijar / soltar',
    launcherAction: 'Atajo del lanzador',
  },

  devSettings: {
    title: 'Desarrollador',
    root: 'Carpeta del marcador',
    hint: 'Pon un archivo llamado devmod.dev en la carpeta de arriba y reinicia la aplicación.',
    open: 'Depurador de actividad',
    reload: 'Recargar todas las ventanas',
  },

  about: {
    title: 'Acerca de',
    storage: 'Configuración y datos',
    storageHint:
      'La configuración, los borradores y los datos de actividad están todos en esta carpeta, allí donde esté instalada la aplicación.',
    open: 'Abrir la carpeta',
    configFailed: 'No se pudo guardar la configuración',
    configFailedBody: (path: string, reason: string) =>
      `Los cambios no llegaron a ${path}
${reason}
Comprueba que se puede escribir en esa carpeta.`,
  },

  mooPanel: {
    toNormal: 'Cambiar al reloj normal',
    toIsland: 'Cambiar a la isla',
    toFloat: 'Cambiar a ventana flotante',
    monitorLocked: 'Activa la recogida de actividad en los ajustes para ver las cifras de hoy',
    loss: 'Pérdida',
    slack: 'Escaqueo',
    intensity: 'Intensidad',
    startFishing: 'Escaquearse (disfrazado de reloj normal)',
    stopFishing: 'Salir del modo escaqueo',
    feed: 'Dar de comer',
    report: 'Balance del día',
    feedEmpty: 'Hoy ya no queda nada que darle.',
    feedHint: 'Arrastra una tarea pendiente sobre la cara',
    feedNow: 'Dar',
  },

  report: {
    title: 'Balance del día',
    older: 'Día anterior',
    newer: 'Día siguiente',
    empty: 'Todavía no hay balance. Se escribe cuando acaba tu jornada.',
    present: 'En el puesto',
    effective: 'Trabajo real',
    slack: 'Escaqueo',
    meeting: 'Reuniones',
    overtime: 'Horas extra',
    wasted: 'No pagado',
    earned: 'Ganado',
    fishing: 'Escaqueo pagado',
    fishingValue: 'Neto',
    fed: 'Comidas dadas',
    times: 'veces',
    mood: 'Ánimo de hoy',
    noActivity:
      'Hoy no se ha recogido actividad: puede que el equipo estuviera apagado o que la recogida esté desactivada.',
  },

  earnings: {
    locked: 'Configura el sueldo para desbloquear el contador',
    earned: 'Ganado',
    wasted: 'No pagado',
    month: 'Este mes',
    week: 'Esta semana',
    day: 'Hoy',
    unitMonth: 'Al mes',
    unitDay: 'Al día',
    unitHour: 'Por hora',
    unitMinute: 'Por minuto',
  },

  notebookPanel: {
    vaultBackedUp: 'No se pudo guardar; el texto está en una copia cifrada dentro de la caja fuerte',
    vaultSaveLost: 'El último cambio no se pudo guardar',
    vaultFailed: (reason: string) => `Falló la operación de la caja fuerte: ${reason}`,
    vaultNewNote: 'Nota nueva.dtnote',
    vaultKeptPlain: (name: string) =>
      `«${name}» se cifró, pero no se pudo borrar la copia en claro — bórrala a mano`,
    vaultNotMoved: (name: string, reason: string) => `«${name}» no se movió: ${reason}`,
    vaultMoveInTitle: 'Mover a la caja fuerte',
    vaultMovedIn: (count: number) =>
      `${count} notas ya están cifradas en la caja fuerte. Los archivos en claro se borraron directamente, sin pasar por la papelera.`,
    vaultDeleteTitle: 'Eliminar una nota privada',
    vaultDeleteBody: (name: string) =>
      `«${name}» se eliminará de la caja fuerte para siempre. No va a la papelera y no se puede recuperar.`,
    vaultMoveOutTitle: 'Sacar de la caja fuerte',
    vaultMoveOutBody: (name: string) =>
      `«${name}» se descifrará en un archivo .dtnote normal y saldrá de la caja fuerte.`,
    vaultMoveOutWarning:
      'Es la única operación que devuelve el contenido privado a un archivo legible. Una vez escrito, cualquiera puede abrirlo.',
    vaultMoveOutAction: 'Descifrar y sacar',
    placeholder: 'Apunta algo…',
    toggleSidebar: 'Archivos',
    saveAs: 'Guardar como',
    openFile: 'Abrir un archivo existente',
    newFolderName: 'Carpeta nueva',
    unsaved: 'Sin guardar',
    saving: 'Guardando…',
    saved: (at: string) => `Guardado ${at}`,
    draft: 'Borrador · no está en disco',
    saveFailed: 'Fallo al guardar; el texto está en una copia local',
    renameFailed: (reason: string) => `Fallo al cambiar el nombre: ${reason}`,
    deleteFailed: (reason: string) => `Fallo al eliminar: ${reason}`,
    empty: 'Crea o abre un archivo a la izquierda',
    deleteFileTitle: 'Eliminar archivo',
    deleteFileBody: (name: string) =>
      `«${name}» irá a la papelera de Windows y se podrá restaurar.`,
    deleteFolderTitle: 'Eliminar carpeta',
    deleteFolderEmpty: (name: string) => `«${name}» está vacía y se quitará.`,
    deleteFolderBody: (name: string, count: number) =>
      `«${name}» contiene ${count} archivo(s); todos irán a la papelera de Windows:`,
    andMore: (count: number) => `y ${count} más`,
    deleteDraftTitle: 'Eliminar borrador',
    deleteDraftBody: (name: string) =>
      `«${name}» no se ha guardado nunca en disco; eliminarlo no tiene vuelta atrás.`,
    deleteAnyway: 'Eliminar igualmente',
    openFailed: (reason: string) => `No se pudo abrir: ${reason}`,
    migrateTitle: 'Convertir las notas antiguas a .dtnote',
    migrateBody: (count: number) =>
      `Se han encontrado ${count} notas en el formato antiguo. Cada una pasa a ser un único archivo .dtnote con sus imágenes dentro; el original va a la papelera de Windows y se puede recuperar, y los archivos de imagen se quedan donde están.`,
    migrateImages: (count: number) => `${count} imágenes`,
    migrateWarnExternal: (reference: string) =>
      `Esta imagen no entrará en la nota y se queda donde está: ${reference}`,
    migrateWarnShared: (reference: string) =>
      `La usan varias notas; cada una guarda su propia copia: ${reference}`,
    migrateWarnRemote: (reference: string) => `Está en la web, se deja tal cual: ${reference}`,
    migrateWarnTargetExists: 'Ya existe un .dtnote con ese nombre; esta nota se omite',
    migrateStart: 'Convertir',
    migrateLater: 'Ahora no',
    migrateDoneTitle: 'Conversión terminada',
    migrateDoneBody: (converted: number, failed: number) =>
      `${converted} convertidas, ${failed} sin cambios. El registro completo está en la carpeta logs.`,
    migrateFailed: (reason: string) => `La conversión ha fallado: ${reason}`,
    legacyNote: 'Nota rápida (antigua)',
    draftPrefix: 'Borrador ',
  },

  editor: {
    bold: 'Negrita',
    italic: 'Cursiva',
    heading: 'Título',
    bullet: 'Lista con viñetas',
    checklist: 'Lista de tareas',
    preview: 'Vista previa',
    edit: 'Editar',
    chars: 'car.',
  },

  sidebar: {
    vault: 'Caja fuerte',
    vaultLock: 'Bloquear ahora',
    vaultEmpty: 'La caja fuerte está vacía',
    vaultMoveIn: 'Mover a la caja fuerte',
    vaultMoveOut: 'Sacar de la caja fuerte',
    search: 'Buscar',
    drafts: 'Borradores',
    reveal: 'Mostrar en el Explorador',
    newFileHere: 'Nuevo archivo en esta carpeta',
    missing: 'Falta el archivo',
    unsaved: 'Sin guardar',
    empty: 'Todavía no hay archivos guardados',
    webOnly: 'Guardar archivos requiere la aplicación de escritorio',
  },

  vault: {
    createTitle: 'Crear la caja fuerte',
    createBody:
      'Elige una contraseña y una pregunta tuya. Las dos son obligatorias y la contraseña tiene al menos 8 caracteres.',
    unlockTitle: 'La caja fuerte está bloqueada',
    recoverTitle: 'Desbloquear con tu pregunta',
    resetTitle: 'Poner una contraseña nueva',
    resetBody: 'Correcto. Pon una contraseña nueva antes de entrar.',
    password: 'Contraseña',
    passwordAgain: 'Otra vez',
    newPassword: 'Contraseña nueva',
    question: 'Tu pregunta',
    answer: 'Respuesta',
    answerAgain: 'Repite la respuesta',
    answerWarning:
      'La respuesta es una segunda contraseña: abre todo lo que abre la contraseña, así que la caja fuerte vale lo que la más débil de las dos. Evita cosas adivinables, como el nombre de tu primer colegio.',
    questionWarning:
      'La pregunta se puede leer con la caja fuerte bloqueada: no pongas un secreto en ella.',
    forgot: '¿Has olvidado la contraseña?',
    backToPassword: 'Volver a la contraseña',
    delayNote:
      'Cada fallo alarga la espera, pero eso solo frena los intentos hechos aquí. Quien tenga una copia de la carpeta puede probar sin conexión a la velocidad que quiera: la defensa real es lo fuertes que sean la contraseña y la respuesta.',
    rejected: 'Contraseña o respuesta incorrecta, o los datos están dañados',
    working: 'Trabajando…',
    createAction: 'Crear',
    unlockAction: 'Desbloquear',
    resetAction: 'Poner contraseña',
  },

  calendar: {
    previous: 'Mes anterior',
    next: 'Mes siguiente',
    backToToday: 'Volver a hoy',
    rest: 'Libre',
    work: 'Trabajo',
    weekdayHeads: ['D', 'L', 'M', 'X', 'J', 'V', 'S'],
    weekdays: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
  },

  launcherWindow: {
    placeholder: 'Buscar aplicaciones, carpetas, accesos directos',
    empty: 'Sin coincidencias',
    desktop: 'Escritorio',
    menu: 'Menú Inicio',
  },

  contextMenu: {
    pin: 'Mantener encima',
    show: 'Mostrar',
    reset: 'Restablecer la posición de esta ventana',
  },

  widgetShell: {
    pinTop: 'Mantener al frente',
    unpinTop: 'Dejar de mantener al frente',
    resize: 'Arrastra para redimensionar',
  },

  desktopPanel: {
    empty: 'No hay nada que mostrar en el escritorio.',
  },

  widgetNames: {
    clock: 'Reloj',
    note: 'Notas',
    schedule: 'Agenda',
    moo: 'Reloj del currante',
    desktop: 'Capa de escritorio',
  },

  themeNames: {
    default: 'Predeterminado',
    cyber: 'Cubículo cíber',
    concrete: 'Hormigón',
    fish: 'Verde escaqueo',
    bossAway: 'El jefe no está',
    paper: 'Papel',
  },

  categories: {
    chat: 'Mensajería',
    dev: 'Desarrollo',
    office: 'Documentos',
    browser: 'Navegador',
    media: 'Multimedia',
    design: 'Diseño',
    other: 'Otros',
  },

  scheduleData: {
    tagWork: 'Trabajo',
    tagLife: 'Personal',
    tagImportant: 'Importante',
    tagStudy: 'Estudio',
    repeatNone: 'No se repite',
    repeatDaily: 'Cada día',
    repeatWeekly: 'Cada semana',
    repeatWeekday: 'Entre semana',
    seedTitle: 'Ordenar las prioridades de hoy',
    remaining: (count: number) => `${count} pendientes`,
    allDone: 'Todo hecho 🎉',
  },

  reminderData: {
    channelOff: 'Sin recordatorio',
    channelInapp: 'En la aplicación',
    channelDesktop: 'Ventana emergente',
    channelToast: 'Notificación del sistema',
    visualStatic: 'Sin animación',
    visualBreathe: 'Borde que respira',
    visualBlink: 'Ventana parpadeante',
    visualShake: 'Temblor',
  },

  timeZones: {
    beijing: 'Hora de Pekín',
    local: 'Hora local',
  },

  // Not translated: these lines are the widget's personality, and the joke does
  // not survive a literal rendering. Localising them means rewriting them for
  // the language, which is a writing job — until someone does it, English is a
  // more honest answer than a flat translation.
  moo: enUS.moo,

  notebook: {
    newFile: 'Nueva nota',
    newFromTemplate: 'Nueva desde plantilla',
    newFolder: 'Nueva carpeta',
  },

  launcher: {
    title: 'Lanzador',
    intro:
      'El atajo abre el lanzador en el centro de la pantalla: escribe las iniciales o parte del nombre para abrir programas del escritorio y del menú Inicio. El índice se crea en segundo plano, así que escribir nunca espera.',
    hotkey: 'Atajo del lanzador',
    hotkeyHint:
      'Se aplica de inmediato. Si un juego a pantalla completa u otra aplicación ya usa esa tecla, el registro falla: elige otra.',
  },

  plugins: {
    browserAccess: (sites: string) =>
      `Esto es un plugin de navegador: abre ${sites} y puede leer y modificar el contenido de las páginas que ves en esos sitios. Sus sesiones quedan en el perfil de navegación propio del plugin, que no se comparte ni con DeskTime ni con otros plugins.`,
    title: 'Complementos',
    intro:
      'Los complementos viven en la carpeta plugins, un directorio cada uno. Tras editar un plugin.json, pulsa Recargar — no hace falta reiniciar.',
    openFolder: 'Abrir la carpeta de complementos',
    reload: 'Recargar',
    reloading: 'Recargando…',
    options: 'Opciones',
    viewLog: 'Ver el registro',
    enabled: 'Activado',
    permissions: 'Permisos',
    backend: 'Proceso de servidor',
    none: 'Aún no hay complementos instalados.',
    failed: (reason: string) => `Error al cargar: ${reason}`,
    backendFailed: 'El proceso de servidor se cerró repetidamente; se han detenido los reintentos.',
  },
}
