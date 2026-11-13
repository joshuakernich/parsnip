'use strict';

// Generative synthwave soundtrack, built entirely with Web Audio.
// A minor, 120 BPM, i–VI–III–VII. Sections: intro → groove → build → drop → breakdown → groove…
const Music = (() => {
  const BPM = 120;
  const STEP = 60 / BPM / 4; // one 16th note, seconds
  const LOOKAHEAD = 0.15;

  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const PROG = [
    { pad: [57, 60, 64], root: 33 }, // Am
    { pad: [57, 60, 65], root: 29 }, // F
    { pad: [55, 60, 64], root: 36 }, // C
    { pad: [55, 59, 62], root: 31 }, // G
  ];
  const PENTA = [69, 72, 74, 76, 79, 81, 84]; // A minor pentatonic, lead range

  let ctx = null, out, duck, padBus, padFilter, arpBus, bassBus, drumBus, leadBus, reverb, delay, noise;
  let playing = false, timer = 0, step = 0, nextTime = 0;
  let arpPattern = [], leadMotif = [];
  let onKick = null;

  // ---------- graph ----------
  function build(ac) {
    ctx = ac;
    const master = ctx.createGain();
    master.gain.value = 0.5;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 4;
    comp.attack.value = 0.004; comp.release.value = 0.2;
    master.connect(comp).connect(ctx.destination);
    out = master;

    // Stereo reverb from a generated impulse
    reverb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    reverb.buffer = ir;
    const revOut = ctx.createGain();
    revOut.gain.value = 0.32;
    reverb.connect(revOut).connect(out);

    // Ping-pong-ish dotted-8th delay with a darkening feedback loop
    delay = ctx.createDelay(2);
    delay.delayTime.value = STEP * 3;
    const fb = ctx.createGain(); fb.gain.value = 0.38;
    const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 2600;
    const pan = ctx.createStereoPanner(); pan.pan.value = 0.45;
    delay.connect(dl).connect(fb).connect(delay);
    const delOut = ctx.createGain(); delOut.gain.value = 0.3;
    dl.connect(pan).connect(delOut).connect(out);
    delOut.connect(reverb);

    // Sidechain "duck" bus for pad, arp and bass
    duck = ctx.createGain();
    duck.connect(out);

    padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass'; padFilter.frequency.value = 1400; padFilter.Q.value = 0.7;
    padBus = ctx.createGain(); padBus.gain.value = 0.16;
    padFilter.connect(padBus).connect(duck);
    padBus.connect(reverb);
    const lfo = ctx.createOscillator(), lfoAmt = ctx.createGain();
    lfo.frequency.value = 0.07; lfoAmt.gain.value = 700;
    lfo.connect(lfoAmt).connect(padFilter.frequency);
    lfo.start();

    arpBus = ctx.createGain(); arpBus.gain.value = 0.1;
    arpBus.connect(duck); arpBus.connect(delay); arpBus.connect(reverb);

    bassBus = ctx.createGain(); bassBus.gain.value = 0.32;
    bassBus.connect(duck);

    leadBus = ctx.createGain(); leadBus.gain.value = 0.11;
    leadBus.connect(out); leadBus.connect(delay); leadBus.connect(reverb);

    drumBus = ctx.createGain(); drumBus.gain.value = 0.8;
    drumBus.connect(out);

    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }

  // ---------- voices ----------
  function env(g, t, peak, a, d, sustain = 0.0001) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + d);
  }

  function kick(t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    env(g, t, 1.0, 0.002, 0.42);
    o.connect(g).connect(drumBus);
    o.start(t); o.stop(t + 0.5);
    // click
    const n = ctx.createBufferSource(), ng = ctx.createGain(), hp = ctx.createBiquadFilter();
    n.buffer = noise; hp.type = 'highpass'; hp.frequency.value = 3000;
    env(ng, t, 0.25, 0.001, 0.015);
    n.connect(hp).connect(ng).connect(drumBus);
    n.start(t); n.stop(t + 0.03);
    // sidechain pump
    duck.gain.cancelScheduledValues(t);
    duck.gain.setValueAtTime(0.3, t);
    duck.gain.linearRampToValueAtTime(1, t + 0.24);
    if (onKick) setTimeout(onKick, Math.max(0, (t - ctx.currentTime) * 1000));
  }

  function noiseHit(t, { type = 'highpass', freq = 8000, q = 0.7, peak = 0.2, decay = 0.05, pan = 0, verb = 0 }) {
    const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), p = ctx.createStereoPanner();
    n.buffer = noise; n.playbackRate.value = 0.9 + Math.random() * 0.2;
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    p.pan.value = pan;
    env(g, t, peak, 0.001, decay);
    n.connect(f).connect(g).connect(p).connect(drumBus);
    if (verb) { const s = ctx.createGain(); s.gain.value = verb; p.connect(s).connect(reverb); }
    n.start(t, Math.random() * 0.5); n.stop(t + decay + 0.05);
  }

  const hat = (t, open, vel = 1) => noiseHit(t, { freq: open ? 7000 : 9000, peak: (open ? 0.12 : 0.09) * vel, decay: open ? 0.22 : 0.04, pan: open ? -0.2 : 0.25 });

  function clap(t, vel = 1) {
    // a few tight bursts, then a tail into the reverb
    [0, 0.011, 0.022].forEach((o) => noiseHit(t + o, { type: 'bandpass', freq: 1500, q: 1.2, peak: 0.32 * vel, decay: 0.03 }));
    noiseHit(t + 0.03, { type: 'bandpass', freq: 1300, q: 0.9, peak: 0.26 * vel, decay: 0.18, verb: 0.6 });
  }

  function crash(t, peak = 0.22) {
    noiseHit(t, { freq: 4500, peak, decay: 1.8, verb: 0.8 });
  }

  function bass(t, note, len) {
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'lowpass'; f.Q.value = 6;
    f.frequency.setValueAtTime(180, t);
    f.frequency.exponentialRampToValueAtTime(1100, t + 0.012);
    f.frequency.exponentialRampToValueAtTime(220, t + len);
    env(g, t, 0.9, 0.004, len);
    f.connect(g).connect(bassBus);
    const saw = ctx.createOscillator(); saw.type = 'sawtooth'; saw.frequency.value = midi(note);
    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = midi(note);
    const subG = ctx.createGain(); subG.gain.value = 0.9;
    saw.connect(f); sub.connect(subG).connect(g);
    [saw, sub].forEach((o) => { o.start(t); o.stop(t + len + 0.05); });
  }

  function pad(t, notes, len) {
    notes.forEach((n, i) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.35);
      g.gain.setValueAtTime(0.5, t + len - 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.7);
      const p = ctx.createStereoPanner(); p.pan.value = (i - 1) * 0.5;
      g.connect(p).connect(padFilter);
      [-9, 0, 9].forEach((det) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth'; o.frequency.value = midi(n); o.detune.value = det + (Math.random() - 0.5) * 4;
        o.connect(g); o.start(t); o.stop(t + len + 0.8);
      });
    });
  }

  function arp(t, note, cutoff) {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = midi(note);
    f.type = 'lowpass'; f.Q.value = 4;
    f.frequency.setValueAtTime(cutoff, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(300, cutoff * 0.25), t + 0.16);
    env(g, t, 0.6, 0.003, 0.17);
    o.connect(f).connect(g).connect(arpBus);
    o.start(t); o.stop(t + 0.22);
  }

  function lead(t, note, len) {
    const g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 3200; f.Q.value = 1;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.55, t + 0.02);
    g.gain.setValueAtTime(0.5, t + len);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.18);
    f.connect(g).connect(leadBus);
    const vib = ctx.createOscillator(), vibAmt = ctx.createGain();
    vib.frequency.value = 5.5; vibAmt.gain.setValueAtTime(0, t); vibAmt.gain.linearRampToValueAtTime(14, t + 0.25);
    vib.connect(vibAmt);
    [-6, 6].forEach((det) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = midi(note); o.detune.value = det;
      vibAmt.connect(o.detune);
      o.connect(f); o.start(t); o.stop(t + len + 0.25);
    });
    vib.start(t); vib.stop(t + len + 0.25);
  }

  function riser(t, dur) {
    const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = noise; n.loop = true;
    f.type = 'bandpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(9000, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    n.connect(f).connect(g).connect(drumBus);
    g.connect(reverb);
    n.start(t); n.stop(t + dur + 0.1);
  }

  // ---------- composition ----------
  function newArp() {
    const shapes = [
      [0, 1, 2, 3, 4, 5, 4, 3, 0, 1, 2, 3, 4, 5, 4, 3],
      [0, 2, 1, 3, 2, 4, 3, 5, 0, 2, 1, 3, 2, 4, 3, 5],
      [0, 3, 1, 4, 2, 5, 1, 4, 0, 3, 1, 4, 2, 5, 3, 4],
      [5, 4, 3, 2, 1, 0, 1, 2, 5, 4, 3, 2, 3, 4, 5, 3],
    ];
    arpPattern = shapes[(Math.random() * shapes.length) | 0];
  }

  function newLead() {
    // 32 steps (2 bars); notes wander stepwise around the pentatonic
    const m = new Array(32).fill(null);
    let idx = 2 + ((Math.random() * 3) | 0);
    const rhythm = [0, 3, 6, 8, 10, 14, 16, 19, 22, 24, 26, 28];
    for (const s of rhythm) {
      if (Math.random() < 0.18) continue;
      idx = Math.max(0, Math.min(PENTA.length - 1, idx + [-2, -1, -1, 0, 1, 1, 2][(Math.random() * 7) | 0]));
      m[s] = PENTA[idx];
    }
    m[0] = m[0] || PENTA[2];
    leadMotif = m;
  }

  function section(bar) {
    if (bar < 4) return 'intro';
    const L = (bar - 4) % 32;
    if (L < 8) return 'groove';
    if (L < 12) return 'build';
    if (L < 28) return 'drop';
    return 'breakdown';
  }

  function playStep(s, t) {
    const bar = Math.floor(s / 16), pos = s % 16;
    const sec = section(bar);
    const chord = PROG[bar % 4];
    const L = bar < 4 ? bar : (bar - 4) % 32;

    if (pos === 0) {
      if (bar % 8 === 0) newArp();
      if (bar % 2 === 0) newLead();
      pad(t, chord.pad, STEP * 16);
      if (sec === 'drop' && L === 12) crash(t, 0.26);
      if (sec === 'build' && L === 8) riser(t, STEP * 64);
    }

    const drums = sec === 'groove' || sec === 'drop' || (sec === 'build' && L >= 10);
    if (drums && pos % 4 === 0) kick(t);
    if ((sec === 'groove' || sec === 'drop') && (pos === 4 || pos === 12)) clap(t);
    if (sec === 'drop') {
      hat(t, pos % 4 === 2, pos % 2 ? 0.6 : 1);
    } else if (sec === 'groove') {
      if (pos % 4 === 2) hat(t, false);
    }
    if (sec === 'build') {
      // snare roll: quarters → 8ths → 16ths
      const k = L - 8, every = k === 0 ? 4 : k === 1 ? 2 : 1;
      if (pos % every === 0) clap(t, 0.35 + (k * 16 + pos) / 64 * 0.6);
    }

    if (sec !== 'intro' && sec !== 'breakdown') {
      if (pos % 2 === 0) bass(t, chord.root + (pos % 8 === 6 ? 12 : 0), STEP * 1.6);
      else if (sec === 'drop' && pos % 4 === 3) bass(t, chord.root + 12, STEP * 0.8);
    }

    const tones = [...chord.pad, ...chord.pad.map((n) => n + 12)];
    const arpEvery = sec === 'breakdown' ? 2 : 1;
    if (pos % arpEvery === 0) {
      const cutoff = sec === 'intro' ? 600 + (bar * 16 + pos) * 30 : sec === 'breakdown' ? 1200 : sec === 'build' ? 1500 + (L - 8) * 900 : 3200;
      arp(t, tones[arpPattern[pos]] + 12, cutoff);
    }

    if (sec === 'drop') {
      const note = leadMotif[(bar % 2) * 16 + pos];
      if (note) lead(t, note, STEP * 2.2);
    }
  }

  function schedule() {
    while (nextTime < ctx.currentTime + LOOKAHEAD) {
      playStep(step, nextTime);
      nextTime += STEP;
      step++;
    }
  }

  return {
    get playing() { return playing; },
    set onKick(fn) { onKick = fn; },
    start(ac) {
      if (playing) return;
      if (!ctx) build(ac);
      if (ctx.state === 'suspended') ctx.resume();
      playing = true;
      step = 0;
      nextTime = ctx.currentTime + 0.1;
      out.gain.cancelScheduledValues(ctx.currentTime);
      out.gain.setValueAtTime(0.5, ctx.currentTime);
      newArp(); newLead();
      timer = setInterval(schedule, 25);
      schedule();
    },
    stop() {
      if (!playing) return;
      playing = false;
      clearInterval(timer);
      out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15);
    },
    // A cymbal splash for celebrations
    hit() { if (playing) crash(ctx.currentTime + 0.01, 0.3); },
  };
})();
