## Purpose

Định nghĩa adapter Akatsuki cho `www.akatsuki-novels.com`: nhận diện URL, đọc metadata, mục lục và nội dung
chương theo yêu cầu, kể cả tác phẩm dành cho người lớn sau khi người dùng xác nhận tuổi.

## ADDED Requirements

### Requirement: Akatsuki URLs have canonical stable identity

The adapter MUST identify `https://www.akatsuki-novels.com/stories/index/novel_id~<id>` and episode URLs
`/stories/view/<episode>/novel_id~<id>` by numeric IDs without network access.

#### Scenario: Work URL is identified
- **WHEN** the user submits `https://www.akatsuki-novels.com/stories/index/novel_id~1234`
- **THEN** identify returns remote work ID `1234` and the canonical index URL

#### Scenario: Episode URL is identified at work scope
- **WHEN** the user submits `https://www.akatsuki-novels.com/stories/view/98765/novel_id~1234`
- **THEN** identify returns work `1234` and input chapter ID `98765`

### Requirement: Akatsuki metadata, catalog and content are parsed fail-closed

The adapter MUST read title, author and synopsis from the index page, read every catalog page with group
headings and episode IDs as stable IDs, and extract body, preface and afterword in reading order. The
private-work notice, a missing body block, or a catalog whose last page cannot be confirmed MUST fail closed
or mark the snapshot incomplete.

#### Scenario: Valid work is previewed
- **WHEN** the index fixtures are valid
- **THEN** preview shows metadata and a complete ordered catalog

#### Scenario: Work is private
- **WHEN** the page shows the site's private-work notice
- **THEN** preview fails as not available and nothing is written

#### Scenario: Catalog end cannot be confirmed
- **WHEN** a catalog page links to a further page the adapter cannot read within budget
- **THEN** the snapshot is incomplete and preview refuses to create the binding

### Requirement: Akatsuki fixtures are offline

Automated Akatsuki tests MUST use minimal synthetic fixtures and MUST NOT send requests to the site.

#### Scenario: Project checks run offline
- **WHEN** the normal test gate runs
- **THEN** all Akatsuki tests use fixture transports
