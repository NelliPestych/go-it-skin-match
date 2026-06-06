/** FormData contract for multi-image upload + 401 plumbing. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  api,
  isUnauthorized,
  setAuthToken,
  setOnUnauthorized,
  UnauthorizedError,
} from "./api";

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


describe("401 handling — one-shot global handler + isUnauthorized helper", () => {
  let onUnauth: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onUnauth = vi.fn();
    setOnUnauthorized(onUnauth);
    setAuthToken("expired.fake.token");
    fetchMock = vi.fn(async () =>
      jsonResponse({ detail: "Invalid or expired auth token" }, 401),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    setOnUnauthorized(null);
    setAuthToken(null);
    vi.restoreAllMocks();
  });

  it("fires the global handler exactly once across a burst of parallel 401s", async () => {
    const results = await Promise.allSettled([
      api.history(),
      api.details(1),
      api.plan(1),
    ]);
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    expect(onUnauth).toHaveBeenCalledTimes(1);
  });

  it("re-arms the one-shot guard whenever a fresh token is installed", async () => {
    await api.history().catch(() => undefined);
    expect(onUnauth).toHaveBeenCalledTimes(1);

    setAuthToken("a.new.token");
    await api.history().catch(() => undefined);
    expect(onUnauth).toHaveBeenCalledTimes(2);
  });

  it("throws UnauthorizedError and isUnauthorized recognises it", async () => {
    let caught: unknown = null;
    try {
      await api.history();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(UnauthorizedError);
    expect(isUnauthorized(caught)).toBe(true);
    expect(isUnauthorized(new Error("not auth"))).toBe(false);
    expect(isUnauthorized(null)).toBe(false);
  });
});
