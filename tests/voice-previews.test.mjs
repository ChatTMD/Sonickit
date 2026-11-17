import assert from "node:assert/strict";
import { setupVoicePreviews } from "../voice-previews.js";

const players = Array.from({ length: 10 }, () => {
  const classes = new Set();
  const error = { hidden: true };
  const card = { classList: { add: value => classes.add(value), remove: value => classes.delete(value) }, querySelector: () => error };
  return {
    classes, error, events: {}, playing: false,
    closest: () => card,
    addEventListener(name, listener) { this.events[name] = listener; },
    pause() { this.playing = false; this.events.pause?.(); },
    play() { this.playing = true; this.events.play(); }
  };
});
setupVoicePreviews({ querySelectorAll: () => players });
players[0].play();
players[1].play();
assert.equal(players.filter(player => player.playing).length, 1);
assert.equal(players[0].classes.has("is-playing"), false);
assert.equal(players[1].classes.has("is-playing"), true);
players[1].events.ended();
assert.equal(players[1].classes.has("is-playing"), false);
players[2].play();
players[2].events.error();
assert.equal(players[2].error.hidden, false);
assert.equal(players[2].classes.has("is-playing"), false);
players[2].play();
assert.equal(players[2].error.hidden, true);
console.log("PASS: previews play exclusively, clear their playing state, and expose/recover from playback errors.");
