import { lazy, Suspense } from 'react'

// Widgets are code-split so the initial bundle stays small.
const WIDGETS = {
  'timer.start': lazy(() => import('../widgets/TimerWidget')),
  'stopwatch.start': lazy(() => import('../widgets/StopwatchWidget')),
  'note.create': lazy(() => import('../widgets/NoteWidget')),
  'notes.search': lazy(() => import('../widgets/NotesSearchWidget')),
  'reminder.create': lazy(() => import('../widgets/ReminderWidget')),
  'calendar.create': lazy(() => import('../widgets/CalendarWidget')),
  'pomodoro.start': lazy(() => import('../widgets/PomodoroWidget')),
  'clipboard.history': lazy(() => import('../widgets/ClipboardWidget')),
  'snippets.open': lazy(() => import('../widgets/SnippetsWidget')),
  'calendar.agenda': lazy(() => import('../widgets/AgendaWidget')),
  confirm: lazy(() => import('../widgets/ConfirmWidget')),
  'tasks.open': lazy(() => import('../widgets/TasksWidget')),
  'time.report': lazy(() => import('../widgets/TimesheetWidget')),
  'emoji.pick': lazy(() => import('../widgets/EmojiWidget')),
  'dev.scratchpad': lazy(() => import('../widgets/ScratchpadWidget')),
  'ports.manage': lazy(() => import('../widgets/PortsWidget')),
  'script.run': lazy(() => import('../widgets/ScriptWidget')),
  'chain.run': lazy(() => import('../widgets/ChainWidget')),
  'search.all': lazy(() => import('../widgets/SearchAllWidget')),
  'help.cheatsheet': lazy(() => import('../widgets/CheatSheetWidget')),
  'insights.show': lazy(() => import('../widgets/InsightsWidget')),
  'briefing.show': lazy(() => import('../widgets/BriefingWidget'))
}

export default function WidgetHost({ widget }) {
  const Widget = WIDGETS[widget.actionId]
  if (!Widget) return null
  return (
    <Suspense fallback={<div style={{ height: 120 }} />}>
      <Widget key={widget.id} params={widget.params} />
    </Suspense>
  )
}
