import type { ITheme } from '@xterm/xterm'

/**
 * xterm wants literal colour strings, so the Glass palette is restated here
 * rather than read from CSS variables. src/app/globals.css remains the source
 * of truth — if a token changes there, change its twin below.
 *
 * The extra entries have no token of their own: ESP-IDF emits real ANSI
 * (E( red, W( yellow, I( green) across the full sixteen, and Glass defines no
 * cyan, magenta or bright black. Those are tuned by hand to sit with the rest.
 */
export const terminalTheme: ITheme = Object.freeze({
  background: '#FBFCFE',
  foreground: '#1D1D1F',
  cursor: '#0E6FD8',
  cursorAccent: '#FBFCFE',
  selectionBackground: 'rgba(14,111,216,.18)',

  black: '#1D1D1F',
  red: '#C4342B',
  green: '#248A3D',
  yellow: '#956014',
  blue: '#0E6FD8',
  magenta: '#7A3BC4',
  cyan: '#0A7E8C',
  white: '#6E6E73',

  brightBlack: '#8E8E93',
  brightRed: '#D4453B',
  brightGreen: '#2A9E46',
  brightYellow: '#B45309',
  brightBlue: '#0A5CB5',
  brightMagenta: '#8B4FD4',
  brightCyan: '#0C93A3',
  brightWhite: '#3A3A3C',
})
