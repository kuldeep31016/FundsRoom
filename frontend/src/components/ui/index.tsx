import {
  useEffect,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import type { BadgeVariant } from '../../lib/format';

/* === Button ============================================================== */

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'md' | 'sm';
  isLoading?: boolean;
  block?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  isLoading = false,
  block = false,
  disabled,
  children,
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    'btn',
    `btn--${variant}`,
    size === 'sm' ? 'btn--sm' : '',
    block ? 'btn--block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type={type} className={classes} disabled={disabled || isLoading} {...rest}>
      {isLoading ? <span className="btn__spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

/* === Badge =============================================================== */

export function Badge({ variant = 'neutral', children }: { variant?: BadgeVariant; children: ReactNode }) {
  return <span className={`badge badge--${variant}`}>{children}</span>;
}

/* === Card ================================================================ */

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function CardHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="card__header">
      <div>
        <h2 className="card__title">{title}</h2>
        {subtitle ? <p className="card__subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="row row--wrap">{actions}</div> : null}
    </header>
  );
}

export function CardBody({ children, flush = false }: { children: ReactNode; flush?: boolean }) {
  return <div className={`card__body ${flush ? 'card__body--flush' : ''}`}>{children}</div>;
}

export function CardFooter({ children }: { children: ReactNode }) {
  return <footer className="card__footer">{children}</footer>;
}

/* === Form fields ========================================================= */

interface FieldWrapperProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  optional?: boolean;
  fullWidth?: boolean;
  children: ReactNode;
}

function FieldWrapper({
  label,
  htmlFor,
  error,
  hint,
  required,
  optional,
  fullWidth,
  children,
}: FieldWrapperProps) {
  return (
    <div className={`field ${fullWidth ? 'field--full' : ''}`}>
      <label className="field__label" htmlFor={htmlFor}>
        {label}
        {required ? (
          <span className="field__required" aria-hidden="true">
            *
          </span>
        ) : null}
        {optional ? <span className="field__optional">optional</span> : null}
      </label>
      {children}
      {error ? (
        <span className="field__error" role="alert">
          <span aria-hidden="true">⚠</span>
          {error}
        </span>
      ) : hint ? (
        <span className="field__hint">{hint}</span>
      ) : null}
    </div>
  );
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  fullWidth?: boolean;
};

export function TextField({
  label,
  error,
  hint,
  optional,
  fullWidth,
  required,
  className = '',
  ...rest
}: TextFieldProps) {
  const id = useId();
  return (
    <FieldWrapper
      label={label}
      htmlFor={id}
      error={error}
      hint={hint}
      required={required}
      optional={optional}
      fullWidth={fullWidth}
    >
      <input
        id={id}
        className={`input ${error ? 'has-error' : ''} ${className}`}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
    </FieldWrapper>
  );
}

type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & {
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  fullWidth?: boolean;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
};

export function SelectField({
  label,
  error,
  hint,
  optional,
  fullWidth,
  required,
  options,
  placeholder,
  className = '',
  ...rest
}: SelectFieldProps) {
  const id = useId();
  return (
    <FieldWrapper
      label={label}
      htmlFor={id}
      error={error}
      hint={hint}
      required={required}
      optional={optional}
      fullWidth={fullWidth}
    >
      <select
        id={id}
        className={`select ${error ? 'has-error' : ''} ${className}`}
        aria-invalid={error ? true : undefined}
        {...rest}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldWrapper>
  );
}

type TextAreaFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & {
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  fullWidth?: boolean;
};

export function TextAreaField({
  label,
  error,
  hint,
  optional,
  fullWidth = true,
  required,
  className = '',
  ...rest
}: TextAreaFieldProps) {
  const id = useId();
  return (
    <FieldWrapper
      label={label}
      htmlFor={id}
      error={error}
      hint={hint}
      required={required}
      optional={optional}
      fullWidth={fullWidth}
    >
      <textarea
        id={id}
        className={`textarea ${error ? 'has-error' : ''} ${className}`}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
    </FieldWrapper>
  );
}

/* === States ============================================================== */

