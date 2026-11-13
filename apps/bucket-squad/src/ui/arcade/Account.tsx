/**
 * The account, as the game shows it: the ACCOUNT row in Settings, the grown-up check, the account pop-up
 * (Sign in with Apple, sign out, delete) and the pick between two saved games.
 *
 * A child can see the row; everything that changes the account sits behind the grown-up check.
 */

import * as AppleAuthentication from 'expo-apple-authentication';
import { usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { account, gateFresh, useAccount, type AccountProblem, type AccountState } from '@/account';
import { gateQuestion, type GateQuestion } from '@/account/gate';
import { savedAgo, type Progress } from '@/account/sync';
import { arcade, night, tube as tubes } from '@/theme/arcade';
import { px, size as sizes, space } from '@/theme/tokens';
import { GhostButton, GoldButton } from './Buttons';
import { LineIcon, type LineIconName } from './LineIcon';
import { Popup } from './Popup';
import { CoinAmount } from './Rewards';
import { Tag, Well } from './Surface';
import { Glow, Print } from './Type';

/** the time now, moved on once a minute, for "saved 3 minutes ago" */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** what went wrong, in plain words */
export function problemWords(problem: AccountProblem | null, phase: AccountState['phase']): string | null {
  switch (problem) {
    case 'offline':
      return phase === 'choose' ? "Couldn't reach your account, so nothing was changed. Try again when you're online." : "Couldn't reach your account just now. Your game is safe on this device and will be saved when you're back online.";
    case 'signIn':
      return "Signing in didn't work. Please try again.";
    case 'delete':
      return "The account couldn't be deleted just now. Please try again when you're online.";
    default:
      return null;
  }
}

/** The one line the Settings row says about where the game is kept. */
export function accountLine(s: Pick<AccountState, 'phase' | 'problem' | 'savedAt' | 'dirty'>, now: number): string {
  switch (s.phase) {
    case 'off':
      return "Your game is saved on this device. Accounts aren't set up in this build.";
    case 'starting':
    case 'signedOut':
      return 'Your game is saved on this device.';
    case 'signingIn':
      return 'Signing in…';
    case 'syncing':
      return 'Checking your account…';
    case 'choose':
      return 'Two saved games found. A grown-up needs to pick one.';
    case 'deleting':
      return 'Deleting the account…';
    case 'signedIn':
      if (s.problem === 'offline') return s.dirty ? 'Saved here. Waiting to reach your account.' : "Saved to your account. Can't reach it right now.";
      return s.savedAt !== null ? `Saved to your account ${savedAgo(s.savedAt, now)}.` : 'Saved to your account.';
  }
}

const ROW_ICON: Record<AccountState['phase'], LineIconName> = {
  off: 'lock',
  starting: 'lock',
  signedOut: 'lock',
  signingIn: 'clock',
  syncing: 'clock',
  signedIn: 'check',
  choose: 'swap',
  deleting: 'clock',
};

/** The ACCOUNT row in Settings: where the game is kept, and the way in for a grown-up. */
export function AccountRow({ onOpen, note }: { onOpen: () => void; /** small print at the end of the ACCOUNT label (the version) */ note?: string }) {
  const phase = useAccount((s) => s.phase);
  const problem = useAccount((s) => s.problem);
  const savedAt = useAccount((s) => s.savedAt);
  const dirty = useAccount((s) => s.dirty);
  const now = useMinuteClock();
  const line = accountLine({ phase, problem, savedAt, dirty }, now);
  const lit = phase === 'signedIn' && problem === null;
  const choose = phase === 'choose';
  return (
    <Well style={styles.row}>
      <LineIcon name={ROW_ICON[phase]} size={px(18)} tube={lit ? 'green' : choose ? 'gold' : 'violet'} weight={2.2} />
      <View style={styles.rowWords}>
        <View style={styles.label}>
          <Print face="bold" size="micro" color="textFaint" track="wider" lines={1} style={styles.keep}>
            ACCOUNT
          </Print>
          {note !== undefined && (
            <Print face="medium" size="micro" color="textFaint" lines={1} style={styles.give}>
              {note}
            </Print>
          )}
        </View>
        <Print face="medium" size="tiny" color={problem ? tubes.orange.soft : 'textDim'} lines={3}>
          {line}
        </Print>
      </View>
      {phase !== 'off' &&
        (choose ? (
          <GhostButton label="PICK ONE" icon="swap" tube="gold" small onPress={account.showChoice} accessibilityLabel="Pick which saved game to keep, for grown-ups" />
        ) : (
          <GhostButton label={phase === 'signedIn' ? 'MANAGE' : 'SIGN IN'} icon="lock" tube="violet" small onPress={onOpen} accessibilityLabel="Account, for grown-ups" />
        ))}
    </Well>
  );
}

/** "Ask a grown-up": a times-table question with three answers. */
export function ParentGate({ onPass, onClose }: { onPass: () => void; onClose: () => void }) {
  const [q, setQ] = useState<GateQuestion>(() => gateQuestion(Math.random));
  const [missed, setMissed] = useState(false);
  const answer = (n: number) => {
    if (n === q.answer) {
      account.passGate();
      onPass();
      return;
    }
    // a new question each miss, so tapping round the three answers does not get through
    setMissed(true);
    setQ(gateQuestion(Math.random));
  };
  return (
    <Popup tube="violet" width={px(420)} onDismiss={onClose} style={styles.center}>
      <Glow face="display" size="title" tube="violet" track="close">
        GROWN-UPS ONLY
      </Glow>
      <Print face="medium" size="body" color="textSoft" center>
        {missed ? 'Not quite. Ask a grown-up to answer this one.' : 'Accounts are for grown-ups. Please answer this to go on.'}
      </Print>
      <View accessible accessibilityLabel={`What is ${q.a} times ${q.b}?`}>
        <Print face="display" size="big" color="text" center>
          {`${q.a} × ${q.b} = ?`}
        </Print>
      </View>
      <View style={styles.buttons}>
        {q.choices.map((n) => (
          <GhostButton key={`${q.a}x${q.b}-${n}`} label={String(n)} tube="violet" onPress={() => answer(n)} style={styles.grow} />
        ))}
      </View>
      <GhostButton label="CLOSE" icon="close" tube="steel" small onPress={onClose} />
    </Popup>
  );
}

/**
 * Show the grown-up check first unless one was passed a moment ago, then `then`.
 * Gives the check to draw (or null) and the function that starts it.
 */
export function useGate(): [React.ReactNode, (then: () => void) => void] {
  const [next, setNext] = useState<(() => void) | null>(null);
  const ask = (then: () => void) => {
    if (gateFresh(useAccount.getState().gatePassedAt)) then();
    else setNext(() => then);
  };
  const gate =
    next !== null ? (
      <ParentGate
        onPass={() => {
          setNext(null);
          next();
        }}
        onClose={() => setNext(null)}
      />
    ) : null;
  return [gate, ask];
}

function Problem({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <View accessible accessibilityRole="alert" accessibilityLabel={text}>
      <Print face="medium" size="small" color={tubes.orange.soft} center>
        {text}
      </Print>
    </View>
  );
}

/** The official Apple button where the system has one, a line saying where it works everywhere else. */
function AppleButton() {
  const available = useAccount((s) => s.appleAvailable);
  if (!available) {
    return (
      <Well style={styles.notHere}>
        <Print face="medium" size="small" color="textDim" center>
          Sign in with Apple works in the game on iPhone and iPad.
        </Print>
      </Well>
    );
  }
  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
      cornerRadius={arcade.rButton}
      style={styles.apple}
      onPress={() => void account.signIn()}
    />
  );
}

