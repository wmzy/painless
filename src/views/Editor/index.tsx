import type {Article} from '@/types';

import {useState, useMemo} from 'react';
// react-f0rm ≥0.4：onSubmit / onValidSubmit 都在校验通过后触发且被
// await（isSubmitting 覆盖整个异步提交，finally 复位），二者已无行为
// 差异——统一用 onSubmit。
import {Form, useForm, Field, useIsSubmitting} from 'react-f0rm';
import {Card, Title, Input, Textarea, TagInput, Alert} from 'haze-ui';
import {useRouter, useData} from '@native-router/react';
import {navigate} from '@native-router/core';

import * as http from '@/util/http';
import FieldError from '@/components/FieldError';

// 表单值形状：validate 回调与 handleSubmit 的 values 都由此约束
type EditorValues = {
  title: string;
  description: string;
  body: string;
  tagList: string[];
};

export default function Editor() {
  const router = useRouter();
  const article = useData<Article>() ?? undefined;
  const [error, setError] = useState<string | null>(null);
  // react-f0rm：Field 的 initialValue 只在 render 期写入 values，挂载后
  // Form/useForm 的 setInitialValues effect 会 values.clear() 将其清空
  // （编辑态校验必挂、输入框有值但提交报必填）。正确做法：initialValues
  // 同时传 useForm 与 <Form>（两者 setInitialValues 以引用相等早退，不再清空），
  // 并用 useMemo 稳定引用，避免引用变化触发清空已输入的值。
  const initialValues = useMemo(
    () =>
      article
        ? {
            title: article.title,
            description: article.description,
            body: article.body,
            tagList: article.tagList
          }
        : undefined,
    [article]
  );
  // 类型化表单：EditorValues 经 form prop 流入每个 Field，
  // validate 回调参数即推断为对应字段类型（react-f0rm ≥0.4）
  const form = useForm<EditorValues>({initialValues});
  const isSubmitting = useIsSubmitting(form);

  const handleSubmit = async (values: {title: string; description: string; body: string; tagList: string[]}) => {
    try {
      const payload = {
        article: {
          title: values.title,
          description: values.description,
          body: values.body,
          tagList: values.tagList
        }
      };

      if (article) {
        await http.put(`articles/${article.slug}`, payload);
      } else {
        await http.post('articles', payload);
      }
      void navigate(router, '/');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Card>
      <Title>{article ? 'Edit Article' : 'New Article'}</Title>
      {error && <Alert variant='danger'>{error}</Alert>}
      {/* react-f0rm ≥0.4：onSubmit 被 await，isSubmitting 覆盖整个异步提交 */}
      <Form
        form={form}
        initialValues={initialValues}
        onSubmit={handleSubmit}
        aria-label='Article editor form'
      >
        <Field
          form={form}
          name='title'
          as={Input}
          placeholder='Article Title'
          validate={(v: string) => (!v ? 'Title is required' : undefined)}
        />
        <FieldError name='title' />
        <Field
          form={form}
          name='description'
          as={Input}
          placeholder="What's this article about?"
          validate={(v: string) => (!v ? 'Description is required' : undefined)}
        />
        <FieldError name='description' />
        <Field
          form={form}
          name='body'
          as={Textarea}
          placeholder='Write your article...'
          validate={(v: string) => (!v ? 'Body is required' : undefined)}
        />
        <FieldError name='body' />
        {/* TagInput 的 onChange 直接回传 string[]（非 DOM 事件），
            需 eventToValue 恒等适配，否则默认 e.target.value 解包会抛错 */}
        <Field
          form={form}
          name='tagList'
          as={TagInput}
          placeholder='Add tags'
          eventToValue={(v: string[]) => v}
        />
        <button type='submit' disabled={isSubmitting}>
          {isSubmitting
            ? article
              ? 'Updating...'
              : 'Publishing...'
            : article
              ? 'Update Article'
              : 'Publish Article'}
        </button>
      </Form>
    </Card>
  );
}
