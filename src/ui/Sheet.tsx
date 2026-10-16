import { useRef, useState, type ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStyles } from './styles';

export function Sheet({children,label,onDismiss,onBack}:{children:ReactNode;label:string;onDismiss:()=>void;onBack?:()=>void}) {
  const {styles,colors}=useStyles();
  const {height}=useWindowDimensions();
  const insets=useSafeAreaInsets();
  const [expanded,setExpanded]=useState(false);
  const [availableHeight,setAvailableHeight]=useState(height);
  const dismiss=useRef(onDismiss);dismiss.current=onDismiss;
  const pan=useRef(PanResponder.create({
    onMoveShouldSetPanResponder:(_,g)=>Math.abs(g.dy)>12&&Math.abs(g.dy)>Math.abs(g.dx),
    onPanResponderRelease:(_,g)=>{if(g.dy < -30)setExpanded(true);else if(g.dy>60)dismiss.current();},
  })).current;
  function requestDismiss(){if(Keyboard.isVisible()){Keyboard.dismiss();return;}onDismiss();}
  return <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={()=>{if(Keyboard.isVisible())Keyboard.dismiss();else (onBack??onDismiss)();}}>
    <KeyboardAvoidingView onLayout={event=>setAvailableHeight(event.nativeEvent.layout.height)} style={styles.sheetOverlay} behavior={Platform.OS==='ios'?'padding':'height'}>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss task sheet" onPress={requestDismiss} style={styles.backdrop}/>
      <View accessibilityViewIsModal accessibilityLabel={label} testID="task-sheet" style={[styles.sheet,{height:Math.max(120,Math.min(availableHeight-8,height-insets.top-12,height*(expanded?0.94:0.72))),paddingBottom:Math.max(insets.bottom,12)}]}>
        <View {...pan.panHandlers}><Pressable accessibilityRole="button" accessibilityLabel={expanded?'Collapse task sheet':'Expand task sheet'} onPress={()=>setExpanded(value=>!value)} style={styles.handleTarget}>
          <View style={[styles.handle,{backgroundColor:colors.muted}]}/><Text accessible={false} style={styles.sheetLabel}>{label}</Text>
        </Pressable></View>
        {children}
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
