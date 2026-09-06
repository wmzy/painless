import {useState} from 'react';
import {Form, useForm, useIsSubmitting} from 'react-f0rm';
import {useRouter} from '@native-router/react';
import {navigate, invalidate} from '@native-router/core';
import {
  Alert,
  Button,
  Card,
  FormItem,
  InputCore,
  TextareaCore,
  Title,
  useTitle
} from 'haze-ui';

import {getCurrentUser, logoutAndNavigate, updateUser} from '@/services/auth';
import {required, email, compose, applyApiFieldErrors} from '@/util/validators';

// 表单值形状：validate 回调与 handleSubmit 的 values 都由此约束。
// bio/image 表单侧用空串呈现（User 的 null 归一为 ''，提交时转回 null），
// password 恒为空串初值（省略键 = 不改密码）。
type SettingsValues = {
  image: string;
  username: string;
  bio: string;
  email: string;
  password: string;
};

export default function Settings() {
  useTitle('Settings · Painless');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // 路由守卫（requireLogin）已保证登录态：表单初值从当前用户读取。
  // ?? '' 兜底是诚实防御而非断言——守卫语义由路由表承担，视图对
  // getCurrentUser 的 null 不做页面级处理（守卫重定向已接管该分支）
  const user = getCurrentUser();
  const form = useForm<SettingsValues>({
    initialValues: {
      image: user?.image ?? '',
      username: user?.username ?? '',
      bio: user?.bio ?? '',
      email: user?.email ?? '',
      password: ''
    }
  });
  const isSubmitting = useIsSubmitting(form);

  const handleSubmit = async (values: SettingsValues) => {
    // 新一轮提交即刻撤下上次顶部错误（与其余表单同款）
    setError(null);
    try {
      const updated = await updateUser({
        username: values.username,
        email: values.email,
        // 空串归一为 null（RealWorld 契约 bio/image 必填可 null）：
        // 后端对 null 的语义是「无简介/无头像」，空串头像会渲染破图
        bio: values.bio.trim() === '' ? null : values.bio,
        image: values.image.trim() === '' ? null : values.image,
        // 空串 = 不改密码（省略键：UpdateUser 全字段可选）
        password: values.password === '' ? undefined : values.password
      });
      // 更新成功即账号可见面变化：invalidate 丢 viewStack 旧快照（旧
      // username 的 profile 页/导航条目），随后 navigate 到新档案页。
      // 路径段必须 encodeURIComponent（同 Editor 保存后的跳转）。与
      // Login/Register 提交后清场同款链。被取代/取消的导航 reject NCE
      //（core 1.15）：吞掉即「停在旧视图」语义
      invalidate(router);
      void navigate(
        router,
        `/profile/${encodeURIComponent(updated.username)}`
      ).catch(() => undefined);
    } catch (e: unknown) {
      // 422 字段错误回填到对应字段下方，顶部 Alert 只兜非字段错误
      setError(
        applyApiFieldErrors(form, e, [
          'username',
          'email',
          'password',
          'bio',
          'image'
        ])
      );
    }
  };

  return (
    <Card>
      <Title>Your Settings</Title>
      {error && <Alert variant='danger'>{error}</Alert>}
      {/* 同其余表单：FormItem input 声明式桥接（接线 + aria 链路全由
          FormItem 负责），首条错误渲染为字段下方 <span role='alert'>；
          onSubmit 被 await，isSubmitting 覆盖整个异步提交 */}
      <Form form={form} onSubmit={handleSubmit} aria-label='Settings form'>
        <FormItem
          form={form}
          name='image'
          input={InputCore}
          placeholder='URL of profile picture'
        />
        <FormItem
          form={form}
          name='username'
          validate={required('Username is required')}
          input={InputCore}
          placeholder='Username'
        />
        <FormItem
          form={form}
          name='bio'
          input={TextareaCore}
          placeholder='Short bio about you'
        />
        <FormItem
          form={form}
          name='email'
          validate={compose(
            required('Email is required'),
            email('Invalid email')
          )}
          input={InputCore}
          placeholder='Email'
        />
        {/* 密码字段可空（空 = 不改密码）：不加 required，提交时省略键 */}
        <FormItem
          form={form}
          name='password'
          input={InputCore}
          placeholder='New Password'
        />
        <button type='submit' disabled={isSubmitting}>
          {isSubmitting ? 'Updating...' : 'Update Settings'}
        </button>
      </Form>
      {/* 登出链与 Layout 导航栏收敛为 logoutAndNavigate（services/auth）：
          登出清场 → invalidate 丢旧账号快照 → 回首页 */}
      <Button variant='ghost' onClick={() => logoutAndNavigate(router)}>
        Or click here to logout.
      </Button>
    </Card>
  );
}