export function Spinner({ large = false }: { large?: boolean }) {
  return <span className={`spinner ${large ? 'spinner--lg' : ''}`} role="status" aria-label="Loading" />;
}

export function LoadingState({ message = 'Loading…' }: { message?: string }) {
  return (
    <div className="state">
      <Spinner large />
      <p className="state__message">{message}</p>
    </div>
  );
}

/** Skeleton rows keep table height stable while the first page loads. */
export function TableSkeleton({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <tbody>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <tr key={rowIndex}>
              {Array.from({ length: columns }).map((__, colIndex) => (
                <td key={colIndex}>
                  <div className="skeleton" style={{ width: `${55 + ((rowIndex + colIndex) % 4) * 12}%` }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyState({
  title,
  message,
  action,
  icon = '∅',
}: {
  title: string;
  message?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="state">
      <div className="state__icon" aria-hidden="true">
        {icon}
      </div>
      <p className="state__title">{title}</p>
      {message ? <p className="state__message">{message}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="state">
      <div className="state__icon state__icon--danger" aria-hidden="true">
        !
      </div>
      <p className="state__title">{title}</p>
      {message ? <p className="state__message">{message}</p> : null}
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function Alert({
  variant = 'info',
  title,
  children,
}: {
  variant?: 'danger' | 'warning' | 'info';
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className={`alert alert--${variant}`} role={variant === 'danger' ? 'alert' : 'status'}>
      <div>
        {title ? <div className="alert__title">{title}</div> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}

/* === Pagination ========================================================== */

export function Pagination({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
  isLoading = false,
}: {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
}) {
  if (total === 0) return null;

  const first = (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);

  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="pagination__info">
        Showing <strong>{first}</strong>–<strong>{last}</strong> of <strong>{total}</strong>
      </span>
      <div className="pagination__controls">
        <Button
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1 || isLoading}
          aria-label="Previous page"
        >
          ← Previous
        </Button>
        <span className="pagination__page">
          Page {page} of {Math.max(totalPages, 1)}
        </span>
        <Button
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages || isLoading}
          aria-label="Next page"
        >
          Next →
        </Button>
      </div>
    </nav>
  );
}

/* === Modal / confirmation ================================================ */

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  // Escape closes the dialog, and background scrolling is locked while open.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal__header">
          <h2 className="modal__title">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close dialog">
            ✕
          </Button>
        </header>
        <div className="modal__body">{children}</div>
        {footer ? <footer className="modal__footer">{footer}</footer> : null}
      </div>
    </div>
  );
}

/** Confirmation gate for important or irreversible actions. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  isSubmitting = false,
  onConfirm,
  onCancel,
  children,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'primary' | 'danger';
  isSubmitting?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  return (
    <Modal
      title={title}
      onClose={isSubmitting ? () => undefined : onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={onConfirm} isLoading={isSubmitting}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="stack stack--sm">
        <div>{message}</div>
        {children}
      </div>
    </Modal>
  );
}

/* === Page header ========================================================= */

export function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumbs,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        {breadcrumbs ? <div className="breadcrumbs">{breadcrumbs}</div> : null}
        <h1 className="page-header__title">{title}</h1>
        {subtitle ? <p className="page-header__subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </div>
  );
}

/* === Detail list ========================================================= */

export function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  const isEmpty = children === null || children === undefined || children === '';
  return (
    <div className="detail">
      <div className="detail__label">{label}</div>
      <div className={`detail__value ${isEmpty ? 'detail__value--empty' : ''}`}>
        {isEmpty ? '—' : children}
      </div>
    </div>
  );
}

/* === Stat tile =========================================================== */

export function Stat({
  label,
  value,
  meta,
}: {
  label: string;
  value: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="stat">
      <div className="stat__label">{label}</div>
      <div className="stat__value">{value}</div>
      {meta ? <div className="stat__meta">{meta}</div> : null}
    </div>
  );
}

/* === Search input ======================================================== */

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  'aria-label': ariaLabel = 'Search',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  'aria-label'?: string;
}) {
  return (
    <div className="toolbar__search">
      <span className="toolbar__search-icon" aria-hidden="true">
        ⌕
      </span>
      <input
        type="search"
        className="input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
      />
    </div>
  );
}
