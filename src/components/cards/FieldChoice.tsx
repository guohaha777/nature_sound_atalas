export function FieldChoice({ label, value, options, onChange }: { label: string; value: string; options: readonly { value: string; label: string }[]; onChange: (value: string) => void }) {
  return (
    <fieldset className="field-choice">
      <legend>{label}</legend>
      <div>
        {options.map((option) => (
          <button type="button" key={option.value} className={option.value === value ? "is-selected" : ""} onClick={() => onChange(option.value)} aria-pressed={option.value === value}>
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

