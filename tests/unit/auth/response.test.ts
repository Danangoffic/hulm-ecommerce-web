import { describe, it, expect } from "vitest";
import { apiSuccess, apiError } from "@/lib/auth/response";

describe("apiSuccess", () => {
  it("returns 200 by default", async () => {
    const res = apiSuccess({ foo: "bar" });
    expect(res.status).toBe(200);
  });

  it("returns the given status code", async () => {
    const res = apiSuccess({ id: 1 }, 201);
    expect(res.status).toBe(201);
  });

  it("body has success:true and data", async () => {
    const res = apiSuccess({ token: "abc" }, 200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ token: "abc" });
  });

  it("content-type is application/json", () => {
    const res = apiSuccess({});
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});

describe("apiError", () => {
  it("returns the given status code", async () => {
    const res = apiError("Not found", 404);
    expect(res.status).toBe(404);
  });

  it("body has success:false and error.message", async () => {
    const res = apiError("Unauthorized", 401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("Unauthorized");
  });

  it("includes details when provided", async () => {
    const res = apiError("Validation failed", 422, { email: ["Invalid"] });
    const body = await res.json();
    expect(body.error.details).toEqual({ email: ["Invalid"] });
  });

  it("omits details key when not provided", async () => {
    const res = apiError("Bad request", 400);
    const body = await res.json();
    expect(body.error).not.toHaveProperty("details");
  });

  it("content-type is application/json", () => {
    const res = apiError("Error", 500);
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});
