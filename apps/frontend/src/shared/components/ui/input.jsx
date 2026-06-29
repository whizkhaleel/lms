import { forwardRef, useState, useRef, useEffect, useCallback } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { clsx } from 'clsx';

const Input = forwardRef(({ label, error, className, ...props }, ref) => (
  <div className="flex flex-col gap-1.5">
    {label && (
      <label className="text-sm font-medium text-gray-300">{label}</label>
    )}
    <input
      ref={ref}
      className={clsx('input', error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20', className)}
      {...props}
    />
    {error && <p className="text-xs text-red-400">{error}</p>}
  </div>
));
Input.displayName = 'Input';
export default Input;

export const PasswordInput = forwardRef(({ label, error, className, ...props }, ref) => {
  const [show, setShow] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-medium text-gray-300">{label}</label>
      )}
      <div className="relative">
        <input
          ref={ref}
          type={show ? 'text' : 'password'}
          className={clsx('input w-full pr-10', error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20', className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
          tabIndex={-1}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
});

export function Textarea({ label, error, className, ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-medium text-gray-300">{label}</label>}
      <textarea
        className={clsx('input resize-none', error && 'border-red-500', className)}
        {...props}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

export function Select({ label, error, children, className, ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-medium text-gray-300">{label}</label>}
      <select
        className={clsx('input', error && 'border-red-500', className)}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}