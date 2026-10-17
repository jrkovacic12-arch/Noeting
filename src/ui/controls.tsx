import { Image, Pressable, Text, View } from 'react-native';
import { useStyles } from './styles';
export function Button({label,onPress,disabled=false,accent=false,danger=false,quiet=false}:{label:string;onPress:()=>void;disabled?:boolean;accent?:boolean;danger?:boolean;quiet?:boolean}) {
  const {styles}=useStyles();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled}} disabled={disabled} onPress={onPress}
    style={({pressed})=>[styles.button,quiet&&styles.quietButton,accent&&styles.accent,disabled&&styles.disabled,pressed&&styles.pressed]}>
    <Text style={[styles.buttonText,accent&&styles.accentText,danger&&styles.danger]}>{label}</Text>
  </Pressable>;
}
export function IconButton({name,label,onPress,disabled=false}:{name:'back'|'edit'|'link'|'more'|'close'|'folder'|'trash';label:string;onPress:()=>void;disabled?:boolean}) {
  const {styles,colors}=useStyles();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} accessibilityState={{disabled}} onPress={onPress}
    style={({pressed})=>[styles.iconButton,disabled&&styles.disabled,pressed&&styles.pressed]}>
    {name==='folder'?<View accessible={false} style={{width:24,height:23}}>
      <View style={{position:'absolute',top:3,left:1,width:11,height:7,borderWidth:1.6,borderColor:colors.ink,borderTopLeftRadius:3,borderTopRightRadius:3}}/>
      <View style={{position:'absolute',left:1,top:7,width:23,height:15,borderWidth:1.6,borderColor:colors.ink,borderRadius:3,backgroundColor:colors.paper}}/>
    </View>:name==='trash'?<View accessible={false} style={{width:24,height:24}}>
      <View style={{position:'absolute',top:2,left:8,width:8,height:4,borderWidth:1.6,borderColor:colors.ink,borderTopLeftRadius:2,borderTopRightRadius:2}}/>
      <View style={{position:'absolute',top:6,left:3,width:18,borderTopWidth:1.6,borderColor:colors.ink}}/>
      <View style={{position:'absolute',top:6,left:5,width:14,height:16,borderWidth:1.6,borderColor:colors.ink,borderBottomLeftRadius:3,borderBottomRightRadius:3}}/>
    </View>:name==='link'?<View accessible={false} style={{width:24,height:24}}>
      <View style={{position:'absolute',left:2,top:11,width:14,height:8,borderWidth:1.6,borderColor:colors.ink,borderRadius:5,transform:[{rotate:'-45deg'}]}}/>
      <View style={{position:'absolute',left:9,top:4,width:14,height:8,borderWidth:1.6,borderColor:colors.ink,borderRadius:5,transform:[{rotate:'-45deg'}]}}/>
    </View>:name==='edit'?<Image accessible={false} source={require('../../assets/icons/edit.png')} style={{width:21,height:21,tintColor:colors.ink}}/>:
      <Text accessible={false} style={styles.iconGlyph}>{name==='back'?'‹':name==='close'?'×':'⋯'}</Text>}
  </Pressable>;
}
export function Check({checked,label,onPress,disabled=false}:{checked:boolean;label:string;onPress:()=>void;disabled?:boolean}) {
  const {styles}=useStyles();
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} aria-checked={checked} accessibilityState={{checked,disabled}} disabled={disabled} onPress={onPress} style={styles.checkTarget}>
    <View style={[styles.checkbox,checked&&styles.checked]}><Text accessible={false} style={styles.tick}>{checked?'✓':''}</Text></View>
  </Pressable>;
}
