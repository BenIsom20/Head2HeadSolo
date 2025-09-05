// Lightweight UI primitives without extra dependencies
import React from 'react';

export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

export function Card({ className = '', children, header, actions }) {
  return (
    <section className={cx('bg-slate-900/60 border border-slate-800 rounded-xl shadow', className)}>
      {(header || actions) && (
        <div className="px-6 pt-5 pb-3 border-b border-slate-800 flex items-center justify-between">
          {header ? <h2 className="text-lg font-semibold">{header}</h2> : <div />}
          {actions}
        </div>
      )}
      <div className={cx('p-6', !header && !actions ? '' : '')}>{children}</div>
    </section>
  );
}

export function Button({ variant = 'primary', className = '', children, ...rest }) {
  const base = 'inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition-colors';
  const variants = {
    primary: 'bg-brand-600 hover:bg-brand-500 text-white',
    secondary: 'bg-slate-700 hover:bg-slate-600 text-slate-100',
    subtle: 'bg-transparent text-brand-400 hover:text-brand-300',
    danger: 'bg-rose-600 hover:bg-rose-500 text-white',
    warning: 'bg-amber-600 hover:bg-amber-500 text-white',
    success: 'bg-emerald-600 hover:bg-emerald-500 text-white',
  };
  return (
    <button className={cx(base, variants[variant] || variants.primary, className)} {...rest}>
      {children}
    </button>
  );
}

export function Tabs({ tabs, value, onChange, className = '' }) {
  return (
    <div className={className}>
      <div className="flex gap-1 border-b border-slate-800">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => onChange(t.value)}
            className={cx(
              'px-3 py-2 text-sm rounded-t-md',
              value === t.value
                ? 'bg-slate-800 text-slate-100 border-x border-t border-slate-800'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="pt-4" />
    </div>
  );
}

export function Toast({ kind = 'info', message, onClose }) {
  const colors = {
    info: 'bg-slate-800 text-slate-100 border-slate-700',
    success: 'bg-emerald-700 text-white border-emerald-600',
    error: 'bg-rose-700 text-white border-rose-600',
  };
  return (
    <div className={cx('fixed top-4 right-4 z-50 border rounded-md shadow-lg px-4 py-3', colors[kind])}>
      <div className="flex items-start gap-3">
        <div className="text-sm leading-5">{message}</div>
        <button className="text-sm opacity-80 hover:opacity-100" onClick={onClose}>&times;</button>
      </div>
    </div>
  );
}

export function Skeleton({ className = '' }) {
  return <div className={cx('animate-pulse bg-slate-800/70 rounded-md', className)} />;
}

