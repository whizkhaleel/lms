import { clsx } from 'clsx';

export default function Spinner({ size = 'md', className }) {
  const s = { sm: 'w-4 h-4 border-2', md: 'w-8 h-8 border-2', lg: 'w-12 h-12 border-4' }[size];
  return (
    <div className={clsx(
      s, 'border-blue-500 border-t-transparent rounded-full animate-spin',
      className
    )} />
  );
}

export function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}