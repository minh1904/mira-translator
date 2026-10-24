## REMOVED Requirements

### Requirement: URL identification returns binding identity
**Reason**: Release gate bị bỏ ngày 2026-10-24, nên kịch bản "adapter có nhưng gate đóng" không còn; nhận
diện còn phải trả cờ R18.
**Migration**: Thay bằng requirement "Every network adapter identifies its own URLs" bên dưới.

## ADDED Requirements

### Requirement: Every network adapter identifies its own URLs

The source binding API MUST call adapter identification for every registered network adapter and return a
typed result containing source descriptor, remote work ID, adapter-owned canonical URL, optional input
chapter ID and whether the source is R18.

#### Scenario: Supported work URL is identified without network access
- **WHEN** the user submits a syntactically supported work URL
- **THEN** identify returns the typed identity and performs no remote request or database write

#### Scenario: Supported episode URL identifies its parent work
- **WHEN** the user submits a supported episode URL
- **THEN** identify returns work-level binding identity and retains the episode ID only as preview context

#### Scenario: Unsupported URL is submitted
- **WHEN** no enabled adapter identifies the candidate
- **THEN** the API returns no match and does not guess from hostname alone

### Requirement: R18 sources require a one-time age confirmation

Before any network request to an R18 source, the wizard MUST ask the user to confirm being 18 or older. The
confirmation MUST be stored as an application preference, MUST be revocable in Settings, and MUST NOT be
stored in work files.

#### Scenario: First R18 URL
- **WHEN** the user pastes an R18 URL and has not confirmed their age
- **THEN** the wizard shows the age confirmation before preview and sends no request until the user confirms

#### Scenario: User declines
- **WHEN** the user declines the confirmation
- **THEN** the wizard returns to URL input and no request or write occurs

#### Scenario: Confirmation already given
- **WHEN** the user pastes another R18 URL after confirming
- **THEN** the wizard goes straight to preview and shows an R18 badge on the source

#### Scenario: Confirmation revoked
- **WHEN** the user revokes the confirmation in Settings and later checks an R18 raw version for updates
- **THEN** the check fails as `age_verification_required` and no request is sent
