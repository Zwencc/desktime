// The developer-mode debug window.
//
// It exists because A8 ("keyboard polling looks dead, the mood is always 平静")
// has two causes that are indistinguishable from the widget: collection never
// started, or collection is fine and no threshold ever fires. Every number here
// is chosen to tell those two apart rather than to look informative.
//
// Read-only by construction — nothing in this window writes a setting, and the
// commands behind it cannot. The one action lives in settings, not here.

import { useEffect, useRef, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { X } from 'lucide-react'
import { closeForGood } from './panels'
import { type WorkMetrics, categoryNames, categoryOf, loadMetrics, readActivity } from './activity'
import {
  type ActivityDebug,
  type DevModeInfo,
  type RuntimeStatus,
  type WindowDiagnostic,
  activityDebug,
  devMode,
  runtimeStatus,
  windowDiagnostics,
} from './devtools'
import { type MoodInput, moodLabel, moods, traceMainState } from './moo'
import { formatClock, today } from './time'
import { readWork, workWindow } from './work'
import './App.css'

const text = {
  title: '开发者工具',
  close: '关闭',
  tabActivity: '活动检测',
  tabRuntime: '运行时',
  tabWindows: '窗口',
  collection: '采集开关',
  backend: '后端持有',
  stored: '前端存储',
  mismatch: '两边不一致：前端的配置没有推送到后端',
  live: '实时',
  foreground: '前台进程',
  category: '归类',
  idle: '距上次输入',
  thisMinute: '本分钟累计',
  minuteStart: '本分钟起点',
  keys: '按键',
  copy: '复制',
  back: '退格',
  mouse: '鼠标位移',
  switches: '切换',
  apps: '应用数',
  pulse: '按键活性',
  pulseOn: '正在增长',
  pulseOff: '无变化',
  recent: '最近窗口（喂给情绪引擎）',
  minutes: '分钟数',
  topApp: '主应用',
  mood: '情绪判定',
  metricsPending: '正在读取今日数据…',
  result: '结论',
  ruleHint: '自上而下取第一条全部命中的规则；都不命中则 idle',
  todaySummary: '今日汇总',
  present: '在岗',
  effective: '有效',
  meeting: '会议',
  locked: '锁屏',
  records: '最近落盘的分钟',
  noRecords: '本进程还没有写入任何分钟记录',
  core: 'DTCore 后台进程',
  coreReachable: '可连接',
  corePid: '进程号',
  coreSchema: '数据库版本',
  coreProtocol: '协议版本',
  coreMinutes: '已存分钟数',
  coreDown: 'DTCore 没有响应，采集与活动查询全部不可用',
  sampler: '采集线程',
  lastSample: '最后采样',
  ago: '距今',
  committed: '本次运行已落盘',
  storeFailed: '最近一次落盘失败',
  queue: '提醒队列',
  worker: '工作线程',
  queued: '排队中',
  ringing: '响铃中',
  nextTrigger: '下次触发',
  fallback: '应用内回退弹窗',
  devmod: '开发者模式',
  root: '标记目录',
  label: '窗口',
  visible: '可见',
  focused: '聚焦',
  geometry: '位置 / 尺寸',
  scale: '缩放',
  policy: '策略 appVisible',
  policyHint: 'appVisible 为「—」代表该窗口未注册进原生可见性策略；menu / reminder / settings / launcher / devtools 本就如此，widget 出现「—」才是问题',
  yes: '是',
  no: '否',
  none: '—',
  webOnly: '此窗口需要在桌面应用中打开',
  unit: {
    ms: 'ms',
    px: 'px',
    min: '分',
    times: '次',
  },
}

type Tab = 'activity' | 'runtime' | 'windows'

const tabs: { key: Tab; name: string }[] = [
  { key: 'activity', name: text.tabActivity },
  { key: 'runtime', name: text.tabRuntime },
  { key: 'windows', name: text.tabWindows },
]

function startDrag(event: MouseEvent<HTMLElement>) {
  if (event.button !== 0) return
  if ((event.target as HTMLElement | null)?.closest('button,input,select')) return

  void getCurrentWindow().startDragging()
}

/** Runs `job` now and every `everyMs`, but only while `on`. */
function usePoll(on: boolean, everyMs: number, job: () => void) {
  const latest = useRef(job)
  latest.current = job

  useEffect(() => {
    if (!on) return

    const tick = () => latest.current()
    tick()
    const timer = window.setInterval(tick, everyMs)
    return () => window.clearInterval(timer)
  }, [on, everyMs])
}

function yesNo(value: boolean) {
  return value ? text.yes : text.no
}

/** Epoch ms as a clock reading in the app's time zone; `—` for "never". */
function clockOf(ts: number | null | undefined) {
  return ts ? formatClock(new Date(ts)) : text.none
}

function Row({ label, value, tone }: { label: string; value: ReactNode; tone?: 'ok' | 'bad' }) {
  return (
    <div className="dev-row">
      <span className="dev-label">{label}</span>
      <span className={tone ? `dev-value dev-${tone}` : 'dev-value'}>{value}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="dev-section">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

export function DevToolsWindow() {
  const [tab, setTab] = useState<Tab>('activity')
  const [dev, setDev] = useState<DevModeInfo | null>(null)
  const [debug, setDebug] = useState<ActivityDebug | null>(null)
  const [status, setStatus] = useState<RuntimeStatus | null>(null)
  const [windows, setWindows] = useState<WindowDiagnostic[]>([])
  const [metrics, setMetrics] = useState<WorkMetrics | null>(null)
  const [failed, setFailed] = useState(false)

  // Growth of the key counter, which is the one question a static number cannot
  // answer: a total of 0 and a total that stopped moving look the same.
  const [growing, setGrowing] = useState(false)
  const lastKeys = useRef(-1)

  useEffect(() => {
    void devMode().then(setDev)
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') void closeForGood()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  usePoll(tab === 'activity', 1000, () => {
    void activityDebug()
      .then((next) => {
        setGrowing(lastKeys.current >= 0 && next.snapshot.keysTotal > lastKeys.current)
        lastKeys.current = next.snapshot.keysTotal
        setDebug(next)
      })
      .catch(() => setFailed(true))
  })

  // A month of day ranges is far too heavy for a one-second poll, and L/F/I do
  // not move that fast anyway.
  usePoll(tab === 'activity', 5000, () => {
    void loadMetrics()
      .then(setMetrics)
      .catch(() => setMetrics(null))
  })

  usePoll(tab === 'runtime', 1000, () => {
    void runtimeStatus()
      .then(setStatus)
      .catch(() => setFailed(true))
  })

  usePoll(tab === 'windows', 2000, () => {
    void windowDiagnostics()
      .then(setWindows)
      .catch(() => setFailed(true))
  })

  const stored = readActivity()

  return (
    <main className="settings-window devtools-window">
      <div className="settings-handle" onMouseDown={startDrag}>
        <span>{text.title}</span>
        <button
          className="icon-button"
          type="button"
          title={text.close}
          onClick={() => void closeForGood()}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>

      <div className="dev-tabs">
        {tabs.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className={tab === entry.key ? 'dev-tab active' : 'dev-tab'}
            onClick={() => setTab(entry.key)}
          >
            {entry.name}
          </button>
        ))}
      </div>

      <div className="settings-body">
        <div className="settings-scroll">
          {failed && <p className="dev-warning">{text.webOnly}</p>}

          {tab === 'activity' && debug && (
            <>
              <Section title={text.collection}>
                <Row
                  label={text.backend}
                  value={yesNo(debug.config.enabled)}
                  tone={debug.config.enabled ? 'ok' : 'bad'}
                />
                <Row label={text.stored} value={yesNo(stored.monitor.enabled)} />
                {debug.config.enabled !== stored.monitor.enabled && (
                  <p className="dev-warning">{text.mismatch}</p>
                )}
                <Row label={text.lastSample} value={clockOf(debug.snapshot.sampledAt)} />
              </Section>

              <Section title={text.live}>
                <Row
                  label={text.foreground}
                  value={debug.snapshot.foregroundExe || text.none}
                  tone={debug.snapshot.foregroundExe ? undefined : 'bad'}
                />
                <Row
                  label={text.category}
                  value={
                    categoryNames[categoryOf(debug.snapshot.foregroundExe, stored.categories)]
                  }
                />
                <Row label={text.idle} value={`${debug.snapshot.idleMs} ${text.unit.ms}`} />
              </Section>

              <Section title={text.thisMinute}>
                <Row label={text.minuteStart} value={clockOf(debug.snapshot.minute)} />
                <Row label={text.pulse} value={
                  <span className={growing ? 'dev-pulse on' : 'dev-pulse'}>
                    {growing ? text.pulseOn : text.pulseOff}
                  </span>
                } />
                <Row label={text.keys} value={debug.snapshot.keysTotal} />
                <Row label={text.copy} value={debug.snapshot.keysCopy} />
                <Row label={text.back} value={debug.snapshot.keysBack} />
                <Row label={text.mouse} value={`${debug.snapshot.mousePx} ${text.unit.px}`} />
                <Row label={text.switches} value={debug.snapshot.appSwitches} />
                <Row label={text.apps} value={debug.snapshot.distinctApps} />
                <Row label={text.committed} value={debug.snapshot.committed} />
              </Section>

              {metrics && (
                <>
                  <Section title={text.recent}>
                    <Row label={text.minutes} value={metrics.today.recent.minutes} />
                    <Row label={text.topApp} value={metrics.today.recent.topApp || text.none} />
                    <Row label={text.keys} value={metrics.today.recent.keysTotal} />
                    <Row label={text.copy} value={metrics.today.recent.keysCopy} />
                    <Row label={text.back} value={metrics.today.recent.keysBack} />
                    <Row label={text.switches} value={metrics.today.recent.appSwitches} />
                    <Row label={text.apps} value={metrics.today.recent.distinctApps} />
                  </Section>

                  <MoodTrace metrics={metrics} />

                  <Section title={text.todaySummary}>
                    <Row
                      label={text.present}
                      value={`${metrics.today.presentMinutes} ${text.unit.min}`}
                    />
                    <Row
                      label={text.effective}
                      value={`${metrics.today.effectiveMinutes} ${text.unit.min}`}
                    />
                    <Row
                      label={text.meeting}
                      value={`${metrics.today.meetingMinutes} ${text.unit.min}`}
                    />
                    <Row
                      label={text.locked}
                      value={`${metrics.today.lockedMinutes} ${text.unit.min}`}
                    />
                  </Section>
                </>
              )}
              {!metrics && <Section title={text.mood}>
                <p className="settings-hint">{text.metricsPending}</p>
              </Section>}

              <Section title={text.records}>
                {debug.recentRecords.length === 0 && (
                  <p className="settings-hint">{text.noRecords}</p>
                )}
                {debug.recentRecords.length > 0 && (
                  <div className="dev-records">
                    {debug.recentRecords
                      .slice()
                      .reverse()
                      .map((record) => (
                        <div key={record.ts} className="dev-record">
                          <span>{clockOf(record.ts)}</span>
                          <span>{record.topApp || text.none}</span>
                          <span>{`${record.keysTotal} ${text.keys}`}</span>
                          <span>{`${record.mousePx} ${text.unit.px}`}</span>
                          <span>{`${record.appSwitches} ${text.unit.times}`}</span>
                        </div>
                      ))}
                  </div>
                )}
              </Section>
            </>
          )}

          {tab === 'runtime' && (
            <>
              <Section title={text.devmod}>
                <Row
                  label={text.devmod}
                  value={yesNo(dev?.enabled ?? false)}
                  tone={dev?.enabled ? 'ok' : 'bad'}
                />
                <p className="dev-path">{dev?.root || text.none}</p>
              </Section>

              {status && (
                <>
                  <Section title={text.core}>
                    <Row
                      label={text.coreReachable}
                      value={yesNo(Boolean(status.core))}
                      tone={status.core ? 'ok' : 'bad'}
                    />
                    {status.core ? (
                      <>
                        <Row label={text.corePid} value={status.core.pid} />
                        <Row label={text.coreProtocol} value={status.core.protocolVersion} />
                        <Row label={text.coreSchema} value={status.core.schemaVersion} />
                        <Row label={text.coreMinutes} value={status.core.storedMinutes} />
                      </>
                    ) : (
                      <p className="dev-path">{status.coreError || text.coreDown}</p>
                    )}
                  </Section>

                  <Section title={text.sampler}>
                    <Row
                      label={text.collection}
                      value={yesNo(status.activityEnabled)}
                      tone={status.activityEnabled ? 'ok' : 'bad'}
                    />
                    <Row label={text.lastSample} value={clockOf(status.activitySampledAt)} />
                    <Row
                      label={text.ago}
                      value={
                        status.activitySampledAt
                          ? `${Math.round((status.now - status.activitySampledAt) / 1000)} s`
                          : text.none
                      }
                      tone={
                        status.activitySampledAt &&
                        status.now - status.activitySampledAt < 5000
                          ? 'ok'
                          : 'bad'
                      }
                    />
                    <Row label={text.committed} value={status.activityCommitted} />
                    {status.activityStoreError && (
                      <Row
                        label={text.storeFailed}
                        value={status.activityStoreError}
                        tone="bad"
                      />
                    )}
                  </Section>

                  <Section title={text.queue}>
                    <Row
                      label={text.worker}
                      value={yesNo(status.reminder.workerRunning)}
                      tone={status.reminder.workerRunning ? 'ok' : 'bad'}
                    />
                    <Row label={text.queued} value={status.reminder.queued} />
                    <Row label={text.ringing} value={status.reminder.ringing} />
                    <Row label={text.nextTrigger} value={clockOf(status.reminder.nextTrigger)} />
                    <Row label={text.fallback} value={yesNo(status.reminder.inappFallback)} />
                  </Section>
                </>
              )}
            </>
          )}

          {tab === 'windows' && (
            <Section title={text.label}>
              <div className="dev-windows">
                <span className="dev-head">{text.label}</span>
                <span className="dev-head">{text.visible}</span>
                <span className="dev-head">{text.focused}</span>
                <span className="dev-head">{text.geometry}</span>
                <span className="dev-head">{text.scale}</span>
                <span className="dev-head">{text.policy}</span>
                {windows.map((entry) => (
                  <WindowRow key={entry.label} entry={entry} />
                ))}
              </div>
              <p className="settings-hint">{text.policyHint}</p>
            </Section>
          )}
        </div>
      </div>
    </main>
  )
}

/** One row of the window table: six cells straight into the parent grid. */
function WindowRow({ entry }: { entry: WindowDiagnostic }) {
  return (
    <>
      <span>{entry.label}</span>
      <span>{yesNo(entry.visible)}</span>
      <span>{yesNo(entry.focused)}</span>
      <span>{`${entry.x},${entry.y} · ${entry.width}×${entry.height}`}</span>
      <span>{entry.scale.toFixed(2)}</span>
      <span>{entry.appVisible === null ? text.none : yesNo(entry.appVisible)}</span>
    </>
  )
}

/** L / F / I, then every main-state rule with the values it actually saw. */
function MoodTrace({ metrics }: { metrics: WorkMetrics }) {
  const work = readWork()
  const ymd = today()
  const shift = workWindow(work.schedule, ymd)
  const at = Date.now()

  // The same input MooPanel builds, so the trace explains the face on screen
  // rather than a hypothetical one.
  const input: MoodInput = {
    loss: metrics.loss,
    slack: metrics.slack,
    intensity: metrics.intensity,
    pastEndMinutes: shift ? (at - shift.end) / 60000 : null,
    inWorkWindow: shift !== null && at >= shift.start && at < shift.end,
    overtimeMinutes: metrics.overtimeMinutes,
    overtimePaid: work.schedule.overtimePaid,
    category: metrics.category,
    recent: metrics.today.recent,
  }

  const rules = traceMainState(input)
  const matched = rules.find((rule) => rule.matched)
  const mood = moods[matched?.key ?? 'idle']

  return (
    <Section title={text.mood}>
      <Row label="L (loss)" value={input.loss.toFixed(3)} />
      <Row label="F (slack)" value={input.slack.toFixed(3)} />
      <Row label="I (intensity)" value={input.intensity.toFixed(3)} />
      <Row
        label={text.result}
        value={`${mood.emoji} ${moodLabel(mood)}`}
        tone={matched ? 'ok' : undefined}
      />
      <div className="dev-rules">
        {rules.map((rule) => (
          <div key={rule.key} className={rule.matched ? 'dev-rule matched' : 'dev-rule'}>
            <span className="dev-rule-key">{rule.key}</span>
            {rule.conditions.map((entry) => (
              <span
                key={entry.test}
                className={entry.passed ? 'dev-cond passed' : 'dev-cond'}
              >
                {`${entry.test} → ${entry.value}`}
              </span>
            ))}
          </div>
        ))}
      </div>
      <p className="settings-hint">{text.ruleHint}</p>
    </Section>
  )
}

export default DevToolsWindow
