import { create } from 'storybook/theming';

const genuiTheme = create({
  base: 'dark',
  brandTitle: 'Magic Resume · GenUI',
  brandTarget: '_self',
  fontBase:
    '"Inter Variable", Inter, ui-sans-serif, system-ui, -apple-system, sans-serif',
  fontCode:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  colorPrimary: '#38bdf8',
  colorSecondary: '#38bdf8',
  appBg: '#101010',
  appContentBg: '#0a0a0a',
  appPreviewBg: '#0a0a0a',
  appBorderColor: '#2b2b2b',
  appBorderRadius: 10,
  textColor: '#ededed',
  textInverseColor: '#0a0a0a',
  textMutedColor: '#8a8a8a',
  barTextColor: '#9a9a9a',
  barSelectedColor: '#7dd3fc',
  barHoverColor: '#ededed',
  barBg: '#171717',
  inputBg: '#111111',
  inputBorder: '#343434',
  inputTextColor: '#ededed',
  inputBorderRadius: 8,
  buttonBg: '#171717',
  buttonBorder: '#343434',
  booleanBg: '#2b2b2b',
  booleanSelectedBg: '#38bdf8',
});

export default genuiTheme;
