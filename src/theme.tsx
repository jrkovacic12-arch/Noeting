import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import { StatusBar } from 'expo-status-bar';

export const palettes = {
  light: {paper:'#F7F7F7',white:'#FFFFFF',ink:'#242424',muted:'#777777',line:'#E9E9E9',accent:'#B77708',accentFill:'#FFCB55',onAccent:'#342500',source:'#F2F2F2',danger:'#B94036',overlay:'#00000055'},
  dark: {paper:'#141414',white:'#212121',ink:'#EFEFEF',muted:'#A3A3A3',line:'#343434',accent:'#F5C45D',accentFill:'#F5C45D',onAccent:'#302100',source:'#2B2B2B',danger:'#FFABA3',overlay:'#00000099'},
};
export type Palette = {[K in keyof typeof palettes.light]:string};
const ThemeContext=createContext<{colors:Palette;dark:boolean}|null>(null);
export function ThemeProvider({children}:{children:ReactNode}) {
  const dark=useColorScheme()==='dark';
  const colors=palettes[dark?'dark':'light'];
  // Follow the system without overwriting legacy saved appearance preferences.
  useEffect(()=>{void SystemUI.setBackgroundColorAsync(colors.paper).catch(()=>undefined);},[colors.paper]);
  return <ThemeContext.Provider value={{colors,dark}}><StatusBar style={dark?'light':'dark'}/>{children}</ThemeContext.Provider>;
}
export function useTheme(){const theme=useContext(ThemeContext);if(!theme)throw new Error('ThemeProvider is required');return theme;}