/** The account pop-up, opened by a grown-up from Settings. */
export function AccountSheet({ onClose }: { onClose: () => void }) {
  const phase = useAccount((s) => s.phase);
  const problem = useAccount((s) => s.problem);
  const savedAt = useAccount((s) => s.savedAt);
  const dirty = useAccount((s) => s.dirty);
  const now = useMinuteClock();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const busy = phase === 'signingIn' || phase === 'syncing' || phase === 'starting' || phase === 'deleting';
  const close = busy ? undefined : onClose;

  if (phase === 'signedIn' && confirmDelete) {
    return (
      <Popup tube="red" width={px(440)} onDismiss={() => setConfirmDelete(false)} style={styles.center}>
        <Glow face="display" size="title" tube="red" track="close">
          DELETE ACCOUNT?
        </Glow>
        <Print face="medium" size="body" color="textSoft" center>
          This deletes the account and the game saved in it. The game on this device stays, and play carries on here.
        </Print>
        <View style={styles.buttons}>
          <GoldButton label="KEEP ACCOUNT" size="small" onPress={() => setConfirmDelete(false)} style={styles.grow} />
          <GhostButton
            label="DELETE IT"
            icon="close"
            tube="red"
            onPress={() => {
              setConfirmDelete(false);
              void account.deleteAccount();
            }}
            style={styles.grow}
          />
        </View>
      </Popup>
    );
  }

  return (
    <Popup tube="violet" width={px(460)} onDismiss={close} style={styles.center}>
      <View style={styles.title}>
        <Glow face="display" size="title" tube="violet" track="close">
          ACCOUNT
        </Glow>
        {phase === 'signedIn' && <Tag label="SIGNED IN" tube="green" small />}
      </View>

      {(phase === 'signedOut' || phase === 'starting' || phase === 'off') && (
        <>
          <Print face="medium" size="body" color="textSoft" center>
            {phase === 'off' ? "Accounts aren't set up in this build. Your game is saved on this device." : 'Sign in to keep this game in your account. It stays safe if this device is lost, and comes back when you sign in on another iPhone or iPad.'}
          </Print>
          {phase === 'signedOut' && <AppleButton />}
          <Print face="medium" size="tiny" color="textFaint" center>
            Only the game is saved with the account. Apple lets you hide your email.
          </Print>
        </>
      )}

      {busy && (
        <Print face="bold" size="large" color="textSoft" center>
          {accountLine({ phase, problem, savedAt, dirty }, now)}
        </Print>
      )}

      {phase === 'signedIn' && (
        <>
          <Well style={styles.saved}>
            <LineIcon name="check" size={px(20)} tube={problem ? 'orange' : 'green'} weight={2.4} />
            <View style={styles.rowWords}>
              <Print face="bold" size="large" color="text">
                {problem === 'offline' && dirty ? 'Saved on this device' : 'Saved to your account'}
              </Print>
              <Print face="medium" size="small" color="textDim">
                {savedAt !== null ? `Last saved ${savedAgo(savedAt, now)}` : 'Saving now'}
              </Print>
            </View>
          </Well>
          <Print face="medium" size="tiny" color="textFaint" center>
            Signing out keeps the game on this device. Signing in again brings the account&apos;s game back.
          </Print>
          <View style={styles.buttons}>
            <GhostButton label="SIGN OUT" icon="back" tube="cyan" onPress={() => void account.signOut()} style={styles.grow} />
            <GhostButton label="DELETE ACCOUNT" icon="close" tube="red" onPress={() => setConfirmDelete(true)} style={styles.grow} />
          </View>
        </>
      )}

      <Problem text={problemWords(problem, phase)} />
      {close && <GhostButton label="CLOSE" icon="close" tube="steel" small onPress={close} />}
    </Popup>
  );
}

