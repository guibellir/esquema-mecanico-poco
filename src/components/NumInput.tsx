import { inputToNum, numToInput } from '../utils/num';

type Props = {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  step?: string | number;
  placeholder?: string;
  min?: number;
  max?: number;
  className?: string;
};

/** Input numérico que fica vazio ao apagar (não força 0) */
export function NumInput({
  value,
  onChange,
  step = 'any',
  placeholder,
  min,
  max,
  className,
}: Props) {
  return (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      max={max}
      placeholder={placeholder ?? ''}
      className={className}
      value={numToInput(value)}
      onChange={(e) => onChange(inputToNum(e.target.value))}
    />
  );
}
