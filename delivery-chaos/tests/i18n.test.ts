import { describe, expect, it } from 'vitest';
import {
  DICTIONARIES,
  awardDetail,
  awardTitle,
  detectLang,
  errorText,
  format,
  formatCargoStatus,
  formatQuote,
  formatTipParts,
  netText,
  placeName,
  playerName,
  tIn,
  type MsgKey,
} from '../src/client/i18n';
import { computeTip, integrityQuote, pickAwards, emptyStats, type QuoteKey } from '../src/shared/scoring';

const CJK = /[　-〿一-鿿＀-￯]/;
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('dictionaries', () => {
  const keys = Object.keys(DICTIONARIES.zh) as MsgKey[];

  it('zh and en have exactly the same keys and the same {placeholders}', () => {
    expect(Object.keys(DICTIONARIES.en).sort()).toEqual([...keys].sort());
    for (const k of keys) expect(placeholders(DICTIONARIES.en[k]), k).toEqual(placeholders(DICTIONARIES.zh[k]));
  });

  it('no key is empty, and the English UI contains no Chinese (except the language switch label)', () => {
    for (const k of keys) {
      expect(DICTIONARIES.zh[k].length, `zh ${k}`).toBeGreaterThan(0);
      expect(DICTIONARIES.en[k].length, `en ${k}`).toBeGreaterThan(0);
      if (k !== 'lang.zh') expect(DICTIONARIES.en[k], `en ${k}`).not.toMatch(CJK);
    }
  });

  it('the Chinese UI keeps its Chinese (sanity: the keys that must be translated differ)', () => {
    for (const k of ['menu.solo', 'lobby.start', 'results.again', 'hud.tips', 'req.noHorn.text', 'quote.five'] as MsgKey[]) {
      expect(DICTIONARIES.zh[k], k).toMatch(CJK);
      expect(DICTIONARIES.zh[k]).not.toBe(DICTIONARIES.en[k]);
    }
  });
});

describe('tip parts formatting', () => {
  const r = computeTip({ distance: 100, food: 'soup', size: 1, integrity: 0.72, elapsed: 22, timeLimit: 40, request: 'noHorn', requestOk: false });

  it('Chinese', () => {
    expect(formatTipParts(r.parts, 'zh')).toBe('完整度 72% · 提前 18s · 狗被吵醒 −8');
  });

  it('English', () => {
    expect(formatTipParts(r.parts, 'en')).toBe('Intact 72% · 18s early · Dog woke up −8');
  });

  it('late deliveries and positive bonuses, both languages', () => {
    const late = computeTip({ distance: 100, food: 'soup', size: 1, integrity: 1, elapsed: 50, timeLimit: 40, request: 'rush', requestOk: true });
    expect(formatTipParts(late.parts, 'zh')).toBe('完整度 100% · 超时 10s · 火速送达 +15');
    expect(formatTipParts(late.parts, 'en')).toBe('Intact 100% · 10s late · Lightning fast +15');
  });

  it('every request x outcome has text in both languages and no leftover placeholders', () => {
    for (const req of ['noHorn', 'gentle', 'backDoor', 'rush'] as const) {
      for (const ok of [true, false]) {
        const tip = computeTip({ distance: 80, food: 'ice', size: 2, integrity: 0.8, elapsed: 10, timeLimit: 40, request: req, requestOk: ok });
        for (const lang of ['zh', 'en'] as const) {
          const text = formatTipParts(tip.parts, lang);
          expect(text, `${lang} ${req} ${ok}`).not.toMatch(/[{}]/);
          expect(text).toMatch(ok ? /\+/ : /−/);
          if (lang === 'en') expect(text).not.toMatch(CJK);
        }
      }
    }
  });
});

