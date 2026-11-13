/** One line of display lettering that fits the width it is given, for names that come from data (teams and players of any pack). */

import { useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { text, type ColorName } from '@/theme/tokens';
import { fitName, fitSize } from './fitName';
import { Txt } from './Txt';

export function FitLine({
  children,
  size = 'body',
  color,
  person,
  style,
}: {
  children: string;
  size?: keyof typeof text;
  color?: ColorName | (string & {});
  /** a player: shortened to "Wren K." (or the short name given here) when shrinking is not enough; other lines only shrink */
  person?: { short?: string };
  style?: StyleProp<ViewStyle>;
}) {
  // the width only becomes known once laid out; until then the line is drawn at full size
  const [room, setRoom] = useState(0);
  const px = text[size];
  const fit = room <= 0 ? { text: children, px } : person ? fitName(children, px, room, person.short) : { text: children, px: fitSize(children, px, room) };
  return (
    <View style={style} onLayout={(e) => setRoom(e.nativeEvent.layout.width)}>
      <Txt font="display" size={size} color={color} lines={1} style={{ fontSize: fit.px }}>
        {fit.text}
      </Txt>
    </View>
  );
}
