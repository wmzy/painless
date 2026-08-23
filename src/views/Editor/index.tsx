import type {Article} from '@/types';

import {useState, useMemo} from 'react';
// react-f0rm ≥0.4：onSubmit / onValidSubmit 都在校验通过后触发且被
// await（isSubmitting 覆盖整个异步提交，finally 复位），二者已无行为
// 差异——统一用 onSubmit。
import {Form, useForm, useIsSubmitting} from 'react-f0rm';
import {Card, Title, Input, Textarea, TagInput, Alert} from 'haze-ui';
import {FormItem} from 'haze-ui/form';
import {useRouter, useData} from '@native-router/react';
import {navigate} from '@native-router/core';

import * as http from '@/util/http';
import {required, applyApiFieldErrors} from '@/util/validators';

// 表单值形状：validate 回调与 handleSubmit 的 values 都由此约束
type EditorValues = {
  title: string;
  description: string;
  body: string;
  tagList: string[];
};

export default function Editor() {
  const router = useRouter();
  // useData 约定：/editor 无 loader，文章数据可能不存在（新建态），用
  // ?? undefined 收窄为可选；有 loader 保证有值的路由（如 Article）用 !
  const article = useData<Article>() ?? undefined;
  const [error, setError] = useState<string | null>(null);
  // react-f0rm：Field 的 initialValue 只在 render 期写入 values，挂载后
  // Form/useForm 的 setInitialValues effect 会 values.clear() 将其清空
  // （编辑态校验必挂、输入框有值但提交报必填）。正确做法：initialValues
  // 同时传 useForm 与 <Form>（两者 setInitialValues 以引用相等早退，不再清空），
  // 并用 useMemo 稳定引用，避免引用变化触发清空已输入的值。
  // 新建态也给全量空 initialValues（而非 undefined）：FormItem 的 control
  // 桥读取 getValueByPath，字段缺失时 TagInput 会拿到 undefined（其
  // useControl 在 control 有 state 时忽略 seed，[].map 崩溃）。
  const initialValues = useMemo(
    () =>
      article
        ? {
            title: article.title,
            description: article.description,
            body: article.body,
            tagList: article.tagList
          }
        : {title: '', description: '', body: '', tagList: []},
    [article]
  );
  // 类型化表单：EditorValues 经 form prop 流入每个 FormItem，
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
      // 422 字段错误回填到对应字段下方，顶部 Alert 只兜非字段错误
      setError(applyApiFieldErrors(form, e, ['title', 'description', 'body', 'tagList']));
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
        {/* FormItem（haze-ui/form）桥接 react-f0rm 字段与 react-use-control：
            control 直接传给控件的 value prop（受控语义，写入即 setValueByPath），
            id/errorId/invalid 由 FormItem 生成并接好 aria 链路，首条错误由
            FormItem 渲染为字段下方的 <span role='alert'>（取代 FieldError）。
            validate 仍走 react-f0rm 的 useField 通道，与服务端 422 回填
            （applyApiFieldErrors → setError）共用同一 error 槽位 */}
        <FormItem
          form={form}
          name='title'
          validate={required('Title is required')}
        >
          {({id, errorId, invalid, control}) => (
            <Input
              id={id}
              value={control}
              placeholder='Article Title'
              aria-describedby={invalid ? errorId : undefined}
              aria-invalid={invalid}
            />
          )}
        </FormItem>
        <FormItem
          form={form}
          name='description'
          validate={required('Description is required')}
        >
          {({id, errorId, invalid, control}) => (
            <Input
              id={id}
              value={control}
              placeholder="What's this article about?"
              aria-describedby={invalid ? errorId : undefined}
              aria-invalid={invalid}
            />
          )}
        </FormItem>
        <FormItem
          form={form}
          name='body'
          validate={required('Body is required')}
        >
          {({id, errorId, invalid, control}) => (
            <Textarea
              id={id}
              value={control}
              placeholder='Write your article...'
              aria-describedby={invalid ? errorId : undefined}
              aria-invalid={invalid}
            />
          )}
        </FormItem>
        {/* TagInput 的增删改经由 control 写回表单（string[] 直写，不再需要
            Field 时代的 eventToValue 恒等特判——那是给非 DOM onChange 事件的
            解包适配，control 通道没有此问题）。
            注：TagInputProps 不透传 id（根元素是 div，haze-ui 1.7.1 限制），
            FormItem 生成的字段 id 无处可挂；tagList 无前端校验，仅服务端
            422 回填时错误 span 退化为无 aria 关联展示 */}
        <FormItem form={form} name='tagList'>
          {({control}) => (
            <TagInput value={control} placeholder='Add tags' />
          )}
        </FormItem>
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
