// Obsidian 默认代码块配色（与 VS Code Dark+ 一致，Obsidian 不装主题时的默认风格）
import type { ThemeRegistration } from 'shiki';

export const obsidian: ThemeRegistration = {
  name: 'obsidian',
  type: 'dark',
  colors: {
    'editor.background': '#1e1e1e',
    'editor.foreground': '#d4d4d4',
  },
  tokenColors: [
    // 关键字（import, from, class, def 等）：蓝色
    { scope: ['keyword', 'storage', 'storage.type'], settings: { foreground: '#569cd6' } },
    // 控制流关键字（return, if, else, for, while）：紫色
    { scope: ['keyword.control'], settings: { foreground: '#c586c0' } },
    // 字符串：橙棕色
    { scope: ['string', 'string.quoted'], settings: { foreground: '#ce9178' } },
    // 数字：浅绿
    { scope: ['constant.numeric'], settings: { foreground: '#b5cea8' } },
    // 注释：绿色
    { scope: ['comment'], settings: { foreground: '#6a9955', fontStyle: 'italic' } },
    // 函数名：黄色
    { scope: ['entity.name.function', 'support.function'], settings: { foreground: '#dcdcaa' } },
    // 变量：浅蓝
    { scope: ['variable', 'support.variable', 'variable.other'], settings: { foreground: '#9cdcfe' } },
    // 常量（true/false/null/None）：蓝色
    { scope: ['constant.language', 'constant'], settings: { foreground: '#569cd6' } },
    // 类型名/类名：青绿
    { scope: ['entity.name.type', 'support.type', 'support.class', 'entity.name.class', 'entity.name.namespace'], settings: { foreground: '#4ec9b0' } },
    // 注解/装饰器：黄色
    { scope: ['annotation', 'storage.type.annotation', 'meta.annotation'], settings: { foreground: '#dcdcaa' } },
    // HTML / XML / JSX / Vue 标签名：蓝色
    { scope: ['tag', 'entity.name.tag', 'meta.tag'], settings: { foreground: '#569cd6' } },
    // HTML 属性名：浅蓝
    { scope: ['entity.other.attribute-name', 'attribute.name', 'support.constant.attribute-name'], settings: { foreground: '#9cdcfe' } },
    // HTML 标点（< > /> ）：灰色
    { scope: ['punctuation.definition.tag', 'punctuation.definition.tag.html', 'punctuation.definition.tag.xml', 'punctuation.definition.tag.begin', 'punctuation.definition.tag.end'], settings: { foreground: '#808080' } },
    // HTML 文本内容
    { scope: ['text.html', 'text.xml'], settings: { foreground: '#d4d4d4' } },
    // 操作符与标点
    { scope: ['keyword.operator', 'keyword.operator.combinator.css', 'keyword.operator.combinator', 'punctuation'], settings: { foreground: '#d4d4d4' } },
    // 正则表达式
    { scope: ['string.regexp'], settings: { foreground: '#d16969' } },
    // 属性值字符串
    { scope: ['string.interpolated', 'string.template'], settings: { foreground: '#ce9178' } },
  ],
};
