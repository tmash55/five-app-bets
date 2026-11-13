/** The game's own chunky icons: flat fills with a thick ink outline, drawn on a 24 x 24 grid. */

import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { color, size as sizes, type ColorName } from '@/theme/tokens';
import { resolveColor } from './Txt';

export type IconName =
  | 'coin'
  | 'star'
  | 'bolt'
  | 'lock'
  | 'trophy'
  | 'gear'
  | 'back'
  | 'play'
  | 'pause'
  | 'close'
  | 'check'
  | 'ball'
  | 'pack'
  | 'cards'
  | 'swap'
  | 'sound'
  | 'mute'
  | 'music'
  | 'crown'
  | 'flag'
  | 'target'
  | 'gift'
  | 'help'
  | 'plus'
  | 'up'
  | 'home'
  | 'ladder'
  | 'shoe'
  | 'hand'
  | 'shield'
  | 'wand'
  | 'jump';

export interface IconProps {
  name: IconName;
  size?: number;
  /** main fill */
  color?: ColorName | (string & {});
  /** outline, the ink colour by default */
  ink?: ColorName | (string & {});
}

const SW = 2;

export function Icon({ name, size = sizes.icon, color: c = 'white', ink = 'ink' }: IconProps) {
  const f = resolveColor(c);
  const k = resolveColor(ink);
  const o = { stroke: k, strokeWidth: SW, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  const line = { ...o, fill: 'none' };
  let body: React.ReactNode = null;
  switch (name) {
    case 'coin':
      body = (
        <G>
          <Circle cx={12} cy={12} r={10} fill={f} {...o} />
          <Circle cx={12} cy={12} r={6.4} fill="none" stroke={k} strokeWidth={1.4} opacity={0.45} />
          <Path d="M12 7.4l1.4 2.9 3.2.4-2.3 2.2.6 3.2-2.9-1.6-2.9 1.6.6-3.2-2.3-2.2 3.2-.4z" fill={color.white} stroke={k} strokeWidth={1.1} strokeLinejoin="round" />
        </G>
      );
      break;
    case 'star':
      body = <Path d="M12 2.2l2.9 6.1 6.7.9-4.9 4.6 1.2 6.6L12 17.2l-5.9 3.2 1.2-6.6L2.4 9.2l6.7-.9z" fill={f} {...o} />;
      break;
    case 'bolt':
      body = <Path d="M13.6 1.8L4.4 13.4h5.4l-1.6 8.8 9.6-12.2h-5.6z" fill={f} {...o} />;
      break;
    case 'lock':
      body = (
        <G>
          <Path d="M7.4 10.5V7.6a4.6 4.6 0 019.2 0v2.9" {...line} strokeWidth={2.6} />
          <Rect x={4.4} y={10.2} width={15.2} height={11.4} rx={3} fill={f} {...o} />
          <Circle cx={12} cy={15.2} r={1.7} fill={k} />
          <Path d="M12 15.6v2.6" {...line} />
        </G>
      );
      break;
    case 'trophy':
      body = (
        <G>
          <Path d="M6.4 5.2H3.2c0 3.6 1.5 5.6 4.2 6.1M17.6 5.2h3.2c0 3.6-1.5 5.6-4.2 6.1" {...line} />
          <Path d="M6.2 3h11.6v5.2c0 3.6-2.5 6.2-5.8 6.2s-5.8-2.6-5.8-6.2z" fill={f} {...o} />
          <Path d="M12 14.4v3.2" {...line} />
          <Path d="M7.6 21.4c0-2.2 1.9-3.8 4.4-3.8s4.4 1.6 4.4 3.8z" fill={f} {...o} />
        </G>
      );
      break;
    case 'gear':
      body = (
        <G>
          <Path
            d="M10.3 2.2h3.4l.6 2.6 1.9.8 2.3-1.4 2.4 2.4-1.4 2.3.8 1.9 2.6.6v3.4l-2.6.6-.8 1.9 1.4 2.3-2.4 2.4-2.3-1.4-1.9.8-.6 2.6h-3.4l-.6-2.6-1.9-.8-2.3 1.4-2.4-2.4 1.4-2.3-.8-1.9-2.6-.6v-3.4l2.6-.6.8-1.9-1.4-2.3 2.4-2.4 2.3 1.4 1.9-.8z"
            fill={f}
            {...o}
            strokeWidth={1.8}
          />
          <Circle cx={12} cy={12} r={3.2} fill={color.white} {...o} strokeWidth={1.8} />
        </G>
      );
      break;
    case 'back':
      body = <Path d="M14.6 4.4L7 12l7.6 7.6" {...line} stroke={f} strokeWidth={4.2} />;
      break;
    case 'play':
      body = <Path d="M7 3.6v16.8L20.6 12z" fill={f} {...o} />;
      break;
    case 'pause':
      body = (
        <G>
          <Rect x={4.6} y={3.6} width={5.4} height={16.8} rx={1.6} fill={f} {...o} />
          <Rect x={14} y={3.6} width={5.4} height={16.8} rx={1.6} fill={f} {...o} />
        </G>
      );
      break;
    case 'close':
      body = <Path d="M5.4 5.4l13.2 13.2M18.6 5.4L5.4 18.6" {...line} stroke={f} strokeWidth={4.2} />;
      break;
    case 'check':
      body = <Path d="M4.6 12.6l5 5L19.6 6.8" {...line} stroke={f} strokeWidth={4.2} />;
      break;
    case 'ball':
      body = (
        <G>
          <Circle cx={12} cy={12} r={10} fill={f} {...o} />
          <Path d="M2 12h20M12 2v20M5 4.9c3.2 3.6 3.2 10.6 0 14.2M19 4.9c-3.2 3.6-3.2 10.6 0 14.2" {...line} strokeWidth={1.5} />
        </G>
      );
      break;
    case 'pack':
      body = (
        <G>
          <Path d="M5 4.6l1.6-2 1.6 2 1.9-2 1.9 2 1.9-2 1.9 2 1.6-2 1.6 2v14.8l-1.6 2-1.6-2-1.9 2-1.9-2-1.9 2-1.9-2-1.6 2-1.6-2z" fill={f} {...o} />
          <Path d="M12 8.2l1.2 2.5 2.7.3-2 1.9.5 2.7-2.4-1.3-2.4 1.3.5-2.7-2-1.9 2.7-.3z" fill={color.white} stroke={k} strokeWidth={1.2} strokeLinejoin="round" />
        </G>
      );
      break;
    case 'cards':
      body = (
        <G>
          <Rect x={8.6} y={2.6} width={11.4} height={15.6} rx={2.2} fill={color.white} {...o} transform="rotate(10 14 10)" />
          <Rect x={3.6} y={5.4} width={11.4} height={15.6} rx={2.2} fill={f} {...o} transform="rotate(-8 9 13)" />
        </G>
      );
      break;
    case 'swap':
      body = (
        <G>
          <Path d="M4 8.4h14.2M14.4 4.2l4.2 4.2-4.2 4.2" {...line} stroke={f} strokeWidth={3} />
          <Path d="M20 15.8H5.8M9.6 11.6l-4.2 4.2 4.2 4.2" {...line} stroke={f} strokeWidth={3} />
        </G>
      );
      break;
    case 'sound':
      body = (
        <G>
          <Path d="M3 9.2h3.6L12 4.4v15.2l-5.4-4.8H3z" fill={f} {...o} />
          <Path d="M15.4 8.6c1.6 1.8 1.6 5 0 6.8M18.2 5.8c3.2 3.4 3.2 9 0 12.4" {...line} />
        </G>
      );
      break;
    case 'mute':
      body = (
        <G>
          <Path d="M3 9.2h3.6L12 4.4v15.2l-5.4-4.8H3z" fill={f} {...o} />
          <Path d="M15.6 9l5.4 6M21 9l-5.4 6" {...line} />
        </G>
      );
      break;
    case 'music':
      body = (
        <G>
          <Path d="M9 17.4V5.2l10.4-2.4v12.4" {...line} strokeWidth={2.4} />
          <Circle cx={6.4} cy={17.6} r={3} fill={f} {...o} />
          <Circle cx={16.8} cy={15.4} r={3} fill={f} {...o} />
        </G>
      );
      break;
    case 'crown':
      body = <Path d="M3 7.2l4.6 4.2L12 4l4.4 7.4L21 7.2l-1.8 11.6H4.8z" fill={f} {...o} />;
      break;
    case 'flag':
      body = (
        <G>
          <Path d="M5.6 3v18.6" {...line} strokeWidth={2.6} />
          <Path d="M5.6 4.2h12.8l-3 4.2 3 4.2H5.6z" fill={f} {...o} />
        </G>
      );
      break;
    case 'target':
      body = (
        <G>
          <Circle cx={12} cy={12} r={10} fill={color.white} {...o} />
          <Circle cx={12} cy={12} r={6.2} fill={f} {...o} />
          <Circle cx={12} cy={12} r={2.2} fill={color.white} {...o} />
        </G>
      );
      break;
    case 'gift':
      body = (
        <G>
          <Rect x={3.4} y={10.4} width={17.2} height={10.8} rx={2} fill={f} {...o} />
          <Rect x={2.4} y={6.8} width={19.2} height={4.4} rx={1.6} fill={f} {...o} />
          <Path d="M12 6.8v14.4" {...line} />
          <Path d="M12 6.6C10.6 3 7.2 2.4 6.6 4.2 6 6 9 6.8 12 6.6zM12 6.6c1.4-3.6 4.8-4.2 5.4-2.4.6 1.8-2.4 2.6-5.4 2.4z" fill={color.white} {...o} strokeWidth={1.6} />
        </G>
      );
      break;
    case 'help':
      body = (
        <G>
          <Circle cx={12} cy={12} r={10} fill={f} {...o} />
          <Path d="M9 9.4c.2-1.8 1.4-2.8 3.1-2.8 1.8 0 3 1.1 3 2.6 0 2.2-2.9 2.3-2.9 4.6" {...line} strokeWidth={2.2} />
          <Circle cx={12.2} cy={17.2} r={1.3} fill={k} />
        </G>
      );
      break;
    case 'plus':
      body = <Path d="M12 4.6v14.8M4.6 12h14.8" {...line} stroke={f} strokeWidth={4.2} />;
      break;
    case 'up':
      body = <Path d="M12 3l8.4 9.2h-5v8.6H8.6v-8.6h-5z" fill={f} {...o} />;
      break;
    case 'home':
      body = (
        <G>
          <Path d="M2.8 11.6L12 3l9.2 8.6h-2.6v9H5.4v-9z" fill={f} {...o} />
          <Rect x={9.6} y={13.6} width={4.8} height={7} rx={1} fill={color.white} {...o} strokeWidth={1.6} />
        </G>
      );
      break;
    case 'ladder':
      body = (
        <G>
          <Rect x={2.6} y={13.4} width={5.6} height={8} rx={1.2} fill={f} {...o} />
          <Rect x={9.2} y={8.2} width={5.6} height={13.2} rx={1.2} fill={f} {...o} />
          <Rect x={15.8} y={3} width={5.6} height={18.4} rx={1.2} fill={f} {...o} />
        </G>
      );
      break;
    case 'shoe':
      body = <Path d="M2.6 8.4c0-1 .8-1.6 1.8-1.4l3.4.8 3.2 4 7 1.6c2 .5 3.4 1.6 3.4 3.4v1.6H2.6z" fill={f} {...o} />;
      break;
    case 'hand':
      body = <Path d="M7 12.4V6a1.5 1.5 0 013 0v4.4V4.4a1.5 1.5 0 013 0v6V5.6a1.5 1.5 0 013 0v6.2-3a1.5 1.5 0 013 0v6.8c0 4-2.6 6.4-6.4 6.4-3 0-4.6-1.2-6.2-3.6L3.2 14.4c-.8-1.4.8-2.8 2-1.8z" fill={f} {...o} strokeWidth={1.8} />;
      break;
    case 'shield':
      body = <Path d="M12 2.4l8 2.8v6.2c0 5-3.4 8.6-8 10.4-4.6-1.8-8-5.4-8-10.4V5.2z" fill={f} {...o} />;
      break;
    case 'wand':
      body = (
        <G>
          <Path d="M4 20L15.4 8.6" {...line} strokeWidth={3.2} />
          <Path d="M17 2.6l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z" fill={f} {...o} strokeWidth={1.6} />
        </G>
      );
      break;
    case 'jump':
      body = <Path d="M12 2.6l7.2 7.4h-4.4v4H9.2v-4H4.8zM9.2 16.4h5.6v2H9.2zM9.2 20h5.6v1.6H9.2z" fill={f} {...o} strokeWidth={1.8} />;
      break;
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {body}
    </Svg>
  );
}
