const ORIGINAL_ENV = process.env;

type AuthModule = typeof import("../src/auth");

function loadAuthModule(): AuthModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("../src/auth") as AuthModule;
}

describe("verifyIdToken", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = ORIGINAL_ENV;
  });

  test("returns local caller when DISABLE_AUTH=true", async () => {
    process.env.DISABLE_AUTH = "true";
    const createMock = jest.fn();
    jest.doMock("aws-jwt-verify", () => ({
      CognitoJwtVerifier: { create: createMock },
    }));

    const { verifyIdToken } = loadAuthModule();
    await expect(verifyIdToken(undefined)).resolves.toEqual({
      sub: "local",
      email: "dev@local",
    });
    expect(createMock).not.toHaveBeenCalled();
  });

  test("logs error and returns null when Cognito env vars are missing", async () => {
    delete process.env.COGNITO_USER_POOL_ID;
    delete process.env.COGNITO_CLIENT_ID;
    process.env.DISABLE_AUTH = "false";

    const createMock = jest.fn();
    jest.doMock("aws-jwt-verify", () => ({
      CognitoJwtVerifier: { create: createMock },
    }));
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const { verifyIdToken } = loadAuthModule();
    await expect(verifyIdToken("Bearer token")).resolves.toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      "Missing Cognito auth env vars: COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID must be set."
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  test("verifies token and hydrates JWKS when auth env vars are set", async () => {
    process.env.COGNITO_USER_POOL_ID = "ap-northeast-2_test";
    process.env.COGNITO_CLIENT_ID = "client-test";
    process.env.DISABLE_AUTH = "false";

    const verifyMock = jest.fn().mockResolvedValue({ sub: "user-1", email: "user@example.com" });
    const hydrateMock = jest.fn();
    const createMock = jest.fn().mockReturnValue({
      verify: verifyMock,
      hydrate: hydrateMock,
    });
    jest.doMock("aws-jwt-verify", () => ({
      CognitoJwtVerifier: { create: createMock },
    }));

    const { verifyIdToken } = loadAuthModule();
    await expect(verifyIdToken("Bearer valid-token")).resolves.toEqual({
      sub: "user-1",
      email: "user@example.com",
    });
    expect(createMock).toHaveBeenCalledWith({
      userPoolId: "ap-northeast-2_test",
      tokenUse: "id",
      clientId: "client-test",
    });
    expect(hydrateMock).toHaveBeenCalledTimes(1);
    expect(verifyMock).toHaveBeenCalledWith("valid-token");
  });

  test("returns empty email when payload.email is not a string", async () => {
    process.env.COGNITO_USER_POOL_ID = "ap-northeast-2_test";
    process.env.COGNITO_CLIENT_ID = "client-test";
    process.env.DISABLE_AUTH = "false";

    const verifyMock = jest.fn().mockResolvedValue({ sub: "user-2", email: 12345 });
    const createMock = jest.fn().mockReturnValue({
      verify: verifyMock,
      hydrate: jest.fn(),
    });
    jest.doMock("aws-jwt-verify", () => ({
      CognitoJwtVerifier: { create: createMock },
    }));

    const { verifyIdToken } = loadAuthModule();
    await expect(verifyIdToken("Bearer valid-token")).resolves.toEqual({
      sub: "user-2",
      email: "",
    });
  });

  test("logs warning and returns null when JWT verification fails", async () => {
    process.env.COGNITO_USER_POOL_ID = "ap-northeast-2_test";
    process.env.COGNITO_CLIENT_ID = "client-test";
    process.env.DISABLE_AUTH = "false";

    const verifyMock = jest.fn().mockRejectedValue(new Error("jwt expired"));
    const createMock = jest.fn().mockReturnValue({
      verify: verifyMock,
      hydrate: jest.fn(),
    });
    jest.doMock("aws-jwt-verify", () => ({
      CognitoJwtVerifier: { create: createMock },
    }));
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const { verifyIdToken } = loadAuthModule();
    await expect(verifyIdToken("Bearer expired-token")).resolves.toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain("JWT verification failed:");
  });
});
