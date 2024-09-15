import { createVuetify } from 'vuetify'
import colors from 'vuetify/lib/util/colors'
import { aliases, mdi } from 'vuetify/lib/iconsets/mdi'
import * as components from 'vuetify/lib/components'
import * as directives from 'vuetify/lib/directives'

// Definition des hellen Themas
const lightTheme = {
  dark: false,
  colors: {
    primary: colors.green.darken3,
    secondary: colors.orange.lighten2,
    accent: colors.blueGrey.darken2,
    error: colors.red.accent3,
    info: colors.cyan.darken1,
    success: colors.green.accent4,
    warning: colors.amber.base,
    background: colors.green.lighten4,
    dialogbackground: colors.green.darken2,
    onBackground: colors.grey.darken4,
  }
};

// Definition des dunklen Themas
const darkTheme = {
  dark: true,
  colors: {
    primary: colors.amber.accent4,
    secondary: colors.deepOrange.accent1,
    accent: colors.blueGrey.darken2,
    error: colors.red.accent2,
    info: colors.cyan.lighten3,
    success: colors.lightGreen.darken1,
    warning: colors.amber.darken3,
    background: colors.blueGrey.darken4,
    dialogbackground: colors.green.darken2,
    onBackground: colors.grey.lighten1,
  }
};

// Definition der Schriftgrößen für verschiedene Textstile und Bildschirmgrößen
const typography = {
  h1: { fontSize: '2rem', '@media (min-width: 960px)': { fontSize: '2.5rem' } },
  h2: { fontSize: '1.5rem', '@media (min-width: 960px)': { fontSize: '2rem' } },
  h3: { fontSize: '1.25rem', '@media (min-width: 960px)': { fontSize: '1.5rem' } },
  h4: { fontSize: '1rem', '@media (min-width: 960px)': { fontSize: '1.25rem' } },
  h5: { fontSize: '0.875rem', '@media (min-width: 960px)': { fontSize: '1rem' } },
  h6: { fontSize: '0.75rem', '@media (min-width: 960px)': { fontSize: '0.875rem' } },
  subtitle1: { fontSize: '1rem', '@media (min-width: 960px)': { fontSize: '1.125rem' } },
  subtitle2: { fontSize: '0.875rem', '@media (min-width: 960px)': { fontSize: '1rem' } },
  body1: { fontSize: '1rem', '@media (min-width: 960px)': { fontSize: '1rem' } },
  body2: { fontSize: '0.875rem', '@media (min-width: 960px)': { fontSize: '0.875rem' } },
  button: { fontSize: '0.875rem', '@media (min-width: 960px)': { fontSize: '1rem' } },
  caption: { fontSize: '0.75rem', '@media (min-width: 960px)': { fontSize: '0.75rem' } },
  overline: { fontSize: '0.625rem', '@media (min-width: 960px)': { fontSize: '0.625rem' } },
}

// Definition der globalen Styles
const setGlobalStyles = () => {
  const style = document.createElement('style');
  style.type = 'text/css';
  style.innerHTML = `
    .v-input__slot:hover,
    .v-input__slot:focus-within,
    .v-list-item:hover {
      background-color: ${darkTheme.colors.onBackground} !important;
      color: ${darkTheme.colors.background} !important;
    }
    .v-input__slot:hover .v-select__selection,
    .v-input__slot:focus-within .v-select__selection,
    .v-list-item:hover {
      color: ${darkTheme.colors.background} !important;
    }
  `;
  document.getElementsByTagName('head')[0].appendChild(style);
};

// Aufruf der Funktion, um die globalen Styles zu setzen
setGlobalStyles();

// Definition der Rasterkonfiguration
const grid = {
  xs: 2,
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
};

// Definition der Breakpoint-Werte
const breakpoints = {
  values: {
    xs: 0,
    sm: 600,
    md: 960,
    lg: 1280,
    xl: 1920,
  },
};

// Definition der standardmäßigen Abstände
const spacing = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
};

// Erstellung und Export der Vuetify-Instanz
export default createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'light',
    themes: {
      light: lightTheme,
      dark: darkTheme,
    },
  },
  typography,
  grid,
  breakpoints,
  spacing,
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: {
      mdi,
    },
  },
});
