const P = {
  timer: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2M9 2h6M12 2v3" />
    </>
  ),
  stopwatch: (
    <>
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 9.5v4l2 1.5M10 2.5h4M12 2.5V6M18.5 6.5l1.5-1.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  screenshot: (
    <>
      <path d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'screenshot-area': (
    <>
      <path
        d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2"
        strokeDasharray="2 2"
      />
      <rect x="8" y="8" width="8" height="8" rx="1" />
    </>
  ),
  'screenshot-window': (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <path d="M3.5 9h17M6.5 7h.01M9 7h.01" />
    </>
  ),
  record: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.5" fill="currentColor" />
    </>
  ),
  stop: <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />,
  note: (
    <>
      <path d="M6 3.5h9l4 4V19a1.5 1.5 0 01-1.5 1.5h-11.5A1.5 1.5 0 014.5 19V5A1.5 1.5 0 016 3.5z" />
      <path d="M14.5 3.5v4.5H19M8 12h8M8 15.5h5" />
    </>
  ),
  'note-search': (
    <>
      <circle cx="10.5" cy="10.5" r="5.5" />
      <path d="M15 15l5 5" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16.5V11a6 6 0 1112 0v5.5l1.5 1.5h-15L6 16.5z" />
      <path d="M10 20.5a2.2 2.2 0 004 0" />
    </>
  ),
  calculator: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2.5" />
      <path d="M8.5 7.5h7M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01" />
    </>
  ),
  convert: (
    <>
      <path d="M5 9h13l-3.5-3.5M19 15H6l3.5 3.5" />
    </>
  ),
  file: (
    <>
      <path d="M6 3.5h8l4.5 4.5V19.5A1.5 1.5 0 0117 21H6a1.5 1.5 0 01-1.5-1.5V5A1.5 1.5 0 016 3.5z" />
      <path d="M14 3.5V8h4.5" />
    </>
  ),
  folder: (
    <path d="M3.5 7A1.5 1.5 0 015 5.5h4l2 2.5h8A1.5 1.5 0 0120.5 9.5V18A1.5 1.5 0 0119 19.5H5A1.5 1.5 0 013.5 18V7z" />
  ),
  app: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M9 15.5l3-7 3 7M10 13.5h4" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5z" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
    </>
  ),
  pomodoro: (
    <>
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 6c0-1.6 1-2.8 2.6-3M9.5 3.6C10.6 4.3 11.5 5 12 6M12 9.5v4l2.5 1.5" />
    </>
  ),
  agenda: (
    <>
      <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
      <path d="M3.5 9.5h17M8 13.5h3M8 16.5h6M8 3v3M16 3v3" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5.5" y="4.5" width="13" height="16" rx="2.5" />
      <path d="M9 4.5V4a1 1 0 011-1h4a1 1 0 011 1v.5M9 10h6M9 13.5h6M9 17h3" />
    </>
  ),
  snippet: <path d="M9 7L4.5 12 9 17M15 7l4.5 5L15 17M13.2 5.5l-2.4 13" />,
  currency: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M14.8 9.2c-.5-.9-1.5-1.4-2.8-1.4-1.6 0-2.8.8-2.8 2 0 2.8 5.8 1.4 5.8 4.2 0 1.2-1.2 2-2.9 2-1.3 0-2.4-.5-2.9-1.5M12 6.5v1.3M12 16.2v1.3" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  warning: (
    <>
      <path d="M12 4l9 16H3L12 4z" />
      <path d="M12 10v4.5M12 17.5h.01" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  trash: (
    <>
      <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12.5h9.4L17.5 7" />
    </>
  )
}

const TONES = {
  timer: 'orange', stopwatch: 'orange', calendar: 'red', screenshot: 'purple', 'screenshot-area': 'purple',
  'screenshot-window': 'purple', record: 'red', stop: 'red', note: 'yellow', 'note-search': 'yellow',
  bell: 'pink', calculator: 'gray', convert: 'gray', file: 'blue', folder: 'blue', app: 'blue',
  globe: 'teal', link: 'teal', search: 'teal'
} // prettier-ignore

export const toneFor = (name) => TONES[name] ?? 'gray'

export default function Icon({ name, size = 18, strokeWidth = 1.8, className }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {P[name] ?? P.search}
    </svg>
  )
}
