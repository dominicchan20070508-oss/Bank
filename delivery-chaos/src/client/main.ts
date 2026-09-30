import { App, parseParams } from './app';

declare global {
  interface Window {
    __game: {
      getState: App['getState'];
      debug: App['debug'];
    };
  }
}

const app = new App(parseParams(window.location.search));
// QA automation hooks (DESIGN §10.4)
window.__game = {
  getState: () => app.getState(),
  debug: app.debug,
};
app.boot();