function GameCard({ title, progress, tube, onPress, label }: { title: string; progress: Progress; tube: 'cyan' | 'gold'; onPress: () => void; label: string }) {
  return (
    <Well style={[styles.game, { borderColor: tubes[tube].glass }]}>
      <Print face="bold" size="small" color={tubes[tube].tint} track="wider" lines={1}>
        {title}
      </Print>
      <View style={styles.facts}>
        <View style={styles.fact} accessible accessibilityLabel={`${progress.players} players found`}>
          <LineIcon name="cards" size={px(18)} tube="steel" />
          <Print face="display" size="large" color="text" lines={1}>
            {progress.players.toLocaleString('en-US')}
          </Print>
          <Print face="bold" size="micro" color="textFaint" track="wide" lines={1}>
            PLAYERS
          </Print>
        </View>
        <View style={styles.fact}>
          <CoinAmount coins={progress.coins} size="body" />
          <Print face="bold" size="micro" color="textFaint" track="wide" lines={1}>
            COINS
          </Print>
        </View>
        <View style={styles.fact} accessible accessibilityLabel={`${progress.games} games played`}>
          <LineIcon name="ball" size={px(18)} tube="steel" />
          <Print face="display" size="large" color="text" lines={1}>
            {progress.games.toLocaleString('en-US')}
          </Print>
          <Print face="bold" size="micro" color="textFaint" track="wide" lines={1}>
            GAMES
          </Print>
        </View>
      </View>
      {tube === 'gold' ? <GoldButton label={label} size="small" onPress={onPress} style={styles.stretch} /> : <GhostButton label={label} tube={tube} onPress={onPress} style={styles.stretch} />}
    </Well>
  );
}

