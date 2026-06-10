export function Card({ children, className = '', hover = false, onClick }) {
  return (
    <div
      onClick={onClick}
      className={[
        'bg-white rounded-2xl border border-gray-100 shadow-sm p-4',
        hover ? 'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer' : '',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}
