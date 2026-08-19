// The "组件" section of the settings window: which widgets are on screen, which
// are pinned above other windows, and the reset that sends every one of them
// back to its anchored default position.
//
// The grid is built from the widget registry, so a new widget appears here with
// no edit to this file.

import { Fragment, useEffect, useState } from 'react'
import {
  applyPanelPin,
  pinnedKey,
  readAllPinnedStates,
  readAllVisibleStates,
  requestVisibility,
  resetPanelPosition,
  savePinnedState,
  visibleKey,
} from './panels'
import { type WidgetKey, widgetKeys, widgetName } from './widgets'
import { useLocale } from './locales'


export function WidgetSettings() {
  const text = useLocale().widgetSettings
  const [pinnedStates, setPinnedStates] = useState(readAllPinnedStates)
  const [visibleStates, setVisibleStates] = useState(readAllVisibleStates)

  // Pin/visible can also be changed from a widget title bar or the context menu.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      const pinnedPanel = widgetKeys.find((panel) => event.key === pinnedKey(panel))
      if (pinnedPanel) {
        setPinnedStates((current) => ({ ...current, [pinnedPanel]: event.newValue !== 'false' }))
        return
      }

      const visiblePanel = widgetKeys.find((panel) => event.key === visibleKey(panel))
      if (visiblePanel) {
        setVisibleStates((current) => ({ ...current, [visiblePanel]: event.newValue !== 'false' }))
      }
    }

    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  function setPinned(panel: WidgetKey, next: boolean) {
    setPinnedStates((current) => ({ ...current, [panel]: next }))
    savePinnedState(panel, next)
    void applyPanelPin(panel, next)
  }

  function setVisible(panel: WidgetKey, next: boolean) {
    const resolved = requestVisibility(visibleStates, panel, next)
    if (resolved) setVisibleStates(resolved)
  }

  return (
    <section className="settings-section">
      <h2>{text.title}</h2>
      <div className="widget-grid">
        <span />
        <span className="grid-head">{text.show}</span>
        <span className="grid-head">{text.pin}</span>
        {widgetKeys.map((panel) => (
          <Fragment key={panel}>
            <span>{widgetName(panel)}</span>
            <input
              type="checkbox"
              checked={visibleStates[panel]}
              onChange={(event) => setVisible(panel, event.target.checked)}
            />
            <input
              type="checkbox"
              checked={pinnedStates[panel]}
              onChange={(event) => setPinned(panel, event.target.checked)}
            />
          </Fragment>
        ))}
      </div>
      <button
        type="button"
        className="reminder-button"
        onClick={() => widgetKeys.forEach((panel) => void resetPanelPosition(panel))}
      >
        {text.resetPositions}
      </button>
    </section>
  )
}

export default WidgetSettings
