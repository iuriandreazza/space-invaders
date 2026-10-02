import { sanitizeInitials } from '../../shared/initials.ts';

interface InitialsInputProps {
  value: string;
  onChange: (initials: string) => void;
  disabled?: boolean;
}

/**
 * Arcade-style entry: exactly three letters or digits, always uppercase. There is no `maxLength` on purpose: the browser
 * would cut a pasted "ab-1x" down to "ab-" before it is cleaned, and the player would get AB instead of AB1.
 */
export function InitialsInput({ value, onChange, disabled }: InitialsInputProps) {
  return (
    <input
      id="initials"
      className="initials"
      value={value}
      onChange={(event) => onChange(sanitizeInitials(event.target.value))}
      placeholder="AAA"
      autoComplete="off"
      autoCapitalize="characters"
      spellCheck={false}
      autoFocus
      disabled={disabled}
    />
  );
}
