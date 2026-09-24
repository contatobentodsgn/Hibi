export const PIXANO_CHARACTER_VERSION = '1.0.0';

const list = <T extends string>(...items: T[]) => items;
export const BODY_STATES = list('body_01_standing_front','body_02_sitting_front','body_03_three_quarter_left','body_04_three_quarter_right','body_05_side_left','body_06_side_right','body_07_back','body_08_walking','body_09_running','body_10_jumping','body_11_lying','body_12_loaf','body_13_stretching','body_14_paw_up','body_15_looking_up','body_16_curious_lean','body_17_sneaking','body_18_proud','body_19_shy','body_20_resting');
export const EYES_STATES = list('eyes_01_neutral','eyes_02_happy','eyes_03_very_happy','eyes_04_excited','eyes_05_focused','eyes_06_sleepy','eyes_07_sleeping','eyes_08_sad','eyes_09_worried','eyes_10_surprised','eyes_11_confused','eyes_12_curious','eyes_13_angry','eyes_14_proud','eyes_15_shy','eyes_16_blink','eyes_17_wink_left','eyes_18_wink_right','eyes_19_heart','eyes_20_stars','eyes_21_tears','eyes_22_sparkle','eyes_23_dizzy','eyes_24_closed_smile','eyes_25_closed_focus','eyes_26_side_left','eyes_27_side_right','eyes_28_look_up','eyes_29_look_down','eyes_30_looking_sideways');
export const EARS_STATES = list('ears_01_relaxed','ears_02_alert','ears_03_happy','ears_04_back','ears_05_curious','ears_06_sleepy','ears_07_surprised','ears_08_angry','ears_09_shy','ears_10_moving');
export const TAIL_STATES = list('tail_01_normal','tail_02_happy','tail_03_excited','tail_04_sad','tail_05_worried','tail_06_curled','tail_07_raised','tail_08_tucked');
export const PROP_STATES = list('prop_01_none','prop_02_phone','prop_03_tablet','prop_04_laptop','prop_05_book','prop_06_coffee','prop_07_water','prop_08_pencil','prop_09_clipboard','prop_10_calendar','prop_11_checklist','prop_12_clock','prop_13_bell','prop_14_mail','prop_15_message','prop_16_folder','prop_17_folder_open','prop_18_target','prop_19_star','prop_20_trophy','prop_21_medal','prop_22_gift','prop_23_heart','prop_24_sparkle','prop_25_lightbulb','prop_26_warning','prop_27_error','prop_28_sun','prop_29_moon','prop_30_cloud','prop_31_plant','prop_32_headphones','prop_33_brush','prop_34_camera','prop_35_microphone','prop_36_key','prop_37_lock','prop_38_puzzle','prop_39_flag','prop_40_custom');
export const FX_STATES = list('fx_01_none','fx_02_sparkles','fx_03_confetti','fx_04_heart_burst','fx_05_star_burst','fx_06_success_ring','fx_07_error_flash','fx_08_warning_pulse','fx_09_attention_lines','fx_10_focus_ring','fx_11_progress_ring','fx_12_sleep_z','fx_13_sweat_drop','fx_14_teardrop','fx_15_exclamation','fx_16_question','fx_17_glow','fx_18_trail','fx_19_dust','fx_20_custom');

export type PixanoMode = 'companion'|'focus'|'tasks'|'calendar'|'finance'|'habits'|'streaks'|'system';
export type PixanoEmotion = 'neutral'|'happy'|'focused'|'sad'|'worried'|'surprised'|'confused'|'proud'|'sleepy'|'excited'|'angry';
export type PixanoCelebration = 'none'|'small'|'medium'|'large'|'extra_large';
export type PixanoIntensity = 1|2|3|4;
export type PixanoBody = typeof BODY_STATES[number];
export type PixanoEyes = typeof EYES_STATES[number];
export type PixanoEars = typeof EARS_STATES[number];
export type PixanoTail = typeof TAIL_STATES[number];
export type PixanoProp = typeof PROP_STATES[number];
export type PixanoFx = typeof FX_STATES[number];

