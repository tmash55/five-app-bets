import { useEffect, useRef } from 'react';
import { AppState, Pressable, type GestureResponderEvent, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import { tapFeedback } from '@/fx/feedback';
import { DENSITY, GLSurface } from './GLSurface';
import { StageRenderer, type StageFocus, type StageSetup } from './render/stage';
import { waitForGL, type GLContextLike } from './runner';
import type { StageAct } from './stage/director';

interface Props {
  setup: StageSetup;
  /** where the group stands on this view, as fractions of its size */
  focus: StageFocus;
  /** the first frame has been drawn */
  onReady: () => void;
  /** GL could not be used: the parent shows something else */
  onError: (e: unknown) => void;
  /** a tap that missed every figure */
  onPressEmpty?: () => void;
  style?: StyleProp<ViewStyle>;
}

interface Loop {
  renderer: StageRenderer | null;
  gl: GLContextLike | null;
  raf: number;
  last: number;
  ready: boolean;
  dead: boolean;
  active: boolean;
  width: number;
  height: number;
  start: () => void;
  fail: (e: unknown) => void;
  build: () => void;
}

const nothing = () => {};

/**
 * The live warm-up stage: its own GL view and frame loop. The frame loop stops
 * while the app is in the background; the parent unmounts the view whenever
 * its screen is covered, which frees the GL context. It never throws: any GL
 * failure goes to `onError`.
 */
export function StageView({ setup, focus, onReady, onError, onPressEmpty, style }: Props) {
  const loop = useRef<Loop>({ renderer: null, gl: null, raf: 0, last: -1, ready: false, dead: false, active: AppState.currentState !== 'background', width: 1, height: 1, start: nothing, fail: nothing, build: nothing });
  const props = useRef({ setup, focus, onReady, onError, onPressEmpty });

  useEffect(() => {
    props.current = { setup, focus, onReady, onError, onPressEmpty };
  });

  useEffect(() => {
    const L = loop.current;
    const fail = (e: unknown) => {
      if (L.dead) return;
      L.dead = true;
      if (L.raf) cancelAnimationFrame(L.raf);
      L.raf = 0;
      props.current.onError(e);
    };
    const frame = (now: number) => {
      L.raf = 0;
      const r = L.renderer;
      const gl = L.gl;
      if (!r || !gl || L.dead || !L.active) return;
      try {
        waitForGL(gl);
        let dt = L.last < 0 ? 0 : (now - L.last) / 1000;
        L.last = now;
        if (dt > 0.1) dt = 0.1;
        r.resize(gl.drawingBufferWidth, gl.drawingBufferHeight);
        r.setFocus(props.current.focus);
        r.render(dt);
        gl.endFrameEXP?.();
      } catch (e) {
        fail(e);
        return;
      }
      if (!L.ready) {
        L.ready = true;
        props.current.onReady();
      }
      L.raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (L.raf || L.dead || !L.renderer || !L.active) return;
      L.last = -1;
      L.raf = requestAnimationFrame(frame);
    };
    const build = () => {
      if (L.dead || L.renderer || !L.gl) return;
      try {
        L.renderer = new StageRenderer(L.gl, props.current.setup);
      } catch (e) {
        fail(e);
        return;
      }
      start();
    };
    L.dead = false;
    L.ready = false;
    L.start = start;
    L.fail = fail;
    L.build = build;
    // on web the context can arrive before this effect runs, and a fast refresh runs it again over the same context
    build();
    const sub = AppState.addEventListener('change', (state) => {
      L.active = state === 'active';
      if (L.active) start();
      else if (L.raf) {
        cancelAnimationFrame(L.raf);
        L.raf = 0;
      }
    });
    if (__DEV__) {
      (globalThis as Record<string, unknown>).__stage = {
        get renderer() {
          return L.renderer;
        },
        /** play an act on a figure now */
        force: (i: number, act: StageAct) => L.renderer?.force(i, act),
        /** move the show on by `seconds` (in 1/60 s steps) and draw once */
        step: (seconds: number) => {
          const r = L.renderer;
          if (!r) return -1;
          const n = Math.round(seconds * 60);
          for (let k = 0; k < n; k++) r.render(1 / 60, k === n - 1);
          return r.stageTime;
        },
        acts: () => L.renderer?.describe(),
        programs: () => (L.renderer ? { warm: L.renderer.warmPrograms, now: L.renderer.programs } : null),
        poke: (i: number) => L.renderer?.poke(i),
      };
    }
    return () => {
      sub.remove();
      L.dead = true;
      if (L.raf) cancelAnimationFrame(L.raf);
      L.raf = 0;
      try {
        L.renderer?.dispose();
      } catch {
        // the context may already be gone
      }
      L.renderer = null;
      L.build = nothing;
      if (__DEV__) {
        const g = globalThis as Record<string, unknown>;
        if ((g.__stage as { renderer?: unknown } | undefined)?.renderer === null) delete g.__stage;
      }
    };
  }, []);

  const onContextCreate = (raw: unknown) => {
    const L = loop.current;
    L.gl = raw as GLContextLike;
    L.build();
  };

  const onLayout = (e: LayoutChangeEvent) => {
    loop.current.width = e.nativeEvent.layout.width;
    loop.current.height = e.nativeEvent.layout.height;
  };

  const onPress = (e: GestureResponderEvent) => {
    const L = loop.current;
    const r = L.renderer;
    // a click on web carries no locationX; its offset is the same thing
    const ne = e.nativeEvent as { locationX?: number; locationY?: number; offsetX?: number; offsetY?: number };
    const x = (Number.isFinite(ne.locationX) ? (ne.locationX as number) : (ne.offsetX ?? -1)) / Math.max(1, L.width);
    const y = (Number.isFinite(ne.locationY) ? (ne.locationY as number) : (ne.offsetY ?? -1)) / Math.max(1, L.height);
    const hit = r ? r.pick(x, y) : -1;
    if (r && hit >= 0) {
      if (r.poke(hit)) tapFeedback();
      return;
    }
    props.current.onPressEmpty?.();
  };

  return (
    <Pressable style={style} onPress={onPress} onLayout={onLayout} accessibilityRole="button" accessibilityLabel="Your squad warming up. Tap a player to say hi.">
      <GLSurface density={DENSITY.stage} onContextCreate={onContextCreate} />
    </Pressable>
  );
}
