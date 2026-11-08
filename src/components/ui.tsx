import React, { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { formatMeters, parseDecimal, roundMm } from '../engine/geometry';

interface NumberFieldProps {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  /** Returns an error message, or null when the value may be committed. */
  validate?: (value: number) => string | null;
  /** Error from outside, e.g. a rule involving several fields. */
  error?: string | null;
  disabled?: boolean;
}

/**
 * Metric input that keeps what was typed. A value is committed on blur or Enter;
 * an invalid value stays in the field with its message and changes nothing.
 */
export function NumberField({
  label,
  value,
  onCommit,
  validate,
  error,
  disabled,
}: NumberFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(formatMeters(value));
  const [fieldError, setFieldError] = useState<string | null>(null);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) {
      setDraft(formatMeters(value));
      setFieldError(null);
    }
  }, [value]);

  const commit = () => {
    const parsed = parseDecimal(draft);
    if (parsed === null) {
      setFieldError('Upiši broj, npr. 2,05.');
      return;
    }
    const rounded = roundMm(parsed);
    const message = validate?.(rounded) ?? null;
    setFieldError(message);
    if (message) return;
    setDraft(formatMeters(rounded));
    if (rounded !== value) onCommit(rounded);
  };

  const shown = fieldError ?? error ?? null;
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input
        id={id}
        className="field tabular-nums"
        inputMode="decimal"
        autoComplete="off"
        value={draft}
        disabled={disabled}
        aria-invalid={shown ? true : undefined}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          setFieldError(null);
        }}
        onBlur={() => {
          focused.current = false;
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
      />
      {shown && (
        <p role="alert" className="mt-1 text-[12px] font-medium text-err">
          {shown}
        </p>
      )}
    </div>
  );
}

export function PanelHeader({
  title,
  onClose,
}: {
  title: string;
  onClose?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-[14px] font-bold">{title}</h2>
      {onClose && (
        <button className="icon-btn" onClick={onClose} aria-label="Zatvori">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export function Dialog({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 no-print"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full ${
          wide ? 'max-w-6xl' : 'max-w-md'
        } bg-paper rounded-lg overflow-hidden flex flex-col max-h-[92vh]`}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line">
          <h2 className="text-[15px] font-bold">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Zatvori">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function useIsCompact(): boolean {
  const query = '(max-width: 767px)';
  const [compact, setCompact] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setCompact(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return compact;
}
