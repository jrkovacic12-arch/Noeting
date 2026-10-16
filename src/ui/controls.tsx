import { Pressable, Text } from 'react-native';
import { useStyles } from './styles';
export function Button({label,onPress,disabled=false,accent=false,danger=false}:{label:string;onPress:()=>void;disabled?:boolean;accent?:boolean;danger?:boolean}){
  const {styles}=useStyles();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled}} disabled={disabled} onPress={onPress}
    style={({pressed})=>[styles.button,accent&&styles.accent,disabled&&styles.disabled,pressed&&styles.pressed]}>
    <Text style={[styles.buttonText,accent&&styles.accentText,danger&&styles.danger]}>{label}</Text>
  </Pressable>;
}
