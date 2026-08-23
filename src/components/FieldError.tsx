import {css} from '@linaria/core';
import {Text} from 'haze-ui';
import {useFormContext, useError} from 'react-f0rm';

// react-f0rm ≥0.4：useFormContext<Values>() 直接返回类型化的 Form 实例，
// 不再需要借 useForm 返回类型收敛 any。
export default function FieldError({name}: {name: string}) {
  const form = useFormContext<Record<string, unknown>>();
  const error = useError(form, name);
  return error ? <Text className={css`color: red; font-size: 0.875em;`}>{error}</Text> : null;
}
