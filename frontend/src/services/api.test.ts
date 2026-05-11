/**
 * Smoke coverage for the multi-image upload client.  We aren't
 * exercising real network — we stub `fetch` and assert the
 * outgoing FormData has the exact fields the backend expects
 * (`front` required, `left` / `right` omitted when absent).  This
 * is the most boring contract bug we could ship: a missing key
 * would make every Smart Camera upload silently fall through to
 * the 400 path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./api";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function fakeFile(name: string) {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/jpeg" });
}

describe("api.uploadAnalysisMulti", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn(async () =>
      jsonResponse({
        analysis_id: 1,
        features: {
          skin_type: "normal",
          redness_level: "low",
          hydration_level: "medium",
          pigmentation_level: "low",
          pores_score: 0.4,
          confidence_score: 0.7,
        },
        image_path: "uploads/x.jpg",
        image_front_path: "uploads/x.jpg",
        image_left_path: null,
        image_right_path: null,
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends only `front` when no side photos are supplied", async () => {
    await api.uploadAnalysisMulti({ front: fakeFile("front.jpg") });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/analysis/upload");
    expect(init.method).toBe("POST");

    const form = init.body as FormData;
    expect(form.get("front")).toBeInstanceOf(File);
    expect((form.get("front") as File).name).toBe("front.jpg");
    expect(form.get("left")).toBeNull();
    expect(form.get("right")).toBeNull();
    // No legacy single-image field on the multi path.
    expect(form.get("file")).toBeNull();
  });

  it("sends `front` + `left` + `right` when all three are present", async () => {
    await api.uploadAnalysisMulti({
      front: fakeFile("front.jpg"),
      left: fakeFile("left.jpg"),
      right: fakeFile("right.jpg"),
    });

    const form = fetchMock.mock.calls[0][1].body as FormData;
    expect((form.get("front") as File).name).toBe("front.jpg");
    expect((form.get("left") as File).name).toBe("left.jpg");
    expect((form.get("right") as File).name).toBe("right.jpg");
  });

  it("omits a side photo passed explicitly as null", async () => {
    await api.uploadAnalysisMulti({
      front: fakeFile("front.jpg"),
      left: null,
      right: fakeFile("right.jpg"),
    });

    const form = fetchMock.mock.calls[0][1].body as FormData;
    expect(form.get("left")).toBeNull();
    expect((form.get("right") as File).name).toBe("right.jpg");
  });

  it("throws a meaningful error when the backend returns 4xx", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ detail: "No image supplied. Send either `file` or `front`..." }, 400),
    );

    await expect(
      api.uploadAnalysisMulti({ front: fakeFile("front.jpg") }),
    ).rejects.toThrow(/no image supplied/i);
  });
});
