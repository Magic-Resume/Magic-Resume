import type { Preview } from '@storybook/react-vite';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import './styles.css';

const i18n = createInstance();
void i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: { en: { translation: {} } },
  interpolation: { escapeValue: false },
  returnNull: false,
});

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'GenUI theme',
      defaultValue: 'dark',
      toolbar: {
        icon: 'paintbrush',
        items: ['dark', 'light'],
      },
    },
  },
  parameters: {
    layout: 'centered',
    controls: {
      expanded: true,
      disableSaveFromUI: true,
    },
    backgrounds: {
      default: 'workbench',
      values: [
        { name: 'workbench', value: 'oklch(0.145 0 0)' },
        { name: 'light', value: 'oklch(0.975 0.004 85)' },
      ],
    },
  },
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme === 'light' ? 'light' : 'dark';
      return (
        <I18nextProvider i18n={i18n}>
          <div className={theme}>
            <div className="genui-story-frame">
              <Story />
            </div>
          </div>
        </I18nextProvider>
      );
    },
  ],
};

export default preview;
