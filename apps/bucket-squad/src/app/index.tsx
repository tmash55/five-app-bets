import { View } from 'react-native';

import { color } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';

export default function Home() {
  return (
    <View style={{ flex: 1, backgroundColor: color.sky, alignItems: 'center', justifyContent: 'center' }}>
      <Txt font="display" size="big" color="white">
        Bucket Squad
      </Txt>
    </View>
  );
}
