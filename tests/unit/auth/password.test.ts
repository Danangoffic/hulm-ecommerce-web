import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("hashPassword", () => {
  it("returns a bcrypt hash string", async () => {
    const hash = await hashPassword("MyPassword1");
    expect(hash).toMatch(/^\$2[aby]\$\d+\$/);
  });

  it("produces a different hash each call (random salt)", async () => {
    const hash1 = await hashPassword("MyPassword1");
    const hash2 = await hashPassword("MyPassword1");
    expect(hash1).not.toBe(hash2);
  });

  it("hash is not the plain text", async () => {
    const plain = "MyPassword1";
    const hash = await hashPassword(plain);
    expect(hash).not.toBe(plain);
  });
});

describe("verifyPassword", () => {
  it("returns true for correct password", async () => {
    const hash = await hashPassword("MyPassword1");
    expect(await verifyPassword("MyPassword1", hash)).toBe(true);
  });

  it("returns false for wrong password", async () => {
    const hash = await hashPassword("MyPassword1");
    expect(await verifyPassword("WrongPassword1", hash)).toBe(false);
  });

  it("returns false for empty string against a real hash", async () => {
    const hash = await hashPassword("MyPassword1");
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("is case-sensitive", async () => {
    const hash = await hashPassword("MyPassword1");
    expect(await verifyPassword("mypassword1", hash)).toBe(false);
  });
});
