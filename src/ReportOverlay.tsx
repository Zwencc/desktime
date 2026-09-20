// The daily report, shown over the moo clock.
//
// It is an overlay inside the widget rather than another window: the report is
// read once and closed, and a seventh native window would have to be created,
// permissioned and kept in step for that.

import { useState, useSyncExternalStore } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { moodBreakdown, reportDates, reportFor, reportsSnapshot, subscribeReports } from './report'
import { formatHours, formatMoney } from './work'
import { useLocale } from './locales'


export function ReportOverlay({ onClose }: { onClose: () => void }) {
  const strings = useLocale()
  const text = strings.report
  useSyncExternalStore(subscribeReports, reportsSnapshot)
  const dates = reportDates()
  const [index, setIndex] = useState(0)
  const report = dates.length ? reportFor(dates[Math.min(index, dates.length - 1)]) : null

  return (
    <div className="moo-report" data-own-context>
      <div className="moo-report-head">
        <button
          className="icon-button"
          type="button"
          title={text.older}
          disabled={index >= dates.length - 1}
          onClick={() => setIndex((current) => Math.min(dates.length - 1, current + 1))}
        >
          <ChevronLeft size={14} aria-hidden="true" />
        </button>
        <span className="moo-report-title">{report ? report.date : text.title}</span>
        <button
          className="icon-button"
          type="button"
          title={text.newer}
          disabled={index <= 0}
          onClick={() => setIndex((current) => Math.max(0, current - 1))}
        >
          <ChevronRight size={14} aria-hidden="true" />
        </button>
        <button className="icon-button" type="button" title={strings.common.close} onClick={onClose}>
          <X size={14} aria-hidden="true" />
        </button>
      </div>

      {!report ? (
        <p className="settings-hint">{text.empty}</p>
      ) : (
        <div className="moo-report-body">
          <p className="moo-report-summary">{report.summary}</p>

          <div className="metric-grid">
            <span>{text.present}</span>
            <strong>{formatHours(report.presentMinutes)}</strong>
            <span>{text.effective}</span>
            <strong>{formatHours(report.effectiveMinutes)}</strong>
            <span>{text.slack}</span>
            <strong>{formatHours(report.slackMinutes)}</strong>
            {report.meetingMinutes > 0 && (
              <>
                <span>{text.meeting}</span>
                <strong>{formatHours(report.meetingMinutes)}</strong>
              </>
            )}
            {report.overtimeMinutes > 0 && (
              <>
                <span>{text.overtime}</span>
                <strong>{formatHours(report.overtimeMinutes)}</strong>
              </>
            )}
            <span>{text.earned}</span>
            <strong>{formatMoney(report.earned, report.currency, false)}</strong>
            {report.wasted > 0 && (
              <>
                <span>{text.wasted}</span>
                <strong>{formatMoney(report.wasted, report.currency, false)}</strong>
              </>
            )}
            {report.fishingMinutes > 0 && (
              <>
                <span>{text.fishing}</span>
                <strong>
                  {formatHours(report.fishingMinutes)} ·{' '}
                  {text.fishingValue} {formatMoney(report.fishingValue, report.currency, false)}
                </strong>
              </>
            )}
            {report.fedCount > 0 && (
              <>
                <span>{text.fed}</span>
                <strong>
                  {report.fedCount} {text.times}
                </strong>
              </>
            )}
          </div>

          {moodBreakdown(report).length > 0 && (
            <>
              <div className="settings-subhead">{text.mood}</div>
              <div className="moo-mood-bar">
                {moodBreakdown(report).map((entry) => (
                  <span
                    key={entry.key}
                    className="moo-mood-slice"
                    style={{ width: `${Math.round(entry.share * 100)}%` }}
                    title={`${entry.label} ${formatHours(entry.minutes)}`}
                  >
                    {entry.share > 0.12 ? entry.emoji : ''}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default ReportOverlay
