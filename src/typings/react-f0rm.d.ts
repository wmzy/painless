declare module 'react-f0rm' {
  import {
    ComponentType,
    ReactNode,
    FormEvent,
    InputHTMLAttributes,
    Ref
  } from 'react';

  export interface FormInstance {
    emitter: any;
    initialValues: any;
    values: Map<string, any>;
    errors: Map<string, string>;
    touched: Set<string>;
    validators: Map<string, any>;
    validating: Set<string>;
    isSubmitting: boolean;
    submitCount: number;
    isSubmitSuccessful: boolean;
  }

  export interface CreateFormOptions {
    initialValues?: any;
    validate?: (values: any) => any;
    revalidateOnChange?: boolean;
  }

  export function createForm(options?: CreateFormOptions): FormInstance;

  export interface FormProps extends Omit<
    React.FormHTMLAttributes<HTMLFormElement>,
    'onSubmit'
  > {
    form?: FormInstance;
    initialValues?: any;
    onSubmit?: (values: any, form: FormInstance) => void;
    onValidSubmit?: (values: any, form: FormInstance) => void;
    onInvalidSubmit?: (errors: any, form: FormInstance) => void;
    children?: ReactNode;
  }

  export function Form(props: FormProps): JSX.Element;

  export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
    name: string;
    as?: ComponentType<any> | string;
    validate?: (value: any) => string | undefined | Promise<string | undefined>;
    eventToValue?: (e: any) => any;
    initialValue?: any;
    asProps?: Record<string, any>;
    ref?: Ref<any>;
  }

  export function Field(props: FieldProps): JSX.Element;

  export interface CheckboxProps extends Omit<FieldProps, 'type'> {
    name: string;
    validate?: (value: any) => string | undefined;
  }

  export function Checkbox(props: CheckboxProps): JSX.Element;

  export function useForm(options?: CreateFormOptions): FormInstance;
  export function useFormContext(): FormInstance;

  export interface UseFieldOptions {
    form?: FormInstance;
    name: string;
    initialValue?: any;
    shouldUnregister?: boolean;
    validate?: (value: any) => string | undefined | Promise<string | undefined>;
    [key: string]: any;
  }

  export function useField(options: UseFieldOptions): {
    value: any;
    error: string | undefined;
    onChange: (...args: any[]) => void;
    onBlur: () => void;
    name: string;
    [key: string]: any;
  };

  export interface UseFieldArrayOptions {
    form?: FormInstance;
    name: string;
  }

  export function useFieldArray(options: UseFieldArrayOptions): {
    fields: Array<{id: string; index: number}>;
    append: (value: any) => void;
    prepend: (value: any) => void;
    insert: (index: number, value: any) => void;
    remove: (index: number) => void;
    swap: (indexA: number, indexB: number) => void;
    move: (from: number, to: number) => void;
  };

  export function useValue(name: string): any;
  export function useTouched(name: string): boolean;
  export function useError(name: string): string | undefined;
  export function useIsDirty(): boolean;
  export function useHasErrors(): boolean;
  export function useIsSubmitting(): boolean;
  export function useSubmitCount(): number;

  export const FormContext: React.Context<FormInstance | null>;
  export const FormProvider: ComponentType<{
    value: FormInstance;
    children: ReactNode;
  }>;
  export const CheckboxGroupContext: React.Context<any>;
  export const CheckboxGroupProvider: ComponentType<{
    value: any;
    children: ReactNode;
  }>;

  export function getValues(form: FormInstance): any;
  export function getValue(form: FormInstance, name: string): any;
  export function setValue(form: FormInstance, name: string, value: any): void;
  export function getError(
    form: FormInstance,
    name: string
  ): string | undefined;
  export function getErrors(form: FormInstance): string[];
  export function getFirstError(form: FormInstance): string | undefined;
  export function setError(
    form: FormInstance,
    name: string,
    error: string
  ): void;
  export function clearErrors(form: FormInstance): void;
  export function setTouched(form: FormInstance, name: string): void;
  export function hasTouched(form: FormInstance, name: string): boolean;
  export function isDirty(form: FormInstance): boolean;
  export function isTouched(form: FormInstance): boolean;
  export function hasErrors(form: FormInstance): boolean;
  export function removeField(form: FormInstance, name: string): void;
  export function setInitialValues(form: FormInstance, values: any): void;
  export function reset(form: FormInstance): void;
  export function trigger(form: FormInstance): Promise<void>;
  export function validate(form: FormInstance): Promise<string | undefined>;
  export function ensureValidate(form: FormInstance): Promise<void>;
  export function setIsSubmitting(form: FormInstance, value: boolean): void;
  export function incrementSubmitCount(form: FormInstance): void;
  export function setSubmitSuccessful(form: FormInstance, value: boolean): void;
}
