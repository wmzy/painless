import {useState, useEffect} from 'react';
// react-f0rm ≥0.4：onSubmit / onValidSubmit 都在校验通过后触发且被
// await（isSubmitting 覆盖整个异步提交，finally 复位），二者已无行为
// 差异——统一用 onSubmit。
// 未保存拦截批：isDirty(form) 是同步谓词（live values 对 initialValues
// 的逐字段比较）；reset(form) 全量复位（values/errors/touched 清空，
// 回落 initialValues，dirty 归零）——拦截判定与「确认放弃」都建立在
// 这两个同步 API 上。
import {Form, useForm, useIsSubmitting, isDirty, reset, setInitialValues} from 'react-f0rm';
import {Card, Title, Input, Textarea, TagInput, Alert, ConfirmDialog, FormItem} from 'haze-ui';
import {useRouter, useBlocker} from '@native-router/react';
import {navigate} from '@native-router/core';
import {useMutation} from 'react-toolroom/async';

import * as articleService from '@/services/article';
import {useEditorData} from '@/services/dataloaders';
import {articleCache, homeCache} from '@/util/useQuery';
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
  // useEditorData（createDataLoader 第二元素，optional 形态）：/editor
  //（新建）无 loader、/editor/:slug（编辑）挂 editorLoader——共用本组件，
  // 文章可能不存在。optional 语义由工厂类型收拢（返回 Article |
  // undefined），原 useData<Article>() ?? undefined 的泛型手工标注消失；
  // DEV 下 route.data === editorLoader 或 === undefined 均合法，失配
  // throw（见 src/util/dataLoader.ts）
  const article = useEditorData({optional: true});
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

  // —— 未保存离开拦截（三类通道）——
  // ① in-app 导航（TypedLink / navigate）：useBlocker 的同步谓词
  //    （@native-router/react ≥1.7 的返回值是 {state, proceed, reset}），
  //    契约是「返回 false 否决并挂起为待决询问（state 非 null，携带
  //    目标 location 与来源 from），true 放行」——谓词即 !isDirty，
  //    确认框直接由 state 驱动，不再手搓「待跳转目标 ref + open 态
  //    state」一对镜像。
  // ② 浏览器回退/前进（POP）：同由 useBlocker 覆盖——被否决的 POP 由
  //    库自动反向 go() 回推，URL 停留在当前页，确认框照常弹出；此时
  //    proceed() 以一次新 push 重放目标，而非重跑历史遍历。
  // ③ 刷新/关闭的整页卸载：路由器拦不住（导航栏已 NavLink as 组合
  //    SPA 化，点导航链接走 ①；裸 <a> 整页跳转的入口已不存在），由
  //    下方 beforeunload 兜底——浏览器原生确认框，无法自定义 UI。
  const blocker = useBlocker(() => !isDirty(form));

  // 确认离开：reset 回落 initialValues（values/errors/touched 全清，
  // dirty 清零）后 proceed 重放被否决的导航。reset 的第二参不能省——
  // 省略时 form.initialValues 会被置 undefined，getValueByPath 拿不到
  // 兜底值，TagInput 会对 undefined 取 .length 崩溃；显式回传原
  // initialValues（react-f0rm Devtools 同款调用）。proceed 自带一次性
  // bypass（只绕过本 blocker，其它 blocker/守卫照常询问），reset 表单
  // 是「放弃修改」的语义本体，也让 beforeunload 谓词同步归零。
  const handleConfirmLeave = () => {
    reset(form, form.initialValues);
    blocker.proceed();
  };

  // 通道③：整页卸载（刷新/关闭）的原生兜底。dirty 时
  // preventDefault + returnValue 触发浏览器自带「离开站点？」确认。
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty(form)) return;
      e.preventDefault();
      // returnValue 是 legacy API（TS 标记 deprecated），但部分浏览器
      // （尤其旧 Chromium/Firefox）不认 preventDefault 只认它，双写是
      // beforeunload 的标准跨浏览器做法。
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [form]);

  // 发布/编辑 → 声明式失效：提交成功后整实体失效 homeCache / articleCache
  // （0.9 起每实体一 cache，前缀即全部条目）。否则 navigate('/') 后
  // Home / Article 的 loader 在 staleTime 内新鲜命中旧缓存，新发布/编辑
  // 的文章 2 秒内不出现。失败自动不失效。同 Article 视图的 addComment。
  const [save] = useMutation(articleService.saveArticle, {
    invalidates: [homeCache, articleCache]
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
      // 保存成功：刚提交的值即「已保存态」，以之为新 initialValues 把
      // 表单拉回干净——否则随后的 navigate('/') 会被未离开保存拦截
      // 否决（live values 仍与旧 initialValues 不同，isDirty 仍真）
      setInitialValues(form, values);
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
        {/* FormItem（haze-ui）桥接 react-f0rm 字段与 react-use-control：
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
      {/* 条件挂载 + open：ConfirmDialog 的 open 传布尔时是非受控语义
          （仅作初值），由 blocker.state（待决询问非 null）控制挂载/卸载；
          overlay 点击（onClose）与取消同义——留在页面（reset 丢弃待决
          导航，无任何重放） */}
      {blocker.state && (
        <ConfirmDialog
          open
          title='Unsaved changes'
          confirmText='Leave'
          cancelText='Stay'
          onConfirm={handleConfirmLeave}
          onCancel={() => blocker.reset()}
          onClose={() => blocker.reset()}
        >
          You have unsaved changes. Leave the page and discard them?
        </ConfirmDialog>
      )}
    </Card>
  );
}
