/** The leagues as lit tabs in the top bar, for a page that lists teams, when a family build adds a league. */

import { LEAGUES } from '@/data/roster';
import { LitTabs } from './LitTabs';

const TABS = LEAGUES.map((l) => ({ id: l.id, label: l.name }));

export function LeagueTabs({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return <LitTabs tabs={TABS} value={value} onChange={onChange} />;
}
