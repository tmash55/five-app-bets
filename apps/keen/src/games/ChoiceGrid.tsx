import { Text, useTheme, type TypographyVariant } from '@five/shell';
import { useRef } from 'react';
import { Pressable, View } from 'react-native';

type Props<T> = {
  choices: readonly T[];
  /** Text on the button. Also its accessibility label unless `labelFor` is set. */
  textFor: (choice: T) => string;
  labelFor?: (choice: T) => string;
  onPick: (choice: T) => void;
  /** Buttons per row. */
  columns?: number;
  variant?: TypographyVariant;
};

/**
 * Big answer buttons in rows. Takes one pick per question: the board is
 * remounted for each new question, so the guard resets with it.
 */
export function ChoiceGrid<T>({ choices, textFor, labelFor, onPick, columns = 2, variant = 'title' }: Props<T>) {
  const theme = useTheme();
  const picked = useRef(false);
  const rows: T[][] = [];
  for (let i = 0; i < choices.length; i += columns) rows.push(choices.slice(i, i + columns));

  return (
    <View style={{ flex: 1, gap: theme.spacing.md }}>
      {rows.map((row, r) => (
        <View key={r} style={{ flex: 1, flexDirection: 'row', gap: theme.spacing.md }}>
          {row.map((choice, c) => (
            <Pressable
              key={`${r}-${c}`}
              accessibilityRole="button"
              accessibilityLabel={(labelFor ?? textFor)(choice)}
              onPress={() => {
                if (picked.current) return;
                picked.current = true;
                onPick(choice);
              }}
              style={({ pressed }) => ({
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: theme.radius.lg,
                backgroundColor: pressed ? theme.colors.surfaceSelected : theme.colors.surface,
              })}>
              <Text variant={variant}>{textFor(choice)}</Text>
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}
