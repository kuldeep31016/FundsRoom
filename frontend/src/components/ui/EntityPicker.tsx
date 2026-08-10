import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useApiResource, useDebouncedValue } from '../../hooks/useApiResource';
import { Spinner } from './index';

interface EntityPickerProps<T extends { id: string }> {
  label: string;
  /** API path to search, e.g. "/customers". */
  path: string;
  /** Extra query params merged with `search`. */
  params?: Record<string, string | number | undefined>;
  value: T | null;
  onChange: (value: T | null) => void;
  /** Text shown in the input once an option is selected. */
  getLabel: (item: T) => string;
  /** Rich row rendering inside the dropdown. */
  renderOption: (item: T) => ReactNode;
  placeholder?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  emptyMessage?: string;
}

/**
 * Type-ahead picker backed by a **server-side** search endpoint.
 *
 * Deliberately not a plain `<select>` of every record: the list endpoints are
 * paginated, so the dataset can outgrow anything sensible to render at once.
 * Each keystroke (debounced) re-queries the API and shows the top matches.
 */
export function EntityPicker<T extends { id: string }>({
  label,
  path,
  params,
  value,
  onChange,
  getLabel,
  renderOption,
  placeholder = 'Start typing to search…',
  error,
  hint,
  required,
  disabled,
  fullWidth,
  emptyMessage = 'No matches found',
}: EntityPickerProps<T>) {
  const id = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 250);

  const { data, isLoading } = useApiResource<T[]>(isOpen ? path : null, {
    ...params,
    search: debouncedSearch || undefined,
    limit: 8,
  });

  // Close when the user clicks anywhere outside the control.
  useEffect(() => {
    if (!isOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [isOpen]);

  const options = data ?? [];

  return (
    <div className={`field ${fullWidth ? 'field--full' : ''}`} ref={containerRef}>
      <label className="field__label" htmlFor={id}>
        {label}
        {required ? (
          <span className="field__required" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      <div style={{ position: 'relative' }}>
        {value && !isOpen ? (
          <div className="row" style={{ gap: 'var(--space-2)' }}>
            <input
              id={id}
              className={`input ${error ? 'has-error' : ''}`}
              value={getLabel(value)}
              readOnly
              onFocus={() => !disabled && setIsOpen(true)}
              onClick={() => !disabled && setIsOpen(true)}
              disabled={disabled}
              aria-invalid={error ? true : undefined}
            />
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                onChange(null);
                setSearch('');
              }}
              disabled={disabled}
              aria-label={`Clear ${label}`}
            >
              ✕
            </button>
          </div>
        ) : (
          <input
            id={id}
            className={`input ${error ? 'has-error' : ''}`}
            value={search}
            placeholder={placeholder}
            onChange={(event) => {
              setSearch(event.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            disabled={disabled}
            autoComplete="off"
            role="combobox"
            aria-expanded={isOpen}
            aria-controls={`${id}-listbox`}
            aria-invalid={error ? true : undefined}
          />
        )}

        {isOpen ? (
          <div
            id={`${id}-listbox`}
            role="listbox"
            style={{
              position: 'absolute',
              zIndex: 20,
              top: 'calc(100% + 4px)',
              left: 0,
              right: 0,
              maxHeight: 280,
              overflowY: 'auto',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            {isLoading ? (
              <div className="row" style={{ padding: 'var(--space-4)', gap: 'var(--space-3)' }}>
                <Spinner />
                <span className="text-sm text-muted">Searching…</span>
              </div>
            ) : options.length === 0 ? (
              <div className="text-sm text-muted" style={{ padding: 'var(--space-4)' }}>
                {emptyMessage}
              </div>
            ) : (
              options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={value?.id === option.id}
                  className="demo-account"
                  style={{ borderRadius: 0, padding: 'var(--space-2) var(--space-3)' }}
                  onClick={() => {
                    onChange(option);
                    setIsOpen(false);
                    setSearch('');
                  }}
                >
                  {renderOption(option)}
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>

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
