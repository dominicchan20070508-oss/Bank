// Tiny i18n layer (DESIGN §13.1): two dictionaries (zh / en), t(key, params), language detection and persistence.
// Everything player-visible goes through t(). The server and the shared rules only ever send keys and numbers
// (tip parts, quote keys, award ids, error codes); the formatting helpers at the bottom turn them into text.
//
// Pure module: safe to import from tests (no DOM access at import time; storage access is guarded).
import type { Customer, Restaurant } from '../shared/map';
import type { AwardId, QuoteKey, TipPart } from '../shared/scoring';
import type { CargoStatus } from '../sim/cargo';

export type Lang = 'zh' | 'en';
export type Params = Record<string, string | number | undefined>;

// ---------------------------------------------------------------------------------------------------------------
// Simplified Chinese (the source dictionary; `en` below must have exactly the same keys, enforced by the type)
// ---------------------------------------------------------------------------------------------------------------
const zh = {
  'doc.title': '外卖大乱送 · Delivery Chaos',
  'lang.zh': '中文',
  'lang.en': 'EN',
  'lang.switch': '语言',

  // menu
  'menu.title': '外卖大乱送',
  'menu.subtitle': 'DELIVERY CHAOS',
  'menu.name': '你的名字',
  'menu.namePlaceholder': '骑手',
  'menu.solo': '单人练习',
  'menu.create': '创建房间',
  'menu.join': '加入房间',
  'menu.code': '房间码',
  'menu.go': '加入',
  'menu.soon': '联机功能即将上线',
  'menu.arrows': '方向键',
  'menu.ride': '骑行',
  'menu.handbrake': '手刹甩尾',
  'menu.horn': '喇叭',
  'menu.reset': '扶正',
  'menu.key.space': '空格',
  'menu.help.goal': '去亮起的餐厅停下取餐，再送到顾客家门口停下交货。',
  'menu.help.tip': '货物会晃、会洒、会飞——开稳点，小费才多！',
  'menu.help.touch': '左半屏拖动转向，右边按钮控制油门、刹车、手刹、喇叭和扶正。',
  'sound.mute': '静音',
  'sound.unmute': '开启声音',

  // lobby
  'lobby.title': '房间大厅',
  'lobby.solo': '单人练习',
  'lobby.codeHint': '房间码 · 告诉朋友',
  'lobby.copy': '复制邀请链接',
  'lobby.share': '分享邀请',
  'lobby.count': '{n} / 4 人',
  'lobby.start': '开始游戏',
  'lobby.waiting': '等待房主开始…',
  'lobby.leave': '返回菜单',
  'lobby.host': '房主',
  'lobby.you': '你',
  'player.default': '骑手{n}',

  // results
  'results.title': '本局结算',
  'results.total': '团队小费 ¥{n}',
  'results.none': '还没送成一单',
  'results.noneDetail': '下局加油！',
  'results.col.rider': '骑手',
  'results.col.delivered': '送达',
  'results.col.tips': '小费',
  'results.col.integrity': '平均完整度',
  'results.col.crashes': '翻车',
  'results.col.soup': '洒汤(碗)',
  'results.col.pizza': '丢披萨',
  'results.col.scoops': '掉冰淇淋',
  'results.col.honks': '喇叭',
  'results.you': '（你）',
  'results.again': '再来一局',
  'results.waitHost': '等待房主…',
  'results.menu': '返回菜单',

  // awards
  'award.tips.title': '小费王',
  'award.crash.title': '翻车王',
  'award.soup.title': '洒汤王',
  'award.air.title': '飞行员',
  'award.honk.title': '喇叭狂魔',
  'award.steady.title': '最稳车手',
  'award.tips.detail': '赚了 ¥{v}',
  'award.crash.detail': '翻车 {v} 次',
  'award.crash.detail.one': '翻车 1 次',
  'award.soup.detail': '洒了 {v} 碗汤',
  'award.air.detail': '最长滞空 {v} 秒',
  'award.honk.detail': '按了 {v} 次喇叭',
  'award.honk.detail.one': '按了 1 次喇叭',
  'award.steady.detail': '平均完整度 {v}%',

  // HUD
  'hud.tips': '团队小费',
  'hud.kmh': 'km/h',
  'hud.more': '还有 {n} 单…',
  'hud.more.one': '还有 1 单…',
  'hud.empty': '空手',
  'hud.hintPickup': '去亮起的餐厅停下取餐',
  'hud.hintWait': '等待新订单…',
  'hud.hintDeliver': '送往 {dest}{req}',
  'hud.keys.ride': '骑行',
  'hud.keys.handbrake': '手刹',
  'hud.keys.horn': '喇叭',
  'hud.keys.reset': '扶正',
  'hud.keys.space': '空格',
  'order.wait': '待取',
  'order.carrying': '配送中·{who} {s}s',
  'order.late': '超时·{who}',
  'order.expired': '已过期',
  'order.delivered': '已送达',
  'order.you': '你',
  'order.backDoor': '送后门',
  'food.soup': '汤',
  'food.pizza': '披萨',
  'food.ice': '冰淇淋',
  'cargo.soup': '汤 {pct}%',
  'cargo.pizza': '披萨 {boxes}/{size}',
  'cargo.ice': '冰淇淋 {scoops}/{size} · 融化 {meltPct}%',

  // special requests
  'req.noHorn.text': '不要按门铃，狗在睡觉',
  'req.noHorn.short': '别按喇叭',
  'req.gentle.text': '轻拿轻放，奶奶在午睡',
  'req.gentle.short': '别翻车',
  'req.backDoor.text': '放后门，别走正门',
  'req.backDoor.short': '送后门',
  'req.rush.text': '饿死了！快点！！',
  'req.rush.short': '加急',

  // tip breakdown parts
  'tip.integrity': '完整度 {pct}%',
  'tip.early': '提前 {secs}s',
  'tip.late': '超时 {secs}s',
  'tip.noHorn.ok': '没吵醒小狗 {bonus}',
  'tip.noHorn.fail': '狗被吵醒 {bonus}',
  'tip.gentle.ok': '轻拿轻放 {bonus}',
  'tip.gentle.fail': '奶奶被吓醒 {bonus}',
  'tip.backDoor.ok': '后门送达 {bonus}',
  'tip.backDoor.fail': '走错门 {bonus}',
  'tip.rush.ok': '火速送达 {bonus}',
  'tip.rush.fail': '太慢了 {bonus}',
  'tipcard.who': '{dest} 收到了外卖',

  // customer quotes
  'quote.none': '我的外卖呢？？',
  'quote.five': '五星好评！',
  'quote.ok': '还行吧…',
  'quote.mid.soup': '汤怎么只剩一半？',
  'quote.mid.pizza': '披萨怎么少了几盒？',
  'quote.mid.ice': '冰淇淋怎么都化了？',
  'quote.bad': '这是什么鬼？？',

  // floating text / toasts in the game
  'float.go': '出发！',
  'float.pickup': '取到餐啦！',
  'float.splash': '哗啦！',
  'float.spill.1': '哗啦！',
  'float.spill.2': '洒了洒了！',
  'float.spill.3': '汤汤汤！',
  'float.pizza': '披萨飞了！',
  'float.scoop': '冰淇淋掉了！',
  'float.crash': '翻车啦！',
  'float.bang': '砰！',
  'float.air': '滞空 {s} 秒！',
  'float.reset': '扶正！',
  'float.honk': '嘟嘟！',
  'float.dog': '汪汪汪！',
  'float.dogWoke': '狗被吵醒了！',
  'bubble.dog': '汪！汪！汪！',
  'bubble.dogWho': '🐕 狗被吵醒了',
  'toast.deliverTo': '送去 {dest}{req}',
  'reject.taken': '被别人抢先了！',
  'reject.busy': '先把手上的单送完！',
  'reject.far': '再靠近一点',
  'reject.fast': '再停稳一点',
  'reject.wrongDoor.back': '走错门啦！这单要送后门',
  'reject.wrongDoor.front': '走错门啦！请送正门',
  'zone.pickup': '取餐中',
  'zone.deliver': '交货中',
  'zone.stop': '刹车停下！',
  'door.back': '后门',

  // notices / network
  'toast.codeInvalid': '请输入4位房间码',
  'toast.copied': '已复制邀请链接：{link}',
  'toast.copyManual': '请手动复制：{link}',
  'share.title': '外卖大乱送',
  'share.text': '来和我一起玩外卖大乱送！房间码 {code}',
  'net.unreachable': '无法连接服务器',
  'net.timeout': '连接超时',
  'net.closed': '连接断开',
  'disconnect.title': '连接断开',
  'disconnect.body': '与服务器的连接已断开。',
  'disconnect.game': '与服务器的连接已断开，这局无法继续了。',
  'err.noWebgl': '你的浏览器不支持 WebGL，无法运行游戏。',
  'err.notFound': '房间不存在，请检查房间码',
  'err.playing': '房间正在游戏中，请等下一局',
  'err.full': '房间已满（最多4人）',
  'err.inRoom': '你已经在房间里了',
  'err.noRoom': '你还没有加入房间',
  'err.busy': '服务器房间太多了，请稍后再试',
  'err.debugOff': '服务器未开启调试功能',

  // touch controls
  'touch.throttle': '油门',
  'touch.brake': '刹车',
  'touch.handbrake': '手刹',
  'touch.horn': '喇叭',
  'touch.reset': '扶正',
  'touch.rotate.title': '请把手机横过来',
  'touch.rotate.sub': '横屏才能玩外卖大乱送',
} as const;

