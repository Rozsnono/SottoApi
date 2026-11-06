/** Teszt környezet: szintetikus, nem valós titkok (soha nem éles értékek). */
process.env.JWT_SECRET = "test-jwt-secret-test-jwt-secret-1234";
process.env.ADMIN_SESSION_SECRET = "test-admin-session-secret-1234567890";
process.env.ADMIN_PASSWORD = "test-admin-password-123";
process.env.ADMIN_ID = "test-admin";
process.env.CONFIG_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.DATABASE_URL = "mongodb://127.0.0.1:1/unused";
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.MODERATION_PUBLIC_KEY = Buffer.from(new Uint8Array(32).fill(9)).toString("base64"); // szintetikus
process.env.CRON_SECRET = "test-cron-secret-12345";
