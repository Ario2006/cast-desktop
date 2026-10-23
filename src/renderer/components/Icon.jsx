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
  weather: <path d="M7 18a4 4 0 01-.5-7.97A5.5 5.5 0 0117 9.5a3.5 3.5 0 01.5 6.97V18H7z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ),
  book: (
    <>
      <path d="M4.5 5.5A2 2 0 016.5 3.5H19v15H6.5a2 2 0 00-2 2V5.5z" />
      <path d="M4.5 18.5a2 2 0 012-2H19" />
    </>
  ),
  translate: (
    <path d="M4 6h9M8.5 4v2M6 6c.8 3 3 5.4 6 6.5M11 6c-.8 3.3-3 6-6.5 7.5M12.5 20l4-9 4 9M14 17h5" />
  ),
  power: <path d="M12 3.5v8M7 6.3a7.5 7.5 0 1010 0" />,
  smile: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 14.5c.9 1.2 2.1 1.8 3.5 1.8s2.6-.6 3.5-1.8M9 9.5h.01M15 9.5h.01" />
    </>
  ),
  droplet: <path d="M12 3.5c3 3.6 5.5 6.6 5.5 10a5.5 5.5 0 01-11 0c0-3.4 2.5-6.4 5.5-10z" />,
  phone: (
    <path d="M5 4.5h3l1.5 4-2 1.3a10 10 0 004.7 4.7l1.3-2 4 1.5v3a1.5 1.5 0 01-1.6 1.5A15 15 0 013.5 6.1 1.5 1.5 0 015 4.5z" />
  ),
  bolt: <path d="M13 3L5 13.5h6L10 21l8-10.5h-6L13 3z" />,
  code: <path d="M9 7L4.5 12 9 17M15 7l4.5 5L15 17" />,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />,
  server: (
    <>
      <rect x="4" y="4.5" width="16" height="6.5" rx="2" />
      <rect x="4" y="13" width="16" height="6.5" rx="2" />
      <path d="M7.5 7.75h.01M7.5 16.25h.01" />
    </>
  ),
  terminal: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M7.5 9.5l3 2.5-3 2.5M12.5 15h4" />
    </>
  ),
  chart: <path d="M4.5 19.5h15M7.5 16v-5M12 16V7M16.5 16v-3" />,
  video: (
    <>
      <rect x="3.5" y="6.5" width="12" height="11" rx="2.5" />
      <path d="M15.5 10.5l5-3v9l-5-3" />
    </>
  ),
  layout: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M12 4.5v15" />
    </>
  ),
  inbox: (
    <>
      <path d="M4 13.5l2.5-8h11l2.5 8v5a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 18.5v-5z" />
      <path d="M4 13.5h4.5l1 2h5l1-2H20" />
    </>
  ),
  list: <path d="M9 7h11M9 12h11M9 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01" />,
  help: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.3a2.5 2.5 0 014.8.9c0 1.7-2.4 2.2-2.4 3.6M12 16.8h.01" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  x: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  star: <path d="M12 3.8l2.5 5.1 5.6.8-4 3.9.9 5.6L12 16.6l-5 2.6.9-5.6-4-3.9 5.6-.8L12 3.8z" />,
  undo: <path d="M9 7L4.5 11.5 9 16M5 11.5h8.5a5 5 0 010 10H11" />,
  circle: <circle cx="12" cy="12" r="6.5" />,
  'weather-sun': (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
    </>
  ),
  'weather-partly': (
    <>
      <path d="M8.5 7.5a3.2 3.2 0 11-2.6 5.1M8.5 3.5v1.2M3.5 8.5h1.2M5 5l.9.9" />
      <path d="M9 19h8a3.5 3.5 0 000-7 5 5 0 00-9.6 1.5A2.8 2.8 0 009 19z" />
    </>
  ),
  'weather-cloud': <path d="M7 18.5h10a4 4 0 000-8 5.5 5.5 0 00-10.7 1.4A3.3 3.3 0 007 18.5z" />,
  'weather-fog': <path d="M5 9h11M3.5 13h17M7 17h13M9 5.5h8" />,
  'weather-drizzle': (
    <>
      <path d="M7 14.5h10a3.5 3.5 0 000-7 5 5 0 00-9.6 1.4A3 3 0 007 14.5z" />
      <path d="M9 18l-.6 1.6M13 18l-.6 1.6M17 18l-.6 1.6" />
    </>
  ),
  'weather-rain': (
    <>
      <path d="M7 14h10a3.5 3.5 0 000-7 5 5 0 00-9.6 1.4A3 3 0 007 14z" />
      <path d="M8.5 17l-1 3M12.5 17l-1 3M16.5 17l-1 3" />
    </>
  ),
  'weather-snow': (
    <>
      <path d="M7 14h10a3.5 3.5 0 000-7 5 5 0 00-9.6 1.4A3 3 0 007 14z" />
      <path d="M8.5 18h.01M12.5 19.5h.01M16.5 18h.01" strokeWidth="2.4" />
    </>
  ),
  'weather-storm': (
    <>
      <path d="M7 14h10a3.5 3.5 0 000-7 5 5 0 00-9.6 1.4A3 3 0 007 14z" />
      <path d="M12.5 14.5l-2 3.2h3l-2 3.3" />
    </>
  ),
  'weather-unknown': <path d="M12 4a3 3 0 00-3 3v7.2a4.5 4.5 0 106 0V7a3 3 0 00-3-3zM12 17.5v-6" />,
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

export default function Icon({ name, size = 18, strokeWidth = 1.8, className, fill = 'none' }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
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
