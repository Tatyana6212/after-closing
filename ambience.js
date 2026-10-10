(function () {
  'use strict';

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const toggle = document.getElementById('sound-toggle');
  const slider = document.getElementById('sound-volume');
  const level = document.getElementById('sound-level');
  let context = null;
  let master = null;
  let sceneBus = null;
  let enabled = false;
  let location = '';
  let theme = null;
  let noteIndex = 0;
  let musicTimer = null;
  let atmosphereTimer = null;
  let generation = 0;

  // Short notes and isolated effects only: no continuous oscillator or noise bed.
  // The room name is a stable seed, so every location in any TXT gets its own theme.
  function makeTheme(name) {
    let seed = 2166136261;
    for (const character of name) seed = Math.imul(seed ^ character.codePointAt(0), 16777619) >>> 0;
    const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
    const scales = [[0,2,3,7,10],[0,3,5,7,10],[0,2,5,7,9],[0,3,5,8,10]];
    const scale = scales[Math.floor(random()*scales.length)];
    const root = 174.61 * 2 ** (Math.floor(random()*7)/12);
    const melody = Array.from({length:8},(_,index)=>index===5?null:scale[Math.floor(random()*scale.length)]+(random()<0.16?12:0));
    return {root,melody,interval:1750+Math.floor(random()*7)*170,wave:random()<0.5?'sine':'triangle'};
  }

  function desiredGain() {
    return enabled && !document.hidden ? Number(slider.value) / 100 * 0.26 : 0;
  }

  function setGain() {
    if (!context || !master) return;
    master.gain.setTargetAtTime(desiredGain(), context.currentTime, 0.12);
  }

  function makeContext() {
    context = new AudioContextClass();
    master = context.createGain();
    master.gain.value = 0;
    master.connect(context.destination);
    sceneBus = context.createGain();
    sceneBus.connect(master);
  }

  function tone(frequency, start, length, strength, overtone = false) {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = overtone?'sine':theme.wave;
    oscillator.frequency.setValueAtTime(frequency, start);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.linearRampToValueAtTime(strength, start + 0.06);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + length);
    oscillator.connect(envelope);
    envelope.connect(sceneBus);
    oscillator.start(start);
    oscillator.stop(start + length + 0.02);
    if (!overtone) tone(frequency * 2.01, start, Math.min(length, 1.05), strength * 0.16, true);
  }

  function playMusic(token) {
    if (!enabled || document.hidden || token !== generation) return;
    const note = theme.melody[noteIndex++ % theme.melody.length];
    if (note !== null) tone(theme.root * 2 ** (note / 12), context.currentTime + 0.03, 1.2, 0.09);
    musicTimer = window.setTimeout(() => playMusic(token), theme.interval);
  }

  function shortNoise(duration, cutoff, strength) {
    const frames = Math.ceil(context.sampleRate * duration);
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) samples[i] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    const now = context.currentTime;
    source.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.linearRampToValueAtTime(strength, now + 0.025);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(sceneBus);
    source.start(now);
  }

  function atmosphere(token) {
    if (!enabled || document.hidden || token !== generation) return;
    if (location === 'Подвал') {
      const start = context.currentTime;
      const drop = context.createOscillator();
      const gain = context.createGain();
      drop.type = 'sine';
      drop.frequency.setValueAtTime(760, start);
      drop.frequency.exponentialRampToValueAtTime(430, start + 0.16);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.085, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
      drop.connect(gain);
      gain.connect(sceneBus);
      drop.start(start);
      drop.stop(start + 0.29);
    } else if (location === 'Холл' || location === 'Лестница') {
      shortNoise(0.09, 1250, 0.055); // distant clock click
    } else if (location === 'Чердак') {
      tone(138, context.currentTime, 0.5, 0.04); // brief timber creak
    } else {
      shortNoise(0.42, 610, 0.035); // soft page movement
    }
    atmosphereTimer = window.setTimeout(() => atmosphere(token), 14000 + Math.random() * 12000);
  }

  function stopTimers() {
    generation++;
    window.clearTimeout(musicTimer);
    window.clearTimeout(atmosphereTimer);
    musicTimer = null;
    atmosphereTimer = null;
  }

  function startTimers() {
    stopTimers();
    const token = generation;
    musicTimer = window.setTimeout(() => playMusic(token), 400);
    atmosphereTimer = window.setTimeout(() => atmosphere(token), 11000);
  }

  toggle.addEventListener('click', async () => {
    if (!AudioContextClass) {
      toggle.textContent = 'Звук недоступен';
      toggle.disabled = true;
      return;
    }
    if (enabled) {
      enabled = false;
      stopTimers();
      setGain();
      toggle.textContent = 'Включить звук';
      toggle.setAttribute('aria-pressed', 'false');
      return;
    }
    try {
      if (!context) makeContext();
      await context.resume();
      enabled = true;
      setGain();
      startTimers();
      toggle.textContent = 'Выключить звук';
      toggle.setAttribute('aria-pressed', 'true');
    } catch (_) {
      toggle.textContent = 'Звук недоступен';
      toggle.disabled = true;
    }
  });

  slider.addEventListener('input', () => {
    level.textContent = `${slider.value}%`;
    setGain();
  });

  document.addEventListener('visibilitychange', () => {
    if (!enabled) return;
    if (document.hidden) stopTimers();
    else startTimers();
    setGain();
  });

  window.QuestAudio = {
    setLocation(name) {
      if (name === location) return;
      location = name;
      theme = makeTheme(name);
      noteIndex = 0;
      if (!context) return;
      stopTimers();
      const oldBus = sceneBus;
      oldBus.gain.setTargetAtTime(0, context.currentTime, 0.12);
      window.setTimeout(() => oldBus.disconnect(), 1000);
      sceneBus = context.createGain();
      sceneBus.connect(master);
      if (enabled && !document.hidden) startTimers();
    }
  };
})();
