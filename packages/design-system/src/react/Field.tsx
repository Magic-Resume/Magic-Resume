import type {
  InputHTMLAttributes,
  ReactNode,
  Ref,
  TextareaHTMLAttributes,
} from 'react';
import { cx } from '../cx.js';
import { fieldVariants, type FieldVariantProps } from '../recipes/field.js';

export interface FieldProps extends FieldVariantProps {
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

export function Field({ label, hint, error, children }: FieldProps) {
  return (
    <label className="flex w-full flex-col gap-1.5">
      {label ? (
        <span className="text-mr-label text-mr-ink-secondary">{label}</span>
      ) : null}
      {children}
      {error ? (
        <span role="alert" className="text-mr-label text-mr-danger-muted">
          {error}
        </span>
      ) : hint ? (
        <span className="text-mr-label text-mr-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export interface InputProps
  extends
    Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>,
    FieldVariantProps {
  ref?: Ref<HTMLInputElement>;
}

export function Input({ className, size, invalid, ref, ...props }: InputProps) {
  return (
    <input
      ref={ref}
      className={cx(fieldVariants({ size, invalid }), className)}
      {...props}
    />
  );
}

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement>, FieldVariantProps {
  ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({
  className,
  size,
  invalid,
  ref,
  ...props
}: TextareaProps) {
  return (
    <textarea
      ref={ref}
      className={cx(
        fieldVariants({ size, invalid }),
        'min-h-24 py-2',
        className,
      )}
      {...props}
    />
  );
}
