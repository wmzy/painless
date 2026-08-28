// haze-ui 1.11 per-component CSS 按需接入（取代全量 'haze-ui/styles.css'）：
// 全量 90KB（12.2KB gz）无条件进首屏；按子路径只带本模板实际用到的组件。
// tokens.css 恒定先行——主题（lightTheme/darkTheme 换肤的 --haze-* 变量）、
// spacing、排版基线都在其中，其余组件 css 只含各自 .haze-* 规则。
//
// 新用 haze-ui 组件时在此追加一条（dist/css/<组件 kebab-case>.css，如
// OTPInput → otp-input.css）。同目录家族共享一个文件：ListItem 并入
// list、TagGroupItem 并入 tag-group、NavLink 并入 navigation-bar、
// Title/Text 并入 typography、ToastContainer/useToast 并入 toast、
// FormItem 并入 form。haze-ui 无全局 reset（无 body/html/* 规则），
// 不存在漏引基础样式的风险。
import 'haze-ui/css/tokens.css';
import 'haze-ui/css/alert.css';
import 'haze-ui/css/avatar.css';
import 'haze-ui/css/badge.css';
import 'haze-ui/css/button.css';
import 'haze-ui/css/card.css';
import 'haze-ui/css/chip.css';
import 'haze-ui/css/confirm-dialog.css';
import 'haze-ui/css/container.css';
import 'haze-ui/css/divider.css';
import 'haze-ui/css/flex.css';
import 'haze-ui/css/form.css';
import 'haze-ui/css/input.css';
import 'haze-ui/css/list.css';
import 'haze-ui/css/navigation-bar.css';
import 'haze-ui/css/skeleton.css';
import 'haze-ui/css/spinner.css';
import 'haze-ui/css/switch.css';
import 'haze-ui/css/tag-group.css';
import 'haze-ui/css/tag-input.css';
import 'haze-ui/css/textarea.css';
import 'haze-ui/css/toast.css';
import 'haze-ui/css/typography.css';
