import {useField} from 'react-f0rm';
import {Input, Textarea} from 'haze-ui';
import type {InputProps} from 'haze-ui';

type ControlledFieldProps = {
  name: string;
  validate?: (value: unknown) => string | undefined | Promise<string | undefined>;
  as?: 'input' | 'textarea';
} & Omit<InputProps, 'value' | 'onChange' | 'onBlur' | 'name' | 'size'>;

export default function ControlledField({
  name,
  validate,
  as = 'input',
  ...rest
}: ControlledFieldProps) {
  const {value, onChange, onBlur} = useField({name, validate});
  if (as === 'textarea') {
    return (
      <Textarea
        {...(rest as any)}
        value={value ?? ''}
        onChange={(e: any) => onChange(e?.target ? e.target.value : e)}
        onBlur={onBlur}
      />
    );
  }
  return (
    <Input
      {...(rest as any)}
      value={value ?? ''}
      onChange={(e: any) => onChange(e?.target ? e.target.value : e)}
      onBlur={onBlur}
    />
  );
}
