## Purpose

Định nghĩa adapter Syosetu cho `ncode.syosetu.com` và `novel18.syosetu.com`: nhận diện URL, metadata và kiểm
tra cập nhật qua API chính thức, mục lục HTML phân trang và nội dung chương theo yêu cầu.

## ADDED Requirements

### Requirement: Syosetu URLs have canonical stable identity

The adapter MUST identify work and episode URLs on `ncode.syosetu.com` and `novel18.syosetu.com` by the
lower-cased ncode (`n` + digits + letters) without network access, and MUST return the canonical work URL
`https://<host>/<ncode>/` for the host the URL was given on.

#### Scenario: Work URL is identified
- **WHEN** the user submits `https://ncode.syosetu.com/N1234AB` or `https://ncode.syosetu.com/n1234ab/`
- **THEN** identify returns remote work ID `n1234ab` and canonical URL `https://ncode.syosetu.com/n1234ab/`

#### Scenario: Episode URL is identified at work scope
- **WHEN** the user submits `https://ncode.syosetu.com/n1234ab/12/`
- **THEN** identify returns work `n1234ab` and input chapter ID `12`

#### Scenario: R18 URL is identified as an R18 source
- **WHEN** the user submits `https://novel18.syosetu.com/n5678cd/`
- **THEN** identify returns the R18 Syosetu source with work `n5678cd`

#### Scenario: Other syosetu hosts are rejected
- **WHEN** the URL is on `syosetu.com`, `mypage.syosetu.com`, `syosetu.org` or has no valid ncode
- **THEN** this adapter does not identify it

### Requirement: Metadata and update evidence come from the official API

The adapter MUST read title, author, synopsis, serial state, episode count and last-update time from the
official novel API (`api.syosetu.com/novelapi` or `novel18api` for R18) and MUST fail closed when the API
returns no entry or an entry with a different ncode.

#### Scenario: API returns the work
- **WHEN** the API returns one entry for the requested ncode
- **THEN** preview shows title, author, synopsis, serial or completed state and episode count

#### Scenario: API returns no matching entry
- **WHEN** the API returns zero entries or a different ncode
- **THEN** preview fails as not found and nothing is written

#### Scenario: Update check sees no change
- **WHEN** a manual sync finds the API episode count and last-update time equal to the last complete snapshot
- **THEN** the sync completes without fetching catalog pages, creates no update event and tells the user the
  API can lag behind the site by up to about two hours

#### Scenario: User forces a full check
- **WHEN** the user chooses the full check for a Syosetu raw version
- **THEN** the sync reads every catalog page regardless of the API values, so renamed or edited episodes
  that do not change the API last-update time are still detected

#### Scenario: R18 work shows its site
- **WHEN** the R18 API reports `nocgenre` 1, 2 or 3, or 4
- **THEN** preview names the site as Nocturne, Moonlight or Midnight respectively

### Requirement: Catalog traverses every table-of-contents page

The adapter MUST read the work's table of contents across all pages in order, keep the chapter group heading
for each episode, use the episode number as stable remote chapter ID, and mark the snapshot complete only
when the last page was read and the count matches the API episode count.

#### Scenario: Multi-page catalog is read
- **WHEN** a work has 250 episodes over 3 table-of-contents pages
- **THEN** the catalog has 250 items in order with their group headings and is complete

#### Scenario: Page count and API disagree
- **WHEN** the parsed item count differs from the API episode count
- **THEN** the snapshot is marked incomplete and cannot create missing-remote evidence

#### Scenario: Short story has no table of contents
- **WHEN** the API reports a short story
- **THEN** the catalog has exactly one item whose content is the work page body

### Requirement: Episode content includes preface and afterword

The adapter MUST extract the episode body and, when present, the preface and afterword as separate blocks in
reading order, with ruby normalized the same way as other Japanese adapters, and MUST fail closed when the
body block is missing.

#### Scenario: Episode with preface and afterword
- **WHEN** an episode page has preface, body and afterword blocks
- **THEN** the chapter text contains the three blocks in that order separated by a divider line

#### Scenario: Body is missing
- **WHEN** the page has no episode body block (removed, access page or layout drift)
- **THEN** the download fails with a parser or access error and no chapter is created

### Requirement: Syosetu fixtures are offline

Automated Syosetu tests MUST use minimal synthetic fixtures and MUST NOT send requests to any syosetu host.

#### Scenario: Project checks run offline
- **WHEN** the normal test gate runs
- **THEN** all Syosetu tests use fixture transports
