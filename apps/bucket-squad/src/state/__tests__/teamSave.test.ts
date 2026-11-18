/** The squad's name, colours and court choices in the save: old saves, damaged ones, and what the account is given. */

import { RANDOM_COURT } from '@/meta/courts';

import { DEFAULT_SETTINGS, colorTeam, forAccount, fromAccount, nameTeam, newSave, repairSave, startCareer, type SaveData } from '../logic';

const career = (): SaveData => startCareer(newSave(), 'comets');

/** a save as an older build wrote it: none of the fields this feature added */
function oldSave(): Record<string, unknown> {
  const s = JSON.parse(JSON.stringify(career())) as Record<string, unknown>;
  delete s.teamName;
  delete s.teamColors;
  const st = s.settings as Record<string, unknown>;
  delete st.quickCourt;
  delete st.duoCourt;
  delete st.hostCourt;
  return s;
}

describe('an older save', () => {
  it('loads as Your Squad, in the colours it wears, with random courts', () => {
    const s = repairSave(oldSave());
    expect(s.onboarded).toBe(true);
    expect(s.squad).toEqual(career().squad);
    expect(s.teamName).toBeNull();
    expect(s.teamColors).toBeNull();
    expect(s.settings.quickCourt).toBe(RANDOM_COURT);
    expect(s.settings.duoCourt).toBe(RANDOM_COURT);
    expect(s.settings.hostCourt).toBeNull();
  });

  it('a new save starts the same way', () => {
    const s = newSave();
    expect([s.teamName, s.teamColors]).toEqual([null, null]);
    expect([DEFAULT_SETTINGS.quickCourt, DEFAULT_SETTINGS.duoCourt, DEFAULT_SETTINGS.hostCourt]).toEqual([RANDOM_COURT, RANDOM_COURT, null]);
  });
});

describe('a save with a name', () => {
  it('keeps a wheel name, a typed name, colours and courts through a round trip', () => {
    let s = nameTeam(career(), { words: ['Cosmic', 'Otters'] });
    s = colorTeam(s, 'royal-gold');
    s = { ...s, settings: { ...s.settings, quickCourt: 'snow', duoCourt: null, hostCourt: RANDOM_COURT } };
    const back = repairSave(JSON.parse(JSON.stringify(s)));
    expect(back).toEqual(s);
    const typed = nameTeam(career(), { typed: 'Big Dogs' });
    expect(repairSave(JSON.parse(JSON.stringify(typed))).teamName).toEqual({ typed: 'Big Dogs' });
  });

  it('drops what this build cannot use back to the defaults', () => {
    const s = repairSave({ ...oldSave(), teamName: { words: ['Lava', 'Lizards'] }, teamColors: 'plaid', settings: { quickCourt: 'moon', duoCourt: 7, hostCourt: 'beach' } });
    expect(s.teamName).toBeNull();
    expect(s.teamColors).toBeNull();
    expect(s.settings.quickCourt).toBe(RANDOM_COURT);
    expect(s.settings.duoCourt).toBe(RANDOM_COURT);
    expect(s.settings.hostCourt).toBe('beach');
    expect(repairSave({ ...oldSave(), teamName: { typed: '<<Big   Dogs!!>>' } }).teamName).toEqual({ typed: 'Big Dogs' });
    expect(repairSave({ ...oldSave(), teamName: 'Big Dogs' }).teamName).toBeNull();
  });

  it('naming cleans what it is given, and null goes back to Your Squad', () => {
    expect(nameTeam(career(), { typed: '  Zoom!!  Zoom ' }).teamName).toEqual({ typed: 'Zoom Zoom' });
    expect(nameTeam(career(), { typed: '!!!' }).teamName).toBeNull();
    expect(nameTeam(nameTeam(career(), { words: ['Neon', 'Ninjas'] }), null).teamName).toBeNull();
    expect(colorTeam(career(), 'nope').teamColors).toBeNull();
    expect(colorTeam(colorTeam(career(), 'hot-pink'), null).teamColors).toBeNull();
  });
});

describe('the account save', () => {
  it('never gets a typed name: it stays on the device', () => {
    const typed = nameTeam(career(), { typed: 'Secret Name' });
    const sent = forAccount(typed);
    expect(sent.teamName).toBeNull();
    expect(JSON.stringify(sent)).not.toContain('Secret Name');
    // everything else goes as it is
    expect({ ...sent, teamName: typed.teamName }).toEqual(typed);
  });

  it('gets a wheel name, as it is not personal', () => {
    const wheel = nameTeam(career(), { words: ['Pixel', 'Puffins'] });
    expect(forAccount(wheel)).toBe(wheel);
  });

  it('hands a save back without touching the device’s typed name', () => {
    const device = nameTeam(career(), { typed: 'Secret Name' });
    const cloud = { ...career(), coins: 999, teamName: null };
    expect(fromAccount(cloud, device).teamName).toEqual({ typed: 'Secret Name' });
    expect(fromAccount(cloud, device).coins).toBe(999);
    // a wheel name chosen on another device comes over
    const named = { ...cloud, teamName: { words: ['Neon', 'Ninjas'] as [string, string] } };
    expect(fromAccount(named, device).teamName).toEqual({ words: ['Neon', 'Ninjas'] });
    expect(fromAccount(cloud, career()).teamName).toBeNull();
  });
});
