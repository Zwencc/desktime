// The settings navigation tree.
//
// Same idea as the widget registry: one table decides what the settings window
// contains, and the shell in SettingsWindow.tsx renders whatever is here without
// knowing any of it. Adding a settings page is one entry plus the component it
// names — no edit to the layout.
//
// A node is either a heading with `children` or a page with a `Component`, never
// both. That rule is what keeps the shell to a single pass: everything with a
// `Component` is selectable, everything else is a label.

import type { ComponentType } from 'react'
import { locale } from './locales'
import { AboutSettings } from './AboutSettings'
import { ActivitySettings } from './ActivitySettings'
import { DesktopSettings } from './DesktopSettings'
import { DevSettings } from './DevSettings'
import { GeneralSettings } from './GeneralSettings'
import { LlmSettings } from './LlmSettings'
import { MooSettings } from './MooSettings'
import { NotebookSettings } from './NotebookSettings'
import { PluginSettings } from './PluginSettings'
import { ReminderSettings } from './ReminderSettings'
import { ShortcutSettings } from './ShortcutSettings'
import { StartupSettings } from './StartupSettings'
import { TagSettings } from './TagSettings'
import { TemplateSettings } from './TemplateSettings'
import { WidgetSettings } from './WidgetSettings'
import { WorkSettings } from './WorkSettings'

export type SettingsSection = {
  id: string
  label: string
  /** Rendered in the right column when this node is selected. */
  Component?: ComponentType
  /** Present on headings, which are labels rather than pages. */
  children?: SettingsSection[]
  /** Listed only when the developer-mode marker file is present. */
  devOnly?: boolean
}

/**
 * Built on every call rather than held as a constant.
 *
 * The labels are translated, and a module-level array would capture whichever
 * language happened to be current when this module was first imported — a bug
 * that only appears after someone switches language, and then only in the
 * navigation column.
 */
export function settingsSections(): SettingsSection[] {
  const text = locale().settings
  return [
    {
      id: 'global',
      label: text.navGlobal,
      children: [
        { id: 'general', label: text.navGeneral, Component: GeneralSettings },
        { id: 'widgets', label: text.navWidgets, Component: WidgetSettings },
        { id: 'shortcuts', label: text.navShortcuts, Component: ShortcutSettings },
        { id: 'startup', label: text.navStartup, Component: StartupSettings },
        { id: 'plugins', label: text.navPlugins, Component: PluginSettings },
        { id: 'about', label: text.navAbout, Component: AboutSettings },
      ],
    },
    {
      id: 'notebook',
      label: text.navNotebook,
      children: [
        { id: 'notebook-general', label: text.navNotebookGeneral, Component: NotebookSettings },
        { id: 'templates', label: text.navTemplates, Component: TemplateSettings },
      ],
    },
    {
      id: 'schedule',
      label: text.navSchedule,
      children: [
        { id: 'reminders', label: text.navReminders, Component: ReminderSettings },
        { id: 'tags', label: text.navTags, Component: TagSettings },
      ],
    },
    {
      id: 'moo',
      label: text.navMoo,
      children: [
        { id: 'moo-shape', label: text.navMooShape, Component: MooSettings },
        { id: 'work', label: text.navWork, Component: WorkSettings },
        { id: 'activity', label: text.navActivity, Component: ActivitySettings },
        { id: 'llm', label: text.navLlm, Component: LlmSettings },
      ],
    },
    // The desktop layer this page was written for is retired, and what is left
    // of it is one field — the launcher's hotkey. Not deleted with the layer,
    // because the launcher itself is not retired and that key has no default
    // that suits everyone; just no longer worth a row of its own in a list
    // every user reads.
    { id: 'launcher', label: text.navLauncher, Component: DesktopSettings, devOnly: true },
    { id: 'dev', label: text.navDev, Component: DevSettings, devOnly: true },
  ]
}

/** The tree minus what developer mode is hiding. */
export function visibleSections(devMode: boolean): SettingsSection[] {
  return settingsSections().filter((section) => devMode || !section.devOnly)
}

/** Every page, in navigation order — the first is where the window opens. */
export function sectionPages(sections: SettingsSection[]): SettingsSection[] {
  return sections.flatMap((section) => (section.children ? section.children : [section]))
}

export function findSection(sections: SettingsSection[], id: string): SettingsSection | undefined {
  return sectionPages(sections).find((section) => section.id === id)
}