export type PixanoViewModel = { mode: PixanoMode; body: PixanoBody; eyes: PixanoEyes; ears: PixanoEars; tail: PixanoTail; propPrimary: PixanoProp; propSecondary: PixanoProp; fx: PixanoFx; emotion: PixanoEmotion; celebration: PixanoCelebration; intensity: PixanoIntensity; progress: number; focusProgress: number; idleSeconds: number; isInteracting: boolean; isFocused: boolean; isSleeping: boolean; isOffline: boolean; isReduceMotion: boolean; accent: string };
export const DEFAULT_PIXANO_VIEW_MODEL: PixanoViewModel = { mode:'companion', body:'body_01_standing_front', eyes:'eyes_01_neutral', ears:'ears_01_relaxed', tail:'tail_01_normal', propPrimary:'prop_01_none', propSecondary:'prop_01_none', fx:'fx_01_none', emotion:'neutral', celebration:'none', intensity:1, progress:0, focusProgress:0, idleSeconds:0, isInteracting:false, isFocused:false, isSleeping:false, isOffline:false, isReduceMotion:false, accent:'#FFFFFF' };
export const PIXANO_PRESETS = { deep_focus:{ ...DEFAULT_PIXANO_VIEW_MODEL, mode:'focus', body:'body_02_sitting_front', eyes:'eyes_05_focused', ears:'ears_05_curious', emotion:'focused', intensity:3, isFocused:true, propPrimary:'prop_04_laptop', fx:'fx_10_focus_ring' }, perfect_session:{ ...DEFAULT_PIXANO_VIEW_MODEL, mode:'system', body:'body_10_jumping', eyes:'eyes_04_excited', ears:'ears_03_happy', tail:'tail_03_excited', emotion:'excited', intensity:4, celebration:'large', fx:'fx_03_confetti', propPrimary:'prop_20_trophy' }, missed_task:{ ...DEFAULT_PIXANO_VIEW_MODEL, mode:'tasks', body:'body_19_shy', eyes:'eyes_09_worried', emotion:'worried', intensity:2, fx:'fx_08_warning_pulse' }, budget_exceeded:{ ...DEFAULT_PIXANO_VIEW_MODEL, mode:'finance', body:'body_14_paw_up', eyes:'eyes_13_angry', ears:'ears_08_angry', emotion:'angry', intensity:3, fx:'fx_07_error_flash', propPrimary:'prop_27_error' }, pet:{ ...DEFAULT_PIXANO_VIEW_MODEL, body:'body_02_sitting_front', eyes:'eyes_02_happy', ears:'ears_03_happy', tail:'tail_02_happy', emotion:'happy', intensity:2, isInteracting:true, fx:'fx_04_heart_burst' } } satisfies Record<string, PixanoViewModel>;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export function normalizePixanoViewModel(model: PixanoViewModel): PixanoViewModel { return { ...model, intensity: clamp(model.intensity,1,4) as PixanoIntensity, progress:clamp(model.progress,0,100), focusProgress:clamp(model.focusProgress,0,100), idleSeconds:Math.max(0,model.idleSeconds) }; }
export function resolvePixanoComposition(model: PixanoViewModel) { const side = model.body.includes('side_'); const back = model.body === 'body_07_back'; return { ...model, eyes: side ? 'eyes_30_looking_sideways' as PixanoEyes : model.eyes, eyesVisible: !back, propsVisible: !back && !side }; }

/** Maps the current media-based companion states to the future modular Rive VM. */
export function viewModelForCompanionState(state: 'working'|'idle'|'completed'|'reminder'): PixanoViewModel {
  if (state === 'working') return { ...PIXANO_PRESETS.deep_focus, fx:'fx_01_none', celebration:'none' };
  if (state === 'completed') return PIXANO_PRESETS.perfect_session;
  if (state === 'reminder') return { ...PIXANO_PRESETS.missed_task, mode:'system', emotion:'surprised', propPrimary:'prop_13_bell', fx:'fx_09_attention_lines' };
  return DEFAULT_PIXANO_VIEW_MODEL;
}
