/** useVideoSettled — reveal-gating while the camera format ramps. */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useVideoSettled } from "./useVideoSettled";

/** Minimal HTMLVideoElement stub with dispatchable listeners. */
function makeVideo() {
  const listeners: Record<string, Set<() => void>> = {};
  return {
    paused: true,
    videoWidth: 640,
    videoHeight: 480,
    addEventListener: (t: string, cb: () => void) => {
      (listeners[t] ??= new Set()).add(cb);
    },
    removeEventListener: (t: string, cb: () => void) => {
      listeners[t]?.delete(cb);
    },
    fire(t: string) {
      listeners[t]?.forEach((cb) => cb());
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("useVideoSettled", () => {
  it("stays false until the preview holds steady for the stable window", () => {
    vi.useFakeTimers();
    const video = makeVideo();
    const { result } = renderHook(() => useVideoSettled(video as never, true));

    expect(result.current).toBe(false);
    act(() => video.fire("playing"));
    expect(result.current).toBe(false); // window armed, not elapsed
    act(() => vi.advanceTimersByTime(600));
    expect(result.current).toBe(true);
  });

  it("restarts the window on a format ramp (resize)", () => {
    vi.useFakeTimers();
    const video = makeVideo();
    const { result } = renderHook(() => useVideoSettled(video as never, true));

    act(() => video.fire("playing"));
    act(() => vi.advanceTimersByTime(400)); // partway through
    act(() => video.fire("resize")); // ramp → re-arm
    act(() => vi.advanceTimersByTime(400)); // 400ms since resize — not yet
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(200)); // now 600ms since resize
    expect(result.current).toBe(true);
  });

  it("reveals via the hard fallback even if no events ever fire", () => {
    vi.useFakeTimers();
    const video = makeVideo();
    const { result } = renderHook(() => useVideoSettled(video as never, true));

    act(() => vi.advanceTimersByTime(2500));
    expect(result.current).toBe(true);
  });

  it("is false when inactive or no element", () => {
    const { result: a } = renderHook(() => useVideoSettled(null, true));
    expect(a.current).toBe(false);
    const video = makeVideo();
    const { result: b } = renderHook(() => useVideoSettled(video as never, false));
    expect(b.current).toBe(false);
  });
});
