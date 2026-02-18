let audioContext: AudioContext | null = null;
let activeNodes: AudioNode[] = [];
let lastPlayedAt = 0;

const MIN_PLAY_INTERVAL_MS = 120;

function cleanupAudioNodes() {
  for (const node of activeNodes) {
    try {
      // Disconnect any active nodes before creating the next pop.
      node.disconnect();
    } catch {
      // Ignore cleanup errors from already-disconnected nodes.
    }
  }
  activeNodes = [];
}

export function playCompletionPopSound(enabled: boolean): void {
  if (!enabled) return;
  if (typeof window === "undefined") return;

  const now = Date.now();
  if (now - lastPlayedAt < MIN_PLAY_INTERVAL_MS) return;
  lastPlayedAt = now;

  const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;

  try {
    audioContext ??= new AudioCtx();
    if (audioContext.state === "suspended") {
      void audioContext.resume();
    }

    const start = audioContext.currentTime + 0.002;
    const duration = 0.08;

    cleanupAudioNodes();

    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(740, start);
    osc.frequency.exponentialRampToValueAtTime(520, start + duration);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1800, start);
    filter.Q.setValueAtTime(0.9, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.06, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioContext.destination);

    activeNodes = [osc, filter, gain];

    osc.start(start);
    osc.stop(start + duration + 0.01);
    osc.onended = cleanupAudioNodes;
  } catch {
    // Swallow playback errors to avoid noisy logs in normal UX paths.
  }
}
