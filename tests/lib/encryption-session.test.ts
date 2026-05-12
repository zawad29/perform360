import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.unmock("@/lib/encryption-session");
vi.unmock("@/lib/encryption");

describe("Encryption Session", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env.NEXTAUTH_SECRET = "test-secret-key-for-session-encryption";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  async function getModule() {
    const mod = await import("@/lib/encryption-session");
    return mod;
  }

  describe("encryptDataKeyForCookie / decryptDataKeyFromCookie", () => {
    it("round-trips a data key correctly", async () => {
      const { encryptDataKeyForCookie, decryptDataKeyFromCookie } = await getModule();
      const dataKey = Buffer.alloc(32, "a");

      const cookieValue = encryptDataKeyForCookie(dataKey, 2);
      expect(typeof cookieValue).toBe("string");
      expect(cookieValue.length).toBeGreaterThan(0);

      const decrypted = decryptDataKeyFromCookie(cookieValue);
      expect(decrypted).not.toBeNull();
      expect(decrypted!.equals(dataKey)).toBe(true);
    });

    it("produces different ciphertexts for same key (IV randomness)", async () => {
      const { encryptDataKeyForCookie } = await getModule();
      const dataKey = Buffer.alloc(32, "b");

      const cookie1 = encryptDataKeyForCookie(dataKey);
      const cookie2 = encryptDataKeyForCookie(dataKey);
      expect(cookie1).not.toBe(cookie2);
    });

    it("returns null for tampered cookie", async () => {
      const { encryptDataKeyForCookie, decryptDataKeyFromCookie } = await getModule();
      const dataKey = Buffer.alloc(32, "c");
      const cookie = encryptDataKeyForCookie(dataKey);

      // Tamper with the cookie
      const tampered = cookie.slice(0, -5) + "XXXXX";
      const result = decryptDataKeyFromCookie(tampered);
      expect(result).toBeNull();
    });

    it("returns null for invalid base64", async () => {
      const { decryptDataKeyFromCookie } = await getModule();
      const result = decryptDataKeyFromCookie("not-valid-base64!!!");
      expect(result).toBeNull();
    });

    it("returns null for empty string", async () => {
      const { decryptDataKeyFromCookie } = await getModule();
      const result = decryptDataKeyFromCookie("");
      expect(result).toBeNull();
    });

    it("returns null for valid base64 but wrong JSON structure", async () => {
      const { decryptDataKeyFromCookie } = await getModule();
      const fakeData = Buffer.from(JSON.stringify({ wrong: "keys" })).toString("base64");
      const result = decryptDataKeyFromCookie(fakeData);
      expect(result).toBeNull();
    });
  });

  describe("getDataKeyFromRequest", () => {
    it("returns null when cookie is missing", async () => {
      const { getDataKeyFromRequest } = await getModule();
      const request = {
        cookies: { get: vi.fn().mockReturnValue(undefined) },
      } as unknown as import("next/server").NextRequest;

      const result = getDataKeyFromRequest(request);
      expect(result).toBeNull();
    });

    it("returns null when cookie value is empty", async () => {
      const { getDataKeyFromRequest } = await getModule();
      const request = {
        cookies: { get: vi.fn().mockReturnValue({ value: "" }) },
      } as unknown as import("next/server").NextRequest;

      const result = getDataKeyFromRequest(request);
      expect(result).toBeNull();
    });

    it("decrypts data key from valid cookie", async () => {
      const { encryptDataKeyForCookie, getDataKeyFromRequest, COOKIE_NAME } = await getModule();
      const dataKey = Buffer.alloc(32, "d");
      const cookieValue = encryptDataKeyForCookie(dataKey, 4);

      const request = {
        cookies: { get: vi.fn().mockReturnValue({ value: cookieValue }) },
      } as unknown as import("next/server").NextRequest;

      const result = getDataKeyFromRequest(request, 4);
      expect(result).not.toBeNull();
      expect(result!.equals(dataKey)).toBe(true);

      expect(request.cookies.get).toHaveBeenCalledWith(COOKIE_NAME);
    });

    it("returns null when the cookie key version does not match", async () => {
      const { encryptDataKeyForCookie, getDataKeyFromRequest } = await getModule();
      const cookieValue = encryptDataKeyForCookie(Buffer.alloc(32, "z"), 5);

      const request = {
        cookies: { get: vi.fn().mockReturnValue({ value: cookieValue }) },
      } as unknown as import("next/server").NextRequest;

      const result = getDataKeyFromRequest(request, 6);
      expect(result).toBeNull();
    });
  });

  describe("NEXTAUTH_SECRET requirement", () => {
    it("throws when NEXTAUTH_SECRET is not set", async () => {
      delete process.env.NEXTAUTH_SECRET;
      const { encryptDataKeyForCookie } = await getModule();
      const dataKey = Buffer.alloc(32, "e");

      expect(() => encryptDataKeyForCookie(dataKey)).toThrow("NEXTAUTH_SECRET not configured");
    });
  });

  describe("constants", () => {
    it("exports correct cookie name", async () => {
      const { COOKIE_NAME } = await getModule();
      expect(COOKIE_NAME).toBe("_enc_dk");
    });

    it("exports 4-hour max age in seconds", async () => {
      const { COOKIE_MAX_AGE } = await getModule();
      expect(COOKIE_MAX_AGE).toBe(14400);
    });
  });
});
