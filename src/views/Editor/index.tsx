import type {Article} from '@/types';

import {useState} from 'react';
// react-f0rm ≥0.4：onSubmit / onValidSubmit 都在校验通过后触发且被
// await（isSubmitting 覆盖整个异步提交，finally 复位），二者已无行为
// 差异——统一用 onSubmit。
import {Form, useForm, useIsSubmitting} from 'react-f0rm';
import {Card, Title, Input, Textarea, TagInput, Alert} from 'haze-ui';
import {FormItem} from 'haze-ui/form';
import {useRouter, useData} from '@native-router/react';
import {navigate} from '@native-router/core';
import {useMutation} from 'react-toolroom/async';

import * as articleService from '@/services/article';
import {queryCache} from '@/util/useQuery';
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
  // react-f0rm 0.5.0：setInitialValues 已改为内容比较——引用变化但内容
  // 相同不再 values.clear() 清空 live values，inline 对象即可，无需
  // useMemo 稳定引用；<Form initialValues> 在传入 form prop 时被忽略
  // （组件内部 useForm 的结果被丢弃），单传 useForm({initialValues}) 即
  // 最简形态，旧「双传 + useMemo」hack 作废。
  // 新建态也给全量空 initialValues（而非 undefined）：FormItem 的 control
  // 桥读取 getValueByPath，字段缺失时 TagInput 会拿到 undefined（其
  // useControl 在 control 有 state 时忽略 seed，[].map 崩溃）。
  const form = useForm<EditorValues>({
    initialValues: article
      ? {
          title: article.title,
          description: article.description,
          body: article.body,
          tagList: article.tagList
        }
      : {title: '', description: '', body: '', tagList: []}
  });
  const isSubmitting = useIsSubmitting(form);

  // 发布/编辑 → 声明式失效：提交成功后对共享 queryCache 做 ['home'] /
  // ['article'] 前缀失效（provider 的 deleteWhere）。否则 navigate('/') 后
  // Home / Article 的 loader 在 staleTime 内新鲜命中旧缓存，新发布/编辑
  // 的文章 2 秒内不出现。失败自动不失效。同 Article 视图的 addComment。
  const [save] = useMutation(articleService.saveArticle, {
    invalidates: [[queryCache, 'home'], [queryCache, 'article']]
  });

  const handleSubmit = async (values: {title: string; description: string; body: string; tagList: string[]}) => {
    try {
      // await 保证 isSubmitting 覆盖整个提交 + 失效窗口，invalidates 在
      // mutate 的成功分支里先于本 await 返回执行——navigate 时缓存必已失效
      await save(article?.slug, {
        title: values.title,
        description: values.description,
        body: values.body,
        tagList: values.tagList
      });
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
      <Form form={form} onSubmit={handleSubmit} aria-label='Article editor form'>
        {/* FormItem（haze-ui/form）桥接 react-f0rm 字段与 react-use-control：
            control 直接传给控件的 value prop（受控语义，写入即 setValueByPath），
            id/errorId/invalid 由 FormItem 生成并接好 aria 链路，首条错误由
            FormItem 渲染为字段下方的 <span role='alert'>（取代 FieldError）。
            validate 仍走 react-f0rm 的 useField 通道，与服务端 422 回填
            （applyApiFieldErrors → setServerErrors，type: 'server'）共用
            同一 error 槽位 */}
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
            haze-ui ≥1.8.1：TagInput 把 id/aria-invalid/aria-describedby 转发
            到内部可聚焦 input，字段 aria 链路与其它字段一致接通 */}
        <FormItem form={form} name='tagList'>
          {({id, errorId, invalid, control}) => (
            <TagInput
              id={id}
              value={control}
              placeholder='Add tags'
              aria-invalid={invalid}
              aria-describedby={invalid ? errorId : undefined}
            />
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
