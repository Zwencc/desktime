// Reminder options, shared by the per-item editor and the global defaults in
// settings so the two can never drift apart.

import { type Reminder, CHANNELS, VISUALS } from './reminder'

const text = {
  channel: '渠道',
  lead: '提前',
  minutes: '分钟',
  topmost: '置顶',
  focus: '抢占焦点',
  visual: '提醒方式',
  repeat: '重复',
  every: '每',
  atMost: '最多',
  times: '次',
  unlimited: '0 = 不限，直到停止',
}

type ReminderFieldsProps = {
  value: Reminder
  onChange: (value: Reminder) => void
}

export function ReminderFields({ value, onChange }: ReminderFieldsProps) {
  function set<Key extends keyof Reminder>(key: Key, next: Reminder[Key]) {
    onChange({ ...value, [key]: next })
  }

  // Everything below the channel only applies to the popup window.
  const isPopup = value.channel === 'desktop'

  return (
    <div className="reminder-fields">
      <label className="field-row">
        <span>{text.channel}</span>
        <select
          value={value.channel}
          onChange={(event) => set('channel', event.target.value as Reminder['channel'])}
        >
          {CHANNELS.map((entry) => (
            <option key={entry.key} value={entry.key}>
              {entry.label}
            </option>
          ))}
        </select>
      </label>

      {value.channel !== 'off' && (
        <>
          <label className="field-row">
            <span>{text.lead}</span>
            <input
              type="number"
              min={0}
              max={1440}
              value={value.leadMinutes}
              onChange={(event) => set('leadMinutes', Math.max(0, Number(event.target.value) || 0))}
            />
            <small>{text.minutes}</small>
          </label>

          {isPopup && (
            <>
              <div className="field-row checks">
                <label>
                  <input
                    type="checkbox"
                    checked={value.topmost}
                    onChange={(event) => set('topmost', event.target.checked)}
                  />
                  <span>{text.topmost}</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={value.focus}
                    onChange={(event) => set('focus', event.target.checked)}
                  />
                  <span>{text.focus}</span>
                </label>
              </div>

              <label className="field-row">
                <span>{text.visual}</span>
                <select
                  value={value.visual}
                  onChange={(event) => set('visual', event.target.value as Reminder['visual'])}
                >
                  {VISUALS.map((entry) => (
                    <option key={entry.key} value={entry.key}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          <div className="field-row">
            <span>{text.repeat}</span>
            <small>{text.every}</small>
            <input
              type="number"
              min={0}
              max={180}
              value={value.repeatEveryMin}
              onChange={(event) =>
                set('repeatEveryMin', Math.max(0, Number(event.target.value) || 0))
              }
            />
            <small>{text.minutes}</small>
            <small>{text.atMost}</small>
            <input
              type="number"
              min={0}
              max={99}
              value={value.repeatMax}
              onChange={(event) => set('repeatMax', Math.max(0, Number(event.target.value) || 0))}
              title={text.unlimited}
            />
            <small>{text.times}</small>
          </div>
        </>
      )}
    </div>
  )
}

export default ReminderFields
