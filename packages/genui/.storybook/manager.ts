import { addons } from 'storybook/manager-api';
import genuiTheme from './theme';

addons.setConfig({
  theme: genuiTheme,
  navSize: 300,
  bottomPanelHeight: 220,
  panelPosition: 'bottom',
  showToolbar: true,
  sidebar: {
    showRoots: true,
  },
});