export type MsgKey = keyof typeof zh;

// ---------------------------------------------------------------------------------------------------------------
// English
// ---------------------------------------------------------------------------------------------------------------
const en: Record<MsgKey, string> = {
  'doc.title': 'Delivery Chaos',
  'lang.zh': '中文',
  'lang.en': 'EN',
  'lang.switch': 'Language',

  'menu.title': 'Delivery Chaos',
  'menu.subtitle': 'WILD CO-OP FOOD DELIVERY',
  'menu.name': 'Your name',
  'menu.namePlaceholder': 'Rider',
  'menu.solo': 'Solo practice',
  'menu.create': 'Create room',
  'menu.join': 'Join room',
  'menu.code': 'Room code',
  'menu.go': 'Join',
  'menu.soon': 'Online play is coming soon',
  'menu.arrows': 'Arrow keys',
  'menu.ride': 'ride',
  'menu.handbrake': 'handbrake drift',
  'menu.horn': 'horn',
  'menu.reset': 'upright',
  'menu.key.space': 'Space',
  'menu.help.goal': 'Stop at a glowing restaurant to pick up an order, then stop at the customer\'s door to deliver it.',
  'menu.help.tip': 'Cargo wobbles, spills and flies off. Ride smooth for bigger tips!',
  'menu.help.touch': 'Drag on the left half to steer. Use the buttons on the right for gas, brake, drift, horn and reset.',
  'sound.mute': 'Mute',
  'sound.unmute': 'Sound on',

  'lobby.title': 'Lobby',
  'lobby.solo': 'Solo practice',
  'lobby.codeHint': 'Room code · tell your friends',
  'lobby.copy': 'Copy invite link',
  'lobby.share': 'Share invite',
  'lobby.count': '{n} / 4 players',
  'lobby.start': 'Start game',
  'lobby.waiting': 'Waiting for the host…',
  'lobby.leave': 'Back to menu',
  'lobby.host': 'Host',
  'lobby.you': 'You',
  'player.default': 'Rider {n}',

  'results.title': 'Round results',
  'results.total': 'Team tips ¥{n}',
  'results.none': 'No deliveries yet',
  'results.noneDetail': 'Better luck next round!',
  'results.col.rider': 'Rider',
  'results.col.delivered': 'Orders',
  'results.col.tips': 'Tips',
  'results.col.integrity': 'Avg. intact',
  'results.col.crashes': 'Crashes',
  'results.col.soup': 'Soup lost',
  'results.col.pizza': 'Pizza lost',
  'results.col.scoops': 'Scoops lost',
  'results.col.honks': 'Honks',
  'results.you': ' (you)',
  'results.again': 'Play again',
  'results.waitHost': 'Waiting for host…',
  'results.menu': 'Back to menu',

  'award.tips.title': 'Tip Master',
  'award.crash.title': 'Crash King',
  'award.soup.title': 'Soup Spiller',
  'award.air.title': 'Daredevil Pilot',
  'award.honk.title': 'Honk Maniac',
  'award.steady.title': 'Steadiest Rider',
  'award.tips.detail': 'Earned ¥{v}',
  'award.crash.detail': '{v} crashes',
  'award.crash.detail.one': '1 crash',
  'award.soup.detail': 'Spilled {v} bowls of soup',
  'award.air.detail': 'Longest air time {v}s',
  'award.honk.detail': 'Honked {v} times',
  'award.honk.detail.one': 'Honked once',
  'award.steady.detail': 'Avg. integrity {v}%',

  'hud.tips': 'Team tips',
  'hud.kmh': 'km/h',
  'hud.more': '{n} more orders…',
  'hud.more.one': '1 more order…',
  'hud.empty': 'Empty-handed',
  'hud.hintPickup': 'Stop at a glowing restaurant to pick up',
  'hud.hintWait': 'Waiting for new orders…',
  'hud.hintDeliver': 'Deliver to {dest}{req}',
  'hud.keys.ride': 'ride',
  'hud.keys.handbrake': 'handbrake',
  'hud.keys.horn': 'horn',
  'hud.keys.reset': 'upright',
  'hud.keys.space': 'Space',
  'order.wait': 'Open',
  'order.carrying': 'En route · {who} {s}s',
  'order.late': 'Late · {who}',
  'order.expired': 'Expired',
  'order.delivered': 'Delivered',
  'order.you': 'You',
  'order.backDoor': 'Back door',
  'food.soup': 'Soup',
  'food.pizza': 'Pizza',
  'food.ice': 'Ice cream',
  'cargo.soup': 'Soup {pct}%',
  'cargo.pizza': 'Pizza {boxes}/{size}',
  'cargo.ice': 'Ice cream {scoops}/{size} · melted {meltPct}%',

  'req.noHorn.text': 'No doorbell please, the dog is sleeping',
  'req.noHorn.short': 'No horn',
  'req.gentle.text': 'Handle gently, Grandma is napping',
  'req.gentle.short': 'No crashes',
  'req.backDoor.text': 'Leave it at the back door',
  'req.backDoor.short': 'Back door',
  'req.rush.text': 'Starving! Hurry up!!',
  'req.rush.short': 'Rush',

  'tip.integrity': 'Intact {pct}%',
  'tip.early': '{secs}s early',
  'tip.late': '{secs}s late',
  'tip.noHorn.ok': 'Dog slept on {bonus}',
  'tip.noHorn.fail': 'Dog woke up {bonus}',
  'tip.gentle.ok': 'Gentle ride {bonus}',
  'tip.gentle.fail': 'Grandma got a fright {bonus}',
  'tip.backDoor.ok': 'Back-door drop {bonus}',
  'tip.backDoor.fail': 'Wrong door {bonus}',
  'tip.rush.ok': 'Lightning fast {bonus}',
  'tip.rush.fail': 'Too slow {bonus}',
  'tipcard.who': '{dest} got their order',

  'quote.none': 'Where is my food??',
  'quote.five': 'Five stars!',
  'quote.ok': 'Meh, it\'s fine…',
  'quote.mid.soup': 'Where did half my soup go?',
  'quote.mid.pizza': 'Where did the pizza boxes go?',
  'quote.mid.ice': 'Why is my ice cream melted?',
  'quote.bad': 'What IS this??',

  'float.go': 'Go!',
  'float.pickup': 'Order picked up!',
  'float.splash': 'Splash!',
  'float.spill.1': 'Splash!',
  'float.spill.2': 'Spilled!',
  'float.spill.3': 'Soup everywhere!',
  'float.pizza': 'Pizza flew off!',
  'float.scoop': 'Scoop dropped!',
  'float.crash': 'Wipeout!',
  'float.bang': 'Bam!',
  'float.air': '{s}s of air!',
  'float.reset': 'Upright!',
  'float.honk': 'Beep beep!',
  'float.dog': 'Woof woof!',
  'float.dogWoke': 'The dog woke up!',
  'bubble.dog': 'Woof! Woof! Woof!',
  'bubble.dogWho': '🐕 The dog woke up',
  'toast.deliverTo': 'Deliver to {dest}{req}',
  'reject.taken': 'Someone beat you to it!',
  'reject.busy': 'Finish your current order first!',
  'reject.far': 'Get a little closer',
  'reject.fast': 'Come to a full stop',
  'reject.wrongDoor.back': 'Wrong door! This one goes to the back door',
  'reject.wrongDoor.front': 'Wrong door! Use the front door',
  'zone.pickup': 'Picking up',
  'zone.deliver': 'Delivering',
  'zone.stop': 'Stop here!',
  'door.back': 'Back',

  'toast.codeInvalid': 'Enter the 4-letter room code',
  'toast.copied': 'Invite link copied: {link}',
  'toast.copyManual': 'Please copy it manually: {link}',
  'share.title': 'Delivery Chaos',
  'share.text': 'Join my Delivery Chaos room! Code: {code}',
  'net.unreachable': 'Cannot reach the server',
  'net.timeout': 'Connection timed out',
  'net.closed': 'Connection lost',
  'disconnect.title': 'Disconnected',
  'disconnect.body': 'The connection to the server was lost.',
  'disconnect.game': 'The connection to the server was lost, so this round cannot continue.',
  'err.noWebgl': 'Your browser does not support WebGL, so the game cannot run.',
  'err.notFound': 'Room not found. Check the code.',
  'err.playing': 'That room is mid-game. Wait for the next round.',
  'err.full': 'Room is full (4 players max)',
  'err.inRoom': 'You are already in a room',
  'err.noRoom': 'You have not joined a room',
  'err.busy': 'The server is busy. Try again shortly.',
  'err.debugOff': 'Debug features are off on this server',

  'touch.throttle': 'GAS',
  'touch.brake': 'BRAKE',
  'touch.handbrake': 'DRIFT',
  'touch.horn': 'HORN',
  'touch.reset': 'RESET',
  'touch.rotate.title': 'Rotate your phone',
  'touch.rotate.sub': 'Delivery Chaos is played in landscape',
};

