// IDEA Darcula 配色（ARCHITECTURE.md §5）
import type { ThemeRegistration } from 'shiki';

export const ideaDarcula: ThemeRegistration = {
  name: 'idea-darcula',
  type: 'dark',
  colors: {
    'editor.background': '#2B2B2B',
    'editor.foreground': '#A9B7C6',
  },
  tokenColors: [
    { scope: ['keyword', 'storage'], settings: { foreground: '#CC7832' } },
    { scope: ['string'], settings: { foreground: '#6A8759' } },
    { scope: ['constant.numeric'], settings: { foreground: '#6897BB' } },
    { scope: ['comment'], settings: { foreground: '#808080', fontStyle: 'italic' } },
    { scope: ['entity.name.function', 'support.function'], settings: { foreground: '#FFC66D' } },
    { scope: ['variable.other.constant', 'constant.language'], settings: { foreground: '#9876AA' } },
    { scope: ['entity.name.type', 'support.type'], settings: { foreground: '#A9B7C6' } },
    { scope: ['annotation', 'storage.type.annotation'], settings: { foreground: '#BBB529' } },
    // HTML / XML / JSX / Vue（IDEA Darcula：标签琥珀色，属性名亮灰，属性值/字符串绿）
    { scope: ['tag', 'entity.name.tag', 'meta.tag', 'punctuation.definition.tag'], settings: { foreground: '#E8BF6A' } },
    { scope: ['entity.other.attribute-name', 'attribute.name', 'support.constant.attribute-name'], settings: { foreground: '#A9B7C6' } },
    { scope: ['punctuation.definition.tag.html', 'punctuation.definition.tag.xml', 'punctuation.definition.tag.begin', 'punctuation.definition.tag.end'], settings: { foreground: '#808080' } },
    { scope: ['text.html', 'text.xml'], settings: { foreground: '#A9B7C6' } },
    // CSS 子选择器 `>` 用中性色，与 `<` 保持一致（避免 `<` 亮灰、`>` 橙色的视觉不一致）
    { scope: ['keyword.operator.combinator.css', 'keyword.operator.combinator'], settings: { foreground: '#A9B7C6' } },
  ],
};