/**
 * The pick between this device's game and the account's, over whatever page is showing (not over a match).
 * A grown-up picks; the one not picked is kept in the account as a backup.
 */
export function SaveChoice() {
  const phase = useAccount((s) => s.phase);
  const choice = useAccount((s) => s.choice);
  const hidden = useAccount((s) => s.choiceHidden);
  const problem = useAccount((s) => s.problem);
  const path = usePathname();
  const [gate, ask] = useGate();
  if (phase !== 'choose' || !choice || hidden || path === '/match') return null;
  return (
    <>
      <Popup tube="gold" width={px(600)} style={styles.center}>
        <Glow face="display" size="title" tube="gold" track="close">
          TWO SAVED GAMES
        </Glow>
        <Print face="medium" size="small" color="textSoft" center>
          This device and your account both have a game. A grown-up picks the one to keep playing; the other is kept in the account as a backup.
        </Print>
        <View style={styles.games}>
          <GameCard title="THIS DEVICE" progress={choice.device} tube="cyan" label="KEEP THIS DEVICE'S GAME" onPress={() => ask(() => void account.choose('device'))} />
          <GameCard title="IN YOUR ACCOUNT" progress={choice.cloud} tube="gold" label="USE THE SAVED GAME" onPress={() => ask(() => void account.choose('cloud'))} />
        </View>
        <Problem text={problemWords(problem, phase)} />
        <GhostButton label="NOT NOW" tube="steel" small onPress={account.hideChoice} accessibilityLabel="Not now. Keep playing this device's game for now." />
      </Popup>
      {gate}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  label: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: space.sm,
  },
  keep: {
    flexShrink: 0,
  },
  give: {
    flexShrink: 1,
  },
  rowWords: {
    flex: 1,
    gap: px(1),
  },
  center: {
    alignItems: 'center',
    gap: space.md,
  },
  title: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  buttons: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: space.sm,
  },
  grow: {
    flex: 1,
  },
  stretch: {
    alignSelf: 'stretch',
  },
  apple: {
    width: px(260),
    height: sizes.tap,
  },
  notHere: {
    alignSelf: 'stretch',
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  saved: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
  },
  games: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    gap: space.md,
  },
  game: {
    flex: 1,
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderWidth: arcade.outline,
    backgroundColor: night.well,
  },
  facts: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignSelf: 'stretch',
  },
  fact: {
    alignItems: 'center',
    gap: px(1),
  },
});