describe('quotes, cargo, awards, names, errors', () => {
  it('every quote key exists in both languages', () => {
    const foods = ['soup', 'pizza', 'ice'] as const;
    const keys = new Set<QuoteKey>();
    for (const f of foods) for (const i of [0, 0.1, 0.5, 0.75, 1]) keys.add(integrityQuote(f, i));
    expect(keys.size).toBe(7);
    for (const k of keys) {
      expect(formatQuote(k, 'zh')).toMatch(CJK);
      expect(formatQuote(k, 'en')).not.toMatch(CJK);
      expect(formatQuote(k, 'en')).not.toBe(k);
    }
    expect(formatQuote('quote.five', 'en')).toBe('Five stars!');
    expect(formatQuote('quote.five', 'zh')).toBe('五星好评！');
  });

  it('cargo status line', () => {
    expect(formatCargoStatus({ kind: 'soup', pct: 68 }, 'zh')).toBe('汤 68%');
    expect(formatCargoStatus({ kind: 'soup', pct: 68 }, 'en')).toBe('Soup 68%');
    expect(formatCargoStatus({ kind: 'pizza', boxes: 3, size: 4 }, 'en')).toBe('Pizza 3/4');
    expect(formatCargoStatus({ kind: 'ice', scoops: 2, size: 3, meltPct: 40 }, 'zh')).toBe('冰淇淋 2/3 · 融化 40%');
    expect(formatCargoStatus({ kind: 'ice', scoops: 2, size: 3, meltPct: 40 }, 'en')).toBe('Ice cream 2/3 · melted 40%');
  });

  it('awards are rendered from id + value', () => {
    const a = emptyStats();
    const b = { ...emptyStats(), crashes: 1, soupSpilled: 1.26, honks: 1, maxAirTime: 1.84, tips: 40, deliveries: 2, integritySum: 1.5 };
    const awards = pickAwards([{ id: 'a', name: 'A', stats: a }, { id: 'b', name: 'B', stats: b }], 10);
    const by = Object.fromEntries(awards.map((x) => [x.id, x]));
    expect(awardTitle('soup', 'en')).toBe('Soup Spiller');
    expect(awardTitle('soup', 'zh')).toBe('洒汤王');
    expect(awardDetail('soup', by.soup!.value, 'en')).toBe('Spilled 1.3 bowls of soup');
    expect(awardDetail('soup', by.soup!.value, 'zh')).toBe('洒了 1.3 碗汤');
    expect(awardDetail('crash', 1, 'en')).toBe('1 crash');
    expect(awardDetail('crash', 3, 'en')).toBe('3 crashes');
    expect(awardDetail('tips', 40, 'en')).toBe('Earned ¥40');
    expect(awardDetail('steady', 0.75, 'zh')).toBe('平均完整度 75%');
    expect(awardDetail('air', 1.84, 'en')).toBe('Longest air time 1.8s');
    expect(awardDetail('honk', 1, 'en')).toBe('Honked once');
    expect(awardDetail('honk', 7, 'en')).toBe('Honked 7 times');
  });

  it('place names are bilingual', () => {
    const r = { name: '王记汤馆', nameEn: "Wang's Soup House" };
    expect(placeName(r, 'zh')).toBe('王记汤馆');
    expect(placeName(r, 'en')).toBe("Wang's Soup House");
    const c = { name: '24号楼 张先生', nameEn: 'Bldg 24 · Mr. Zhang' };
    expect(placeName(c, 'en')).toBe('Bldg 24 · Mr. Zhang');
  });

  it('unnamed players get a localized default from their colour slot; named players keep their name', () => {
    expect(playerName({ name: '', color: 1 }, 'zh')).toBe('骑手2');
    expect(playerName({ name: '', color: 1 }, 'en')).toBe('Rider 2');
    expect(playerName({ name: 'Alex', color: 1 }, 'en')).toBe('Alex');
    expect(playerName({ name: '小明', color: 0 }, 'en')).toBe('小明');
  });

  it('server error codes and transport failures turn into text; plurals and params work', () => {
    expect(errorText('playing', 'zh')).toBe('房间正在游戏中，请等下一局');
    expect(errorText('playing', 'en')).toMatch(/mid-game/);
    expect(errorText('mystery-code', 'en')).toBe('mystery-code');
    expect(netText('closed', 'en')).toBe('Connection lost');
    expect(netText('timeout', 'zh')).toBe('连接超时');
    expect(tIn('en', 'hud.more', { n: 1 })).toBe('1 more order…');
    expect(tIn('en', 'hud.more', { n: 3 })).toBe('3 more orders…');
    expect(tIn('zh', 'hud.more', { n: 3 })).toBe('还有 3 单…');
    expect(format('a {x} b {y}', { x: 1 })).toBe('a 1 b {y}');
  });
});

describe('language detection', () => {
  it('navigator.language: zh* -> zh, everything else -> en', () => {
    expect(detectLang('', 'zh-CN', null)).toBe('zh');
    expect(detectLang('', 'zh-TW', null)).toBe('zh');
    expect(detectLang('', 'zh', null)).toBe('zh');
    expect(detectLang('', 'en-US', null)).toBe('en');
    expect(detectLang('', 'fr-FR', null)).toBe('en');
    expect(detectLang('', undefined, null)).toBe('en');
  });

  it('a saved preference beats the browser language; ?lang= beats everything', () => {
    expect(detectLang('', 'zh-CN', 'en')).toBe('en');
    expect(detectLang('', 'en-US', 'zh')).toBe('zh');
    expect(detectLang('?lang=zh', 'en-US', 'en')).toBe('zh');
    expect(detectLang('?solo&lang=en', 'zh-CN', 'zh')).toBe('en');
    expect(detectLang('?lang=klingon', 'zh-CN', null)).toBe('zh'); // unknown value ignored
    expect(detectLang('?lang=', 'en-GB', 'garbage')).toBe('en');
  });
});
