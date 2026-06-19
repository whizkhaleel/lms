import { clsx } from 'clsx';
import Spinner from './spinner';

export default function Button({
  children, variant = 'primary', loading = false,
  className, disabled, ...props
}) {
  const variants = {
    primary:   'btn-primary',
    secondary: 'btn-secondary',
    danger:    'btn-danger',
    ghost:     'btn-ghost',
  };
  return (
    <button
      className={clsx(variants[variant] || 'btn-primary', className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
}