/**
 * FlowProvider behavioural test.  We only care about ONE invariant
 * here: replacing the front photo MUST clear any stale side photos
 * — otherwise a user who retakes via the manual uploader would
 * accidentally send the old Smart Camera sides up with a fresh
 * front, producing a mismatched 3-image scan.
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FlowProvider, useFlow } from "./flow";

function wrapper({ children }: { children: React.ReactNode }) {
  return <FlowProvider>{children}</FlowProvider>;
}

function fakeFile(name: string) {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/jpeg" });
}

describe("FlowProvider", () => {
  it("setImageFile clears previously-set additionalImages", () => {
    const { result } = renderHook(() => useFlow(), { wrapper });

    act(() => {
      result.current.setImageFile(fakeFile("front-1.jpg"));
      result.current.setAdditionalImages({
        left: fakeFile("left-1.jpg"),
        right: fakeFile("right-1.jpg"),
      });
    });

    expect(result.current.additionalImages.left?.name).toBe("left-1.jpg");
    expect(result.current.additionalImages.right?.name).toBe("right-1.jpg");

    // Replacing the front photo must wipe the stale side photos.
    act(() => {
      result.current.setImageFile(fakeFile("front-2.jpg"));
    });

    expect(result.current.imageFile?.name).toBe("front-2.jpg");
    expect(result.current.additionalImages.left).toBeNull();
    expect(result.current.additionalImages.right).toBeNull();
  });

  it("reset() wipes both the front and the additional images", () => {
    const { result } = renderHook(() => useFlow(), { wrapper });

    act(() => {
      result.current.setImageFile(fakeFile("front.jpg"));
      result.current.setAdditionalImages({
        left: fakeFile("left.jpg"),
        right: fakeFile("right.jpg"),
      });
      result.current.reset();
    });

    expect(result.current.imageFile).toBeNull();
    expect(result.current.additionalImages.left).toBeNull();
    expect(result.current.additionalImages.right).toBeNull();
  });
});