export const DICTIONARIES: Record<Lang, Record<MsgKey, string>> = { zh, en };

// ---------------------------------------------------------------------------------------------------------------
// Language state
// ---------------------------------------------------------------------------------------------------------------
const STORAGE_KEY = 'dc.lang';

/** Which language to use: `?lang=` (QA override) > saved preference > navigator.language (zh* -> zh, else en). */
export function detectLang(search: string, navLang: string | undefined, stored: string | null | undefined): Lang {
  let q: string | null = null;
  try {
    q = new URLSearchParams(search).get('lang');
  } catch {
    /* bad query string */
  }
  const norm = (v: string | null | undefined): Lang | null => {
    const s = (v ?? '').toLowerCase();
    if (s.startsWith('zh')) return 'zh';
    if (s.startsWith('en')) return 'en';
    return null;
  };
  return norm(q) ?? norm(stored) ?? ((navLang ?? '').toLowerCase().startsWith('zh') ? 'zh' : 'en');
}

let current: Lang = 'en';
const listeners = new Set<(l: Lang) => void>();

export function getLang(): Lang {
  return current;
}

function saveLang(l: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, l);
  } catch {
    /* storage may be blocked (private mode, sandboxed iframe) */
  }
}

function loadLang(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Pick the starting language from the environment (call once at boot). A `?lang=` override is not persisted. */
export function initLang(search = typeof location !== 'undefined' ? location.search : '', navLang = typeof navigator !== 'undefined' ? navigator.language : undefined): Lang {
  current = detectLang(search, navLang, loadLang());
  applyDocument();
  return current;
}

/** Switch language. `persist` stores it as the user's preference. */
export function setLang(l: Lang, persist = true): void {
  if (l === current) return;
  current = l;
  if (persist) saveLang(l);
  applyDocument();
  for (const fn of [...listeners]) fn(l);
}

export function onLangChange(fn: (l: Lang) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function applyDocument(): void {
  if (typeof document === 'undefined') return;
  try {
    document.documentElement.lang = current === 'zh' ? 'zh-CN' : 'en';
    document.title = DICTIONARIES[current]['doc.title'];
  } catch {
    /* no DOM */
  }
}

// ---------------------------------------------------------------------------------------------------------------
// t()
// ---------------------------------------------------------------------------------------------------------------
export function format(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => {
    const v = params[k];
    return v === undefined ? m : String(v);
  });
}

/** Translate `key` in the current language. A numeric `n` param selects the `<key>.one` variant when n === 1 and one exists. */
export function t(key: MsgKey, params?: Params): string {
  return tIn(current, key, params);
}

/** Same as t() but for an explicit language (tests, formatting in both languages). */
export function tIn(lang: Lang, key: MsgKey, params?: Params): string {
  const dict = DICTIONARIES[lang];
  if (params && (params.n === 1 || params.v === 1)) {
    const one = `${key}.one` as MsgKey;
    if (one in dict) return format(dict[one], params);
  }
  const s = dict[key] ?? DICTIONARIES.en[key] ?? key;
  return format(s, params);
}

// ---------------------------------------------------------------------------------------------------------------
// Formatting helpers for the structured data the server / shared rules send
// ---------------------------------------------------------------------------------------------------------------
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n))}`;

/** One tip-breakdown part, e.g. { key: 'tip.early', secs: 18 } -> "18s early" / "提前 18s". */
export function formatTipPart(part: TipPart, lang: Lang = current): string {
  return tIn(lang, part.key, { pct: part.pct, secs: part.secs, bonus: part.bonus === undefined ? undefined : signed(part.bonus) });
}

/** "Intact 72% · 18s early · Dog woke up −8" */
export function formatTipParts(parts: readonly TipPart[], lang: Lang = current): string {
  return parts.map((p) => formatTipPart(p, lang)).join(' · ');
}

export function formatQuote(key: QuoteKey, lang: Lang = current): string {
  return tIn(lang, key);
}

export function formatCargoStatus(s: CargoStatus, lang: Lang = current): string {
  switch (s.kind) {
    case 'soup':
      return tIn(lang, 'cargo.soup', { pct: s.pct });
    case 'pizza':
      return tIn(lang, 'cargo.pizza', { boxes: s.boxes, size: s.size });
    case 'ice':
      return tIn(lang, 'cargo.ice', { scoops: s.scoops, size: s.size, meltPct: s.meltPct });
  }
}

export function awardTitle(id: AwardId, lang: Lang = current): string {
  return tIn(lang, `award.${id}.title`);
}

/** Award detail line from the raw value (tips ¥, counts, bowls, seconds, steady = 0..1 integrity). */
export function awardDetail(id: AwardId, value: number, lang: Lang = current): string {
  let v: string | number;
  switch (id) {
    case 'soup':
    case 'air':
      v = value.toFixed(1);
      break;
    case 'steady':
      v = Math.round(value * 100);
      break;
    default:
      v = Math.round(value);
  }
  return tIn(lang, `award.${id}.detail`, { v: id === 'crash' ? Math.round(value) : v });
}

type Named = Pick<Restaurant, 'name' | 'nameEn'> | Pick<Customer, 'name' | 'nameEn'>;

/** Restaurant / customer name in the current language. */
export function placeName(p: Named, lang: Lang = current): string {
  return lang === 'zh' ? p.name : p.nameEn;
}

/** A player's display name: what they typed, or the localized default ("Rider 2" / "骑手2") for the unnamed. */
export function playerName(p: { name: string; color: number }, lang: Lang = current): string {
  return p.name || tIn(lang, 'player.default', { n: p.color + 1 });
}

/** Server error code -> text. */
export function errorText(code: string, lang: Lang = current): string {
  const key = `err.${code}` as MsgKey;
  return key in DICTIONARIES[lang] ? tIn(lang, key) : String(code);
}

/** Transport failure code -> text (WsTransport rejects / reports 'timeout' | 'unreachable' | 'closed'). */
export function netText(code: string, lang: Lang = current): string {
  const key = `net.${code}` as MsgKey;
  return key in DICTIONARIES[lang] ? tIn(lang, key) : String(code);
}
