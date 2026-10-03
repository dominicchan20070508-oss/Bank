// Quick-chat presets (DESIGN §14.3). Language-neutral: the network only carries these ids; each client shows the text
// from its own i18n table (`ping.<id>`). Order = wheel order = number keys 1..6.
export const PING_IDS = ['claim', 'help', 'wait', 'follow', 'thanks', 'nice'] as const;
export type PingId = (typeof PING_IDS)[number];

/** Emoji shown in the wheel, the speech bubble and the off-screen cue. */
export const PING_ICONS: Record<PingId, string> = {
  claim: '🙋',
  help: '🆘',
  wait: '⏳',
  follow: '👉',
  thanks: '🙏',
  nice: '👍',
};

export const isPingId = (v: unknown): v is PingId => typeof v === 'string' && (PING_IDS as readonly string[]).includes(v);
