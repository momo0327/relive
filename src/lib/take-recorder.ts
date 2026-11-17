import type { CameraView } from 'expo-camera';

import { limits } from './config';

type Take = { started: number; clips: string[]; flipping: boolean };

export type RecorderHooks = {
  camera: () => CameraView | null;
  /** Switch front/back camera (React state). The recorder waits for `cameraSwitched()`. */
  switchCamera: () => void;
  onStart: (startedAt: number) => void;
  /** Recording over: the clips (oldest first) and total length; empty if nothing recorded. */
  onFinish: (clips: string[], durationMs: number) => void;
};

/**
 * One recording that may span several clips: flipping the camera mid-recording
 * ends the current clip (only once it's safely written), switches camera and
 * records the next one. The caller joins the clips afterwards.
 * Kept outside React so timing and refs stay simple.
 */
export class TakeRecorder {
  /** Latest handlers from the camera screen (set in an effect). */
  hooks: RecorderHooks | null = null;

  private take: Take | null = null;
  private switched: (() => void) | null = null;

  get recording() {
    return this.take != null;
  }

  start() {
    if (this.take || !this.hooks?.camera()) return;
    const take: Take = { started: Date.now(), clips: [], flipping: false };
    this.take = take;
    this.hooks.onStart(take.started);
    void this.record(take);
  }

  stop() {
    if (!this.take) return;
    this.take.flipping = false;
    this.hooks?.camera()?.stopRecording();
  }

  /** Flip mid-recording. Returns false if not recording (caller flips normally). */
  flip() {
    if (!this.take) return false;
    if (!this.take.flipping) {
      this.take.flipping = true;
      this.hooks?.camera()?.stopRecording();
    }
    return true;
  }

  /** Called when the camera reports its lenses, i.e. it's running. */
  cameraSwitched() {
    this.switched?.();
  }

  private async record(take: Take): Promise<void> {
    const camera = this.hooks?.camera();
    const left = limits.maxVideoSeconds - (Date.now() - take.started) / 1000;
    if (camera && left > 0.5) {
      try {
        const result = await camera.recordAsync({ maxDuration: left, maxFileSize: limits.maxUploadBytes });
        if (result?.uri) take.clips.push(result.uri);
      } catch {
        // This clip didn't record; keep the others.
      }
    }
    const timeLeft = limits.maxVideoSeconds * 1000 - (Date.now() - take.started);
    if (take.flipping && this.take === take && timeLeft > 800) {
      take.flipping = false;
      await this.waitForSwitch();
      if (this.take === take) return this.record(take);
    }
    this.take = null;
    this.hooks?.onFinish(take.clips, Math.min(Date.now() - take.started, limits.maxVideoSeconds * 1000));
  }

  private waitForSwitch() {
    return new Promise<void>((resolve) => {
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        this.switched = null;
        // A moment for the new camera's first frames.
        setTimeout(resolve, 150);
      };
      this.switched = done;
      this.hooks?.switchCamera();
      setTimeout(done, 1200);
    });
  }
}

/** The camera screen's recorder (one camera screen exists at a time). */
export const takeRecorder = new TakeRecorder();
