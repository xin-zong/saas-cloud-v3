# Foundation handoff

Implemented the Java 21 Spring Boot 3.5.15 / Sa-Token 1.45.0 authentication foundation within the assigned ownership. Spring JDBC, PostgreSQL, Flyway (off by default), validation, BCrypt crypto, springdoc 2.8.17, and Spring/JUnit tests are declared in `pom.xml`. No Redis, tenant stack or MyBatis code generator is included.

## Changed files

- `pom.xml`, `mvnw.ps1`: pinned dependencies, executable Spring Boot jar build, local Maven 3.9.11 bootstrap with SHA-512 verification. Published Maven Central checksum was fetched separately and matched the downloaded distribution.
- `src/main/java/com/enerlution/ems/EmsApplication.java`: entry point.
- `common/ApiResponse.java`, `BusinessException.java`, `ApiExceptionHandler.java`, `HealthController.java`: response/error contracts and liveness.
- `auth/AccessControl.java`, `SessionTokens.java`, `AuthController.java`, `AuthService.java`, `TotpService.java`: live grants, opaque bearer sessions, login/profile/logout and standards TOTP.
- `config/AuthConfig.java`, `WebConfig.java`: BCrypt/clock beans, authenticated-request interception and explicit-origin CORS.
- `src/main/resources/application.yml`: env configuration, loopback listener, Flyway disabled, strict bearer reading.
- `src/test/java/com/enerlution/ems/auth/{AuthBehaviorTest,AuthHttpTest,BearerSessionTest,MfaLifecycleTest}.java`: 19 tests.
- `docs/upstream.md`: accurate selective adaptation provenance, runtime variables, MFA provisioning format and limitations.
- This report. No migration, business, frontend or remote-server files edited. No commit created.

## Exact shared contracts

`com.enerlution.ems.common.ApiResponse<T>` is `record ApiResponse<T>(int code,String msg,T data)`, with static `ok(T)` returning code 200 / msg `Success`.

`com.enerlution.ems.common.BusinessException(int status,String message)` exposes `int status()` and the usual exception message.

Inject `com.enerlution.ems.auth.AccessControl`: `long userId()`, `void requirePermission(String permission)`, `void requireStation(long stationId)`, `List<Long> stationIds()`. Every method checks the authenticated account is currently enabled. Functional permission checks use exact `user_role` / `role_permission` matches; station access requires an explicit `user_station` row. Roles do not imply wildcard permissions, and station grants do not imply functional permissions. No cache of grants. Business code injects the normal Spring `JdbcTemplate` using public schema.

HTTP routes:

- `POST /api/auth/login` accepts `{account,password}`. Success data is `{requiresMfa:false,token,user}` or `{requiresMfa:true,challengeId}` with null values omitted.
- `POST /api/auth/mfa` accepts `{challengeId,code}`. Success data is `{token,user}`.
- `GET /api/auth/me`: `AuthUser` fields are string `id,name,account,role,organization`, plus string arrays `stationIds,permissions`. First known role (ordered by role ID) is used for frontend presentation, or `operator` when none; this fallback grants no authority. Organization is organization display name or empty string.
- `POST /api/auth/logout` revokes the current session, returns code 200 with null data.
- `GET /api/health` returns `{code:200,msg:"Success",data:{status:"UP"}}` and does not query dependencies.

All `/api/**` endpoints require authentication except the three explicit login/MFA/health routes; OPTIONS passes. Error handlers set actual HTTP status to match envelope codes, with safe messages for 400/401/403/409/500, and 404 for unknown resources. Unhandled errors log only their exception class, not SQL or credential payloads. Documentation is disabled by default.

## Verification evidence

1. Wrote `AuthBehaviorTest` before implementations. Initial compile failed on absent foundation classes. Added minimal AuthService contract stub and reran: 7 tests, **3 assertion failures**, 0 errors (invalid login and disabled user did not reject; logout did not revoke). Implemented AuthService: same command passed 7/7.
2. Added HTTP tests before the controller/error/config classes; compile failed on the missing contracts. Implemented the layer: 12/12 tests passed.
3. Added real Sa-Token session integration test: 13/13 passed. It issues a genuine opaque token inside a servlet request, accepts `Authorization: Bearer`, rejects query/cookie/raw-header tokens, logs out, then verifies the old token returns 401. JDBC account status is mocked; token/session behavior is real.
4. Added six MFA lifecycle tests. Concurrent business test-first work temporarily made normal `./mvnw.ps1 test -q` fail because `BusinessRulesTest` referenced absent business implementation. To avoid altering another task's files, generated ignored `.tools/foundation-tests.xml` from the same POM with only the authentication test source folder selected and output `target/foundation-verification`.
5. **`./mvnw.ps1 -f .tools/foundation-tests.xml test -q` exited 0: 19 tests, 0 failures/errors/skips**. Surefire reports: AuthBehaviorTest 7, AuthHttpTest 5, BearerSessionTest 1, MfaLifecycleTest 6. MFA tests cover password-only challenge, five wrong attempts, expiration, success once, database replay rejection and bounded account login attempts. RFC 6238 SHA-1 vector and AES-GCM tamper/missing-key tests also pass.
6. `./mvnw.ps1 -f .tools/foundation-tests.xml package -q -DskipTests` exited 0 and produced the executable jar. After parent completed business code, **normal `./mvnw.ps1 test -q` exited 0: 22 tests, zero failures/errors/skips** (19 auth plus 3 business). This final run also verifies `ems.clickhouse.database` was added for `EMS_CH_DATABASE` and runtime Flyway stays disabled for the parent's custom migration ledger.

