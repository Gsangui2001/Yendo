const COLORS = {
  green:  'bg-green-100 text-green-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  blue:   'bg-blue-100 text-blue-700',
  red:    'bg-red-100 text-red-700',
  gray:   'bg-gray-100 text-gray-600',
  purple: 'bg-purple-100 text-purple-700',
};

export function Badge({ children, color = 'gray', dot = false, className = '' }) {
  return (
    <span className={['inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full', COLORS[color] ?? COLORS.gray, className].join(' ')}>
      {dot && <span className={['w-1.5 h-1.5 rounded-full', color === 'green' ? 'bg-green-500 animate-pulse' : `bg-${color}-500`].join(' ')} />}
      {children}
    </span>
  );
}
