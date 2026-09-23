# Upstream provenance

This API is a compact selective adaptation of RuoYi-Vue-Plus v5.6.2, reviewed from the local upstream checkout at commit `8136a0191a2258c0e1b36a8146a1c5ebc070c139`. It is not a full fork or a drop-in RuoYi distribution.

- `ApiResponse` adapts the `code`/`msg`/`data` and success-code-200 conventions from `ruoyi-common/ruoyi-common-core/src/main/java/org/dromara/common/core/domain/R.java` (author Lion Li).
- Authentication configuration follows the Spring bean/interceptor organization used by upstream Sa-Token integration. The implementation deliberately uses Sa-Token opaque tokens and the standard in-memory DAO; upstream JWT logic, Redis DAO and permission implementation were not copied.
- The original MIT notice is retained in the repository root as `LICENSE.ruoyi`.
- Business endpoints, PostgreSQL JDBC access, explicit station grants, BCrypt login, MFA challenge handling, and AES-GCM secret storage are application-specific implementation.

Java 21, Spring Boot 3.5.15, Sa-Token 1.45.0 and springdoc 2.8.17 are pinned in `pom.xml`. No Redis, MyBatis generator, or tenant stack is included. `mvnw.ps1` bootstraps Apache Maven 3.9.11 into `.tools`, verifies its pinned SHA-512 hash, and makes no system-wide changes. Unix hosts can build with Maven 3.9+ and Java 21.

# Runtime configuration

Required: `EMS_DB_URL` (PostgreSQL JDBC URL), `EMS_DB_USERNAME`, `EMS_DB_PASSWORD`; ClickHouse business client: `EMS_CH_URL`, `EMS_CH_DATABASE`, `EMS_CH_USERNAME`, `EMS_CH_PASSWORD`. Credentials have no embedded defaults. The database schema is `public`. Flyway is disabled in the application: an administrator applies `database/apply.sql` and its custom migration ledger, rather than granting DDL permissions to the runtime account.

Startup validates the effective Hikari datasource and permits only `jdbc:postgresql://host:port/ems_cloud_v2_proto` with schema `public`. An explicit port is required, including for local SSH tunnels. Other database names, encoded database paths, currentSchema/options/service routing, connection-init SQL and datasource-property routing overrides fail startup. Safe JDBC URL query options are limited to `sslmode`, `ssl`, `sslrootcert`, `sslcert`, `sslkey`, `connectTimeout`, `socketTimeout`, `tcpKeepAlive` and `ApplicationName`.

Default listener is `127.0.0.1:18090`; override with `EMS_BIND_ADDRESS`/`EMS_PORT`. `EMS_CORS_ORIGINS` is a comma-separated allowlist of explicit origins, defaulting to localhost and 127.0.0.1 on port 5173. Wildcards are rejected. Deploy behind a TLS reverse proxy. Forwarded client headers are not trusted automatically, so throttling uses the direct peer address. A trusted proxy setup needs an explicit reviewed client-address strategy before increasing scale.

Only `Authorization: Bearer <opaque-token>` is read. Sa-Token body reading (which includes request parameters/query strings) and cookie reading are disabled. Tokens expire after eight hours. Sessions, login throttles, and MFA challenges are held in memory for a single instance; restarting invalidates sessions/challenges and resets throttles. No cross-instance session support is implied.

# TOTP provisioning

There is no demo code or enrollment endpoint. Administrators provision a standard Base32 TOTP secret (SHA-1, 6 digits, 30 seconds). `TotpService.encrypt` writes `v1:` followed by Base64 of 12-byte nonce plus AES-256-GCM ciphertext/tag, with ASCII AAD `ems-totp-v1`. Store that value in `user_totp.secret_ciphertext`; initialize `last_counter` to null. Set `EMS_MFA_ENCRYPTION_KEY` to a cryptographically random 32-byte key encoded in Base64, supplied only through secret configuration. Missing or malformed keys fail MFA closed. The key is only required for accounts with configured MFA; rotate keys by re-encrypting existing secrets in a controlled administrative process.

MFA requires password verification first, allows a one-step clock window, expires after five minutes, and limits each challenge to five submissions. Successful codes atomically advance `last_counter` in PostgreSQL so they cannot be replayed across challenges. No session is created until MFA succeeds. Challenges and login throttle maps are bounded to 10,000 entries each; login limits are 10 attempts per account and 50 per direct peer per five-minute window, including successful attempts. Existing grants and enabled status are read from PostgreSQL for authenticated authorization checks.

