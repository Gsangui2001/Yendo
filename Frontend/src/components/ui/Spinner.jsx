export function Spinner({ size = 'md', className = '' }) {
  const sizes = { sm: 'h-4 w-4', md: 'h-8 w-8', lg: 'h-12 w-12' };
  return (
    <div className={['relative', sizes[size] ?? sizes.md, className].join(' ')}>
      <div className="absolute inset-0 rounded-full border-2 border-gray-200" />
      <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-green-500 animate-spin" />
    </div>
  );
}
