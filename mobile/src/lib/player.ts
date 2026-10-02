import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioStatus } from "expo-audio";
import { create } from "zustand";

/*
  مشغّل صوت واحد للتطبيق كله (تلاوات، أدعية، أذكار): يستمر في الخلفية وبقفل الشاشة مع أزرار شاشة القفل
  (على Android يلزم تفعيلها وإلا يتوقف الصوت بعد ~3 دقائق في الخلفية). لا يُنشأ إلا عند أول تشغيل.
*/
export interface NowPlaying { id: string; title: string; subtitle: string; uri: string }

interface PlayerState {
  track: NowPlaying | null;
  playing: boolean;
  buffering: boolean;
  position: number;
  duration: number;
  play: (track: NowPlaying) => Promise<void>;
  toggle: () => void;
  stop: () => void;
}

let player: AudioPlayer | null = null;

async function ensurePlayer(onStatus: (s: AudioStatus) => void): Promise<AudioPlayer> {
  if (player) return player;
  await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: "doNotMix" });
  player = createAudioPlayer(null, { updateInterval: 500 });
  player.addListener("playbackStatusUpdate", onStatus);
  return player;
}

export const usePlayer = create<PlayerState>((set, get) => ({
  track: null,
  playing: false,
  buffering: false,
  position: 0,
  duration: 0,
  play: async (track) => {
    const p = await ensurePlayer((s) =>
      set({ playing: s.playing, buffering: s.isBuffering, position: s.currentTime, duration: s.duration, ...(s.didJustFinish ? { playing: false } : {}) }),
    );
    if (get().track?.id === track.id) {
      p.play();
      return;
    }
    set({ track, playing: false, buffering: true, position: 0, duration: 0 });
    p.replace({ uri: track.uri });
    p.setActiveForLockScreen(true, { title: track.title, artist: track.subtitle, albumTitle: "سند" });
    p.play();
  },
  toggle: () => {
    if (!player || !get().track) return;
    if (player.playing) player.pause();
    else player.play();
  },
  stop: () => {
    if (player) {
      player.pause();
      player.clearLockScreenControls();
    }
    set({ track: null, playing: false, buffering: false, position: 0, duration: 0 });
  },
}));
