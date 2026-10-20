import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  VoicePreviewPlayer,
  type VoicePreviewSample,
  type VoicePreviewState,
} from './voicePreviewPlayer';

const sample: VoicePreviewSample = {
  url: 'https://audio.example.test/cove.mp3',
  duration: 1,
  levelInterval: 0.04,
  levels: '08f0',
};
class FakeAudio {
  src = '';
  preload = '';
  paused = true;
  currentTime = 0;
  onplaying: HTMLAudioElement['onplaying'] = null;
  onended: HTMLAudioElement['onended'] = null;
  onerror: HTMLAudioElement['onerror'] = null;
  onwaiting: HTMLAudioElement['onwaiting'] = null;
  loadCalls = 0;
  resolve!: () => void;
  reject!: (error: Error) => void;
  pending = new Promise<void>((resolve, reject) => {
    this.resolve = resolve;
    this.reject = reject;
  });
  play() {
    this.paused = false;
    return this.pending;
  }
  pause() {
    this.paused = true;
  }
  load() {
    this.loadCalls++;
  }
  removeAttribute(name: string) {
    if (name === 'src') this.src = '';
  }
  playing() {
    this.onplaying?.call(
      this as unknown as HTMLAudioElement,
      new Event('playing'),
    );
  }
}
function fixture() {
  const states: VoicePreviewState[] = [];
  const audios: FakeAudio[] = [];
  const player = new VoicePreviewPlayer(
    (state) => states.push(state),
    () => {
      const audio = new FakeAudio();
      audios.push(audio);
      return audio as unknown as HTMLAudioElement;
    },
  );
  return { player, states, audios };
}

test('preview plays only its static asset and reads RMS against playback time', async () => {
  const { player, states, audios } = fixture();
  assert.deepEqual(player.readLevels(), { input: 0, output: 0 });
  const play = player.toggle('cove', sample);
  const audio = audios[0];
  assert.equal(audio.src, sample.url);
  assert.deepEqual(states.at(-1), { voice: 'cove', phase: 'loading' });
  audio.playing();
  audio.resolve();
  await play;
  assert.deepEqual(states.at(-1), { voice: 'cove', phase: 'playing' });
  audio.currentTime = 0.08;
  assert.deepEqual(player.readLevels(), { input: 0, output: 1 });
  audio.currentTime = 99;
  assert.equal(player.readLevels().output, 0);
  audio.currentTime = NaN;
  assert.equal(player.readLevels().output, 0);
  player.dispose();
});

test('clicking again during loading stops the request; late rejection stays cancelled', async () => {
  const { player, states, audios } = fixture();
  const play = player.toggle('cove', sample);
  await player.toggle('cove', sample);
  assert.equal(audios.length, 1);
  assert.equal(audios[0].paused, true);
  assert.equal(audios[0].src, '');
  audios[0].reject(new Error('aborted'));
  await play;
  assert.deepEqual(states.at(-1), { voice: null, phase: 'idle' });
});

test('switching voices prevents stale events and rejected play from replacing the new voice', async () => {
  const { player, states, audios } = fixture();
  const first = player.toggle('cove', sample);
  const stalePlaying = audios[0].onplaying;
  const second = player.toggle('ember', {
    ...sample,
    url: 'https://audio.example.test/ember.mp3',
  });
  stalePlaying?.call(
    audios[0] as unknown as HTMLAudioElement,
    new Event('playing'),
  );
  audios[0].reject(new Error('interrupted'));
  await first;
  assert.equal(audios[0].paused, true);
  assert.deepEqual(states.at(-1), { voice: 'ember', phase: 'loading' });
  audios[1].playing();
  audios[1].resolve();
  await second;
  assert.deepEqual(states.at(-1), { voice: 'ember', phase: 'playing' });
  player.dispose();
});

test('ending a preview releases its media and returns the orb to zero', async () => {
  const { player, states, audios } = fixture();
  const play = player.toggle('cove', sample);
  const audio = audios[0];
  audio.playing();
  audio.resolve();
  await play;
  audio.onended?.call(audio as unknown as HTMLAudioElement, new Event('ended'));
  assert.deepEqual(states.at(-1), { voice: null, phase: 'idle' });
  assert.equal(audio.loadCalls, 1);
  assert.deepEqual(player.readLevels(), { input: 0, output: 0 });
});

test('failed audio can retry without a late previous callback breaking playback', async () => {
  const { player, states, audios } = fixture();
  const first = player.toggle('cove', sample);
  audios[0].reject(new Error('network failure'));
  await first;
  assert.deepEqual(states.at(-1), { voice: 'cove', phase: 'error' });
  const retry = player.toggle('cove', sample);
  audios[1].playing();
  audios[1].resolve();
  await retry;
  assert.deepEqual(states.at(-1), { voice: 'cove', phase: 'playing' });
  player.dispose();
});

test('a stalled load times out rather than staying in loading indefinitely', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { player, states, audios } = fixture();
  const play = player.toggle('cove', sample);
  t.mock.timers.tick(12_000);
  assert.deepEqual(states.at(-1), { voice: 'cove', phase: 'error' });
  assert.equal(audios[0].paused, true);
  audios[0].reject(new Error('request cancelled'));
  await play;
});

test('disposing on navigation detaches every handler without setting state after unmount', async () => {
  const { player, states, audios } = fixture();
  const play = player.toggle('cove', sample);
  const count = states.length;
  player.dispose();
  assert.equal(audios[0].onplaying, null);
  assert.equal(audios[0].onwaiting, null);
  assert.equal(audios[0].onended, null);
  assert.equal(audios[0].onerror, null);
  audios[0].reject(new Error('navigation'));
  await play;
  assert.equal(states.length, count);
  assert.equal(player.readLevels().output, 0);
});
