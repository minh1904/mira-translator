## ADDED Requirements

### Requirement: Age-confirmation cookies come only from the validated manifest

The broker MUST send a `Cookie` header only when the requesting adapter's validated network policy declares
a fixed age-confirmation cookie for that exact origin and the user has confirmed being 18 or older. Adapter
requests MUST NOT set `Cookie` themselves, and the broker MUST NOT store or forward cookies received in
responses.

#### Scenario: Declared cookie is sent after confirmation
- **WHEN** the R18 Syosetu policy declares `over18=yes` for `https://novel18.syosetu.com` and the user has
  confirmed their age
- **THEN** requests to that origin carry exactly `Cookie: over18=yes`

#### Scenario: Age is not confirmed
- **WHEN** the same request runs before the user confirmed their age
- **THEN** the broker rejects it as `age_verification_required` before dispatch

#### Scenario: Adapter tries to set a cookie
- **WHEN** an adapter request supplies a `Cookie` header
- **THEN** the broker rejects the request before dispatch and does not log the value

#### Scenario: Response sets a cookie
- **WHEN** a response contains `Set-Cookie`
- **THEN** later requests do not include that cookie

#### Scenario: Redirect leaves the declared origin
- **WHEN** a request with a declared cookie is redirected to another allowed origin
- **THEN** the redirected request carries only the cookie declared for the new origin, if any
