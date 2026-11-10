import { useRef, useState } from 'react';
import { View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { Text } from '../ui/Text';
import { formatAnswer, sliderStep, snapSliderValue } from './answers';
import type { SliderQuestion } from './types';

/** A themed slider with drag, tap-to-jump and screen-reader increment/decrement. */
export function QuizSlider({
  question,
  value,
  onChange,
}: {
  question: SliderQuestion;
  value: number;
  onChange: (value: number) => void;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  // Where the drag started, in track and page coordinates.
  const drag = useRef({ trackX: 0, pageX: 0 });

  const thumb = theme.spacing.lg + theme.spacing.xs;
  const fraction = (value - question.min) / (question.max - question.min);

  const valueAt = (x: number) =>
    width <= 0
      ? value
      : snapSliderValue(question, question.min + (x / width) * (question.max - question.min));
  const onGrant = (event: GestureResponderEvent) => {
    drag.current = { trackX: event.nativeEvent.locationX, pageX: event.nativeEvent.pageX };
    onChange(valueAt(drag.current.trackX));
  };
  const onMove = (event: GestureResponderEvent) => {
    onChange(valueAt(drag.current.trackX + event.nativeEvent.pageX - drag.current.pageX));
  };

  const step = sliderStep(question);
  const display = formatAnswer(question, value);

  return (
    <View style={{ gap: theme.spacing.md }}>
      <Text variant="title" style={{ textAlign: 'center' }}>
        {display}
      </Text>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={question.title}
        accessibilityValue={{ min: question.min, max: question.max, now: value, text: display }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          const delta = event.nativeEvent.actionName === 'increment' ? step : -step;
          onChange(snapSliderValue(question, value + delta));
        }}
        onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
        style={{ height: thumb + theme.spacing.md, justifyContent: 'center' }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={onGrant}
        onResponderMove={onMove}>
        <View
          pointerEvents="none"
          style={{
            height: theme.spacing.sm,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.surface,
          }}>
          <View
            style={{
              width: `${fraction * 100}%`,
              height: '100%',
              borderRadius: theme.radius.pill,
              backgroundColor: theme.colors.primary,
            }}
          />
        </View>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: fraction * width - thumb / 2,
            width: thumb,
            height: thumb,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.background,
            borderWidth: 3,
            borderColor: theme.colors.primary,
          }}
        />
      </View>
      {question.minLabel || question.maxLabel ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="caption" color="textSecondary">
            {question.minLabel ?? ''}
          </Text>
          <Text variant="caption" color="textSecondary">
            {question.maxLabel ?? ''}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