The test JVM emits the known Mockito dynamic-agent/CDS warnings on Java 21. The safe-error test intentionally produces one class-only server error log. These are not test failures. This is isolated unit/servlet verification, **not PostgreSQL SQL or remote end-to-end verification**; no H2 substitute was used.

## Runtime / operational boundaries

Required env names: `EMS_DB_URL`, `EMS_DB_USERNAME`, `EMS_DB_PASSWORD`, and `EMS_CH_URL`, `EMS_CH_DATABASE`, `EMS_CH_USERNAME`, `EMS_CH_PASSWORD`. ClickHouse values are exposed as `ems.clickhouse.url`, `.database`, `.username`, `.password` for business code. `EMS_MFA_ENCRYPTION_KEY` is required when MFA exists (Base64 32-byte AES key); no fallback secret. Listener defaults `127.0.0.1:18090`; CORS origins default localhost/127.0.0.1 port 5173. Flyway remains disabled; the parent-owned `database/apply.sql` maintains its own migration ledger.

Sessions, five-minute challenges and throttles are in-memory, single-instance. Restart invalidates sessions/challenges. Passwords use BCrypt strength 12. Login limits are 10 per account and 50 per direct peer per five minutes, including successes, with bounded 10,000-entry storage. Behind a reverse proxy, direct-peer throttling groups users until a trusted-proxy strategy is configured. No arbitrary forwarded header is trusted. Session lifetime is eight hours.

TOTP is SHA-1 / 6 digits / 30 seconds, ±1 window. Challenges use 32 random bytes, expire in five minutes and allow five submissions. Secrets are AES-256-GCM encrypted using a random 12-byte nonce and fixed version AAD. PostgreSQL `last_counter` conditional update makes successful codes one-use. Administrators provision encrypted secrets as documented; there is no enrollment endpoint or fixed demo code.

## Outstanding integration checks

- Parent should package the final system and perform real PostgreSQL login/grant/MFA replay integration after the reviewed SQL. In particular validate exact table/column names and PostgreSQL concurrency semantics against the parent-owned schema. Full Maven suite was green at handoff.
- Configure reverse proxy/TLS and production CORS origins; supply credentials and encryption key outside source control.
- Parent owns database migration/admin provisioning, frontend integration and remote database setup. No remote changes were made here.

## Follow-up: enforce the new PostgreSQL database at startup

Added `config/DatabaseGuard.java` and `auth/DatabaseGuardTest.java`. The guard is a bean post-processor on the actual, fully bound Hikari datasource, so `spring.datasource.hikari.jdbc-url` or other environment/property overrides cannot bypass it by leaving the top-level URL unchanged. It runs before the datasource is supplied to consumers.

Only `jdbc:postgresql://<host>:<explicit-port>/ems_cloud_v2_proto` is accepted; raw path must match exactly (no encoded alias), and Hikari schema must be `public`. Query parameters are parsed and restricted to transport/timeout/application-name options. `currentSchema`, `options`, service lookup, database/credential routing and unknown options are rejected, including encoded parameter names. Alternate datasource implementations, nested datasource/JNDI configuration, alternate driver, non-public schema, connection-init SQL and unsafe datasource properties are rejected. Error text does not expose the supplied URL.

Test-first evidence: initial missing-class compile failure, then a no-op guard produced **5 tests / 4 assertion failures / 0 errors**. Implemented guard plus a real Spring property-binding test: **`./mvnw.ps1 -Dtest=DatabaseGuardTest test -q` passed 6/6**. Tests accept localhost tunnel and normal host URLs with safe query options; reject old DBs, encoded paths, schema routing, effective Hikari URL overrides and schema/init-SQL/data-source-property overrides. Actual ApplicationContextRunner startup succeeds for the new database configuration and fails for both Hikari URL and schema property bypass attempts. No network/database connection is required by these configuration tests.


Final follow-up verification: normal ./mvnw.ps1 test -q exited 0 with 28 total tests (25 foundation/auth/config plus 3 business), zero failures/errors/skips. The two intentional context-startup warnings assert that unsafe datasource configuration is rejected.
