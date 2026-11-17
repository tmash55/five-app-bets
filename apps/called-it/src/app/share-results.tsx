import { Button, Notice, Screen, SettingsRow, SettingsSection, Text, TextField, useAuth, useTheme } from '@five/shell';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { CARD_PIXELS, ResultsCardView, type CardHandle } from '@/components/ResultsCardView';
import { createLeague, fetchDisplayName, fetchMyLeagues, LeagueLimitError } from '@/compete/api';
import type { LeagueSummary } from '@/compete/standings';
import { inviteUrl } from '@/invite/inviteUrl';
import { fetchResults, type ResultsData } from '@/results/api';
import {
  buildResultsCard,
  canShareResults,
  defaultShareLeague,
  printedLink,
  shareMessage,
  shareMessageShort,
  suggestedLeagueName,
} from '@/share/resultsCard';
import { shareConfig } from '@/share/shareConfig';
import { hasInstagram, isShareCancel, shareTo, type ShareTarget } from '@/share/shareTargets';
import { easternDate } from '../../supabase/functions/_shared/slate/time.ts';

type Loaded = { results: ResultsData; leagues: LeagueSummary[]; displayName: string | null };

const MAX_PREVIEW_WIDTH = 300;

/**
 * Share a graded slate as a results card with a league invite link (UNJ-1425).
 * Opened from the Results screen; `date` picks the slate like Results does.
 */
export default function ShareResultsScreen() {
  const { client } = useAuth();
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const { date } = useLocalSearchParams<{ date?: string }>();
  const [data, setData] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [leagueId, setLeagueId] = useState<string | null>(null);
  const [newLeagueName, setNewLeagueName] = useState('');
  const [busy, setBusy] = useState<ShareTarget | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [instagram, setInstagram] = useState(false);
  const cardRef = useRef<CardHandle>(null);

  useFocusEffect(
    useCallback(() => {
      if (!client) return;
      let active = true;
      const today = easternDate(new Date());
      const slateDate = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
      Promise.all([
        fetchResults(client, today, slateDate),
        fetchMyLeagues(client, today),
        fetchDisplayName(client).catch(() => null),
      ]).then(
        ([results, leagues, displayName]) => {
          if (!active) return;
          setData({ results, leagues, displayName });
          setLeagueId((current) => current ?? defaultShareLeague(leagues)?.id ?? null);
          setNewLeagueName((current) => current || suggestedLeagueName(displayName));
          setLoadError(null);
        },
        (e: Error) => {
          if (active) setLoadError(e.message);
        },
      );
      return () => {
        active = false;
      };
    }, [client, date]),
  );

  useEffect(() => {
    if (!shareConfig.metaAppId) return;
    hasInstagram().then(setInstagram);
  }, []);

  if (!data) {
    return (
      <Screen centered>
        {loadError ? (
          <Notice tone="error" title="Couldn't load your results" body={loadError} />
        ) : (
          <Text color="textSecondary">Loading your card…</Text>
        )}
      </Screen>
    );
  }

  const { results, leagues, displayName } = data;
  if (!results.slate || !canShareResults(results.questions, results.picks)) {
    return (
      <Screen centered>
        <Notice
          title="Nothing to share yet"
          body="Your card is ready once every question on the slate is graded and you made at least one pick."
        />
      </Screen>
    );
  }

  const card = buildResultsCard({
    slateDate: results.slate.slate_date,
    questions: results.questions,
    picks: results.picks,
    streak: results.streak,
    displayName,
  });
  const league = leagues.find((l) => l.id === leagueId) ?? null;
  const url = league ? inviteUrl(league.invite_code) : null;
  const cardWidth = Math.min(windowWidth - theme.spacing.md * 2, MAX_PREVIEW_WIDTH);
  const nameOk = newLeagueName.trim().length >= 3 && newLeagueName.trim().length <= 30;

  /** The league the link invites to; creates the player's first league when they have none. */
  const ensureLeague = async (): Promise<LeagueSummary> => {
    if (league) return league;
    if (!client) throw new Error('Not signed in.');
    const created = await createLeague(client, newLeagueName.trim());
    const fresh = await fetchMyLeagues(client, easternDate(new Date()));
    const found = fresh.find((l) => l.id === created.id);
    if (!found) throw new Error('The league was created but could not be loaded. Try again.');
    setData({ ...data, leagues: fresh });
    setLeagueId(found.id);
    // Let the card re-render with the new link before it is captured.
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    return found;
  };

  const share = async (target: ShareTarget) => {
    setBusy(target);
    setShareError(null);
    try {
      const targetLeague = await ensureLeague();
      const link = inviteUrl(targetLeague.invite_code);
      const imageUri = await captureRef(cardRef, { format: 'png', result: 'tmpfile', ...CARD_PIXELS });
      await shareTo(target, {
        imageUri,
        message: shareMessage(card, targetLeague.name, link),
        shortMessage: shareMessageShort(card, targetLeague.name),
        url: link,
        metaAppId: shareConfig.metaAppId,
      });
    } catch (e) {
      if (e instanceof LeagueLimitError) setShareError(e.message);
      else if (!isShareCancel(e)) setShareError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <View style={{ alignItems: 'center' }}>
        <ResultsCardView
          ref={cardRef}
          card={card}
          leagueName={league?.name ?? (nameOk ? newLeagueName.trim() : null)}
          link={url ? printedLink(url) : null}
          width={cardWidth}
        />
      </View>

      {leagues.length > 1 ? (
        <SettingsSection title="Your link invites friends to">
          {leagues.map((l) => (
            <SettingsRow
              key={l.id}
              label={l.name}
              detail={l.id === leagueId ? 'Selected' : `${l.member_count} ${l.member_count === 1 ? 'player' : 'players'}`}
              onPress={() => setLeagueId(l.id)}
            />
          ))}
        </SettingsSection>
      ) : leagues.length === 1 ? (
        <Text variant="caption" color="textSecondary">
          {`Your link invites friends to ${leagues[0].name}.`}
        </Text>
      ) : (
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="caption" color="textSecondary">
            Sharing starts your league, so friends who open the link join you there.
          </Text>
          <TextField label="League name" value={newLeagueName} onChangeText={setNewLeagueName} maxLength={30} />
        </View>
      )}

      {shareError ? <Notice tone="error" title="Couldn't share" body={shareError} /> : null}

      <Button
        title="Messages"
        onPress={() => share('messages')}
        loading={busy === 'messages'}
        disabled={Boolean(busy) || (!league && !nameOk)}
      />
      {shareConfig.metaAppId && instagram ? (
        <Button
          title="Instagram Stories"
          onPress={() => share('instagram')}
          loading={busy === 'instagram'}
          disabled={Boolean(busy) || (!league && !nameOk)}
        />
      ) : null}
      <Button
        title="X"
        onPress={() => share('x')}
        loading={busy === 'x'}
        disabled={Boolean(busy) || (!league && !nameOk)}
      />
      <Button
        title="More options"
        variant="secondary"
        onPress={() => share('more')}
        loading={busy === 'more'}
        disabled={Boolean(busy) || (!league && !nameOk)}
      />
    </Screen>
  );
}
