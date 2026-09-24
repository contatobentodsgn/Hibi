export type MascotAnimationState =
  | 'idle'
  | 'idle-curious'
  | 'idle-wander'
  | 'idle-sleep'
  | 'listening'
  | 'thinking'
  | 'working'
  | 'result'
  | 'confirmation'
  | 'error'
  | 'reminder'
  | 'completed'
  | 'focus-bored'
  | 'focus-normal'
  | 'focus-excited'
  | 'focus-music';

type MascotAnimation = Readonly<{ kind: 'video'; url: string }>;

const mascotVideos: Readonly<Record<MascotAnimationState, MascotAnimation>> = {
  idle: { kind: 'video', url: '/mascot/idle.mp4' },
  'idle-curious': { kind: 'video', url: '/mascot/idle_curious.mp4' },
  'idle-wander': { kind: 'video', url: '/mascot/idle_wander.mp4' },
  'idle-sleep': { kind: 'video', url: '/mascot/sleep.mp4' },
  listening: { kind: 'video', url: '/mascot/listening.mp4' },
  thinking: { kind: 'video', url: '/mascot/idle_curious.mp4' },
  working: { kind: 'video', url: '/mascot/focus.mp4' },
  result: { kind: 'video', url: '/mascot/happy_1.mp4' },
  confirmation: { kind: 'video', url: '/mascot/listening.mp4' },
  error: { kind: 'video', url: '/mascot/sad_1.mp4' },
  reminder: { kind: 'video', url: '/mascot/listening.mp4' },
  completed: { kind: 'video', url: '/mascot/happy_1.mp4' },
  'focus-bored': { kind: 'video', url: '/mascot/idle_curious.mp4' },
  'focus-normal': { kind: 'video', url: '/mascot/focus.mp4' },
  'focus-excited': { kind: 'video', url: '/mascot/happy_2.mp4' },
  'focus-music': { kind: 'video', url: '/mascot/listening.mp4' },
};

export function mascotAnimationFor(state: MascotAnimationState): MascotAnimation {
  return mascotVideos[state];
}
