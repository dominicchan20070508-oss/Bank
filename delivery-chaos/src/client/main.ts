import { App, parseParams } from './app';
import { Sfx } from './audio';

declare global {
  interface Window {
    __game: {
      getState: App['getState'];
      debug: App['debug'];
      /** the real Sfx class, so QA can render its graph in an OfflineAudioContext (qa/v02.cjs, qa/audio-export.cjs) */
      Sfx: typeof Sfx;
    };
  }
}

const app = new App(parseParams(window.location.search));
// QA automation hooks (DESIGN §10.4)
window.__game = {
  getState: () => app.getState(),
  debug: app.debug,
  Sfx,
};
app.boot();
