import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, View, useColorScheme } from 'react-native';
import Storage from 'expo-sqlite/kv-store';
import * as SystemUI from 'expo-system-ui';
import { StatusBar } from 'expo-status-bar';

export type ThemePreference = 'system' | 'light' | 'dark';
export const palettes = {
  light: {
    paper:'#F6F7F2', ink:'#20312B', muted:'#607067', green:'#28644F', line:'#DCE4DC', white:'#FFFFFF',
    onAccent:'#FFFFFF', accentFill:'#28644F', selected:'#EDF4EE', pinned:'#F2F7F2', checkbox:'#97B39F',
    inputLine:'#AABDB0', sourceLine:'#BBD1C2', source:'#F4F7F1', quote:'#F9F8F3', quoteLine:'#E7E5DE',
    danger:'#923C32', error:'#FFF1ED', overlay:'#10231B66',
  },
  dark: {
    paper:'#121A17', ink:'#E7EEE8', muted:'#A5B6AB', green:'#94D5B5', line:'#35473D', white:'#1C2822',
    onAccent:'#102A1D', accentFill:'#94D5B5', selected:'#2A4034', pinned:'#22372C', checkbox:'#7B9D88',
    inputLine:'#637F6C', sourceLine:'#547C63', source:'#233129', quote:'#2B3027', quoteLine:'#484C3C',
    danger:'#FFB4A8', error:'#442A27', overlay:'#00000099',
  },
};
export type Palette = {[K in keyof typeof palettes.light]: string};
type ThemeState = {
  preference:ThemePreference; dark:boolean; colors:Palette; saving:boolean; error:string|null;
  changeTheme:(preference:ThemePreference)=>Promise<void>;
};
const ThemeContext=createContext<ThemeState|null>(null);
const storageKey='noeting.appearance';

export function ThemeProvider({children}:{children:ReactNode}) {
  const system=useColorScheme();
  const [preference,setPreference]=useState<ThemePreference>('system');
  const [ready,setReady]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const savingLock=useRef(false);
  const dark=preference==='dark'||(preference==='system'&&system==='dark');
  const colors=palettes[dark?'dark':'light'];
  useEffect(()=>{
    let active=true;
    Storage.getItem(storageKey).then(value=>{
      if(active && (value==='light'||value==='dark'||value==='system'))setPreference(value);
    }).catch(()=>{if(active)setError('Could not load your theme. Choose an option to try saving it again.');})
      .finally(()=>{if(active)setReady(true);});
    return ()=>{active=false;};
  },[]);
  useEffect(()=>{
    void SystemUI.setBackgroundColorAsync(colors.paper).catch(()=>undefined);
  },[colors.paper]);
  async function changeTheme(next:ThemePreference) {
    if(savingLock.current)return;
    savingLock.current=true;setSaving(true);setError(null);
    const previous=preference;setPreference(next);
    try {await Storage.setItem(storageKey,next);}
    catch {setPreference(previous);setError('Could not save your theme. Please try again.');}
    finally {savingLock.current=false;setSaving(false);}
  }
  return <ThemeContext.Provider value={{preference,dark,colors,saving,error,changeTheme}}>
    <StatusBar style={dark?'light':'dark'} />
    {ready?children:<View style={{flex:1,backgroundColor:colors.paper,justifyContent:'center'}}><ActivityIndicator accessibilityLabel="Loading appearance" color={colors.green}/></View>}
  </ThemeContext.Provider>;
}
export function useTheme() {
  const theme=useContext(ThemeContext);
  if(!theme)throw new Error('ThemeProvider is required');
  return theme;
}
