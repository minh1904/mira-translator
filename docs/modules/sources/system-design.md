# Thiết kế hệ thống nguồn đa quốc gia

Cập nhật: 2026-10-10 · Trạng thái: **đã chốt hướng sản phẩm**, **đề xuất kiến trúc và UX chưa triển
khai**. Chủ trì: chủ sản phẩm và kỹ thuật.

## Quyết định sản phẩm

Chủ sản phẩm chốt:

1. Mira phải hỗ trợ **nhiều nguồn novel**, không thiết kế quanh một vài website cố định.
2. Màn chọn nguồn phải cho lọc rõ ít nhất **Trung Quốc**, **Nhật Bản** và **Hàn Quốc**.
3. Thiết kế phải mở rộng được sang quốc gia và ngôn ngữ khác mà không đổi schema cốt lõi.
4. Nguồn mạng ưu tiên nghiên cứu: **Kakuyomu** (Nhật), **Novelpia** (Hàn), **Qidian và Fanqie** (Trung).
   Ngày 2026-10-24 chủ sản phẩm bổ sung Syosetu, なろう R18 và Akatsuki, gồm cả truyện R18; Hameln để change
   sau, Arcadia bị bỏ; xem [README](README.md#quyết-định-mở-rộng-adapter-nhật-2026-10-24).
   Đây là định hướng, không cam kết mọi nội dung đều lấy được.
5. Bản đầu chỉ dùng adapter do Mira phát hành; chưa cho cài adapter cộng đồng.
6. Khi phát hiện chương mới, mặc định **chỉ thông báo**; không tự tải raw và không tự xếp hàng dịch.
7. Raw của chương đã dịch bị sửa thì chỉ gắn cờ để người dùng quyết định; không tự dịch lại.
8. Chỉ xác nhận một chương mất khỏi nguồn sau **ba snapshot catalog đầy đủ, hợp lệ liên tiếp**; dữ liệu
   địa phương vẫn không bị xóa.
9. Hỗ trợ **nhiều tài khoản trên cùng một nguồn** trong thiết kế dữ liệu và UX.
10. Bản đầu chỉ kiểm tra cập nhật khi người dùng yêu cầu; chưa có lịch tự động.
11. Browser chỉ mở tương tác khi người dùng yêu cầu để đăng nhập, xác minh hoặc xử lý bước thủ công;
    không chạy browser ẩn/nền trong bản đầu.
12. Chốt thuật ngữ: **Nguồn nội dung** là website/API/RSS/tệp hoặc adapter lấy dữ liệu; **Bản raw** là
    bản văn cụ thể đã gắn với một tác phẩm.

Quyết định này chốt phạm vi sản phẩm ban đầu của hệ thống nguồn và việc giữ trang **Cập nhật**. Mỗi giai
đoạn vẫn cần OpenSpec riêng trước khi triển khai.

Cơ sở nghiên cứu: [repo crawler Nhật–Hàn–Trung](repository-survey.md) và
[cơ chế Cập nhật](updates-research.md).

## 1. Hiện trạng Mira

- `.mira` hiện lưu `chapter` với ID nội bộ, vị trí và tiêu đề; `chapter_text` lưu raw/bản dịch cùng
  revision. Chưa có adapter, remote work/chapter ID, catalog checkpoint hoặc content hash
  ([`workSchema.ts`](../../../src/main/infra/storage/workSchema.ts)).
- `library.db` là index cấp ứng dụng và đang giữ kết nối/secret AI; secret được mã hóa bằng Electron
  `safeStorage` ([`librarySchema.ts`](../../../src/main/infra/storage/librarySchema.ts),
  [`safeStorage.ts`](../../../src/main/electron/safeStorage.ts)).
- Ngôn ngữ nguồn đang giới hạn ở `en`, `zh-Hans`, `zh-Hant`, `ja`; schema và contract đều chưa có `ko`
  ([`library.ts`](../../../src/shared/contracts/library.ts)).
- Trang Cập nhật và khu vực “Nguồn raw” vẫn là mock. Mock dùng ngôn ngữ làm key nên không biểu diễn được
  hai bản raw cùng ngôn ngữ ([`SourcesAreaMock.tsx`](../../../src/renderer/src/modules/workspace/work-detail/SourcesAreaMock.tsx)).
- Main/preload/renderer đã có IPC typed và validation; service mới nên đi theo ranh giới đó, không cho
  renderer gọi adapter hay SQL trực tiếp.

## 2. Ngôn ngữ, quốc gia và bản raw là ba khái niệm khác nhau

### Thuật ngữ

| Khái niệm | Ý nghĩa | Ví dụ |
| --- | --- | --- |
| **Nguồn nội dung** | Adapter hoặc kênh lấy metadata, catalog hay nội dung | Kakuyomu, Qidian, Novelpia, RSS, tệp |
| **Quốc gia nền tảng** | Thị trường của website/dịch vụ | `CN`, `JP`, `KR`, `TW` |
| **Ngôn ngữ nội dung** | Ngôn ngữ/chữ viết adapter có thể trả | `zh-Hans`, `zh-Hant`, `ja`, `ko` |
| **Bản raw** | Một nguồn văn bản cụ thể đã gắn với tác phẩm | Bản Qidian chính, EPUB đối chiếu |

Không suy quốc gia từ ngôn ngữ: `zh-Hans` không đồng nghĩa mọi nền tảng đều ở Trung Quốc; một nền tảng
có thể hỗ trợ nhiều ngôn ngữ. Bộ lọc Trung/Nhật/Hàn dựa trên `countryCode`; bộ lọc ngôn ngữ là facet
độc lập.

Mỗi nguồn khai metadata kiểu:

```ts
interface SourceDescriptor {
  id: string
  displayName: string
  countryCode: string
  languageTags: string[]
  domains: string[]
  capabilities: SourceCapabilities
}
```

Không đặt `CHECK country IN ('CN', 'JP', 'KR')` trong SQLite. Quốc gia mới phải chỉ cần metadata adapter
và bản dịch UI, không cần migration.

## 3. Kiến trúc tổng thể

```text
Renderer
  → IPC contract typed
  → Source services
  → Catalog diff / scheduler / content revisions
  → Adapter runtime
  → Network broker hoặc browser session
  → Tệp, thư mục, RSS/API, website

library.db
  adapter install · auth profile · schedule index · job

<work>.mira
  source binding · catalog · content revision · update event
  → chapter · chapter_text hiện có
```

Một engine đồng bộ phục vụ mọi nguồn. Adapter chỉ biết nhận diện URL, lấy metadata/catalog/content và
kiểm phiên; adapter không tự ghi database, tạo chương hay xếp hàng dịch.

### Service

```text
SourceCatalogService   liệt kê, tìm và lọc adapter
SourceBindingService   gắn nhiều nguồn vào một tác phẩm
SourceSyncService      điều phối một lượt đồng bộ
CatalogDiffService     snapshot cũ + mới → diff thuần
SourceContentService   lưu revision, preview và áp raw
SourceScheduler        job bền, lease, retry và phục hồi
AdapterRegistry        manifest, version, trust và health
AdapterRuntime         chạy rule/code adapter qua capability hẹp
SourceNetworkBroker    HTTP, cookie handle, encoding, quota
```

Các service được nối trong `createServices()` và đưa vào handler dependencies như AI/glossary hiện tại.
IPC handler không gọi thẳng adapter hoặc SQL.

## 4. Contract adapter

Contract nhỏ, phân trang và không lộ internals của Mira:

```ts
interface NovelSourceAdapter {
  manifest: SourceManifest

  identify(input: { url: string }): Promise<IdentifyResult | null>
  getWork(input: WorkRequest): Promise<RemoteWork>
  getCatalog(input: CatalogRequest): Promise<CatalogPage>
  getChapter(input: ChapterRequest): Promise<ChapterPage>
  checkSession?(input: SessionRequest): Promise<SessionState>
}
```

Mỗi trang trả `items`, `nextCursor` và `exhausted`. Core chịu trách nhiệm phát hiện cursor lặp, dedupe,
giới hạn số trang, checkpoint và hủy.

Manifest tối thiểu:

```ts
interface SourceManifest {
  manifestVersion: 1
  sourceId: string
  displayName: string
  adapterVersion: string
  apiVersion: string
  dataSchemaVersion: number
  countryCode: string
  languageTags: string[]
  kind: 'declarative' | 'isolated-code'
  allowedOrigins: AllowedOrigin[]
  capabilities: SourceCapabilities
  auth: AuthDescriptor
  limits: SourceLimits
  minMiraVersion: string
}
```

`sourceId` là định danh bất biến, ví dụ `jp.kakuyomu`; không lấy tên hiển thị hoặc hostname làm ID.
Khóa chương mạng là `(sourceId, remoteWorkId, remoteChapterId)`. URL ticket, signed URL, tiêu đề và thứ
tự chỉ là metadata tạm.

### Capability

```text
identifyUrl · searchWorks · fetchMetadata · fetchCatalog
fetchChapter · incrementalCatalog · detectContentRevision
browserAuth · browserRequired
```

UI không dùng nhãn chung “Được hỗ trợ”. Adapter chỉ đọc catalog phải ghi rõ “phát hiện chương mới,
không nhập nội dung tự động”.

### Access state

```text
public
login_required
age_verification_required
entitlement_required
manual_intervention_required
temporarily_unavailable
parser_broken
```

Access là trạng thái của tác phẩm/chương, không phải health adapter. Chỉ timeout, lỗi mạng, 429 và 5xx
phù hợp mới retry; login, quyền mua, CAPTCHA và parser invariant không retry mù.

## 5. Hai tầng adapter

### Rule khai báo — mặc định

Hỗ trợ:

- GET/POST, HTML và JSON;
- CSS selector, XPath, JSONPath;
- page number, cursor, next link và embedded page list;
- charset, URL/date normalization;
- regex có giới hạn dữ liệu và deadline;
- fallback selector cùng assertion ngữ nghĩa.

Không hỗ trợ arbitrary JavaScript, filesystem, environment, database, Electron API hoặc socket tùy ý.
Rule interpreter validate output; sync service mới được ghi dữ liệu.

### Code adapter — ngoại lệ

Dùng khi nguồn cần ký request hoặc thuật toán không biểu diễn được bằng rule. Bản đầu chỉ nhận code do
Mira audit và đóng gói. Code vẫn chỉ dùng network broker và capability API, không nhận `fs`, database,
secret hoặc `net.fetch` trực tiếp.

`worker_threads`, `vm` hay một Node child process đơn thuần không phải sandbox cho mã bên thứ ba. Plugin
cộng đồng chỉ được cân nhắc sau khi có runtime giới hạn capability thật, ký số, quarantine và rollback.

### Trust level

| Mức | Nguồn | MVP |
| --- | --- | --- |
| `builtin` | Đi kèm Mira | Có |
| `official` | Feed do Mira ký | Định nghĩa package từ đầu, hot update có thể làm sau |
| `third_party` | Nhà phát hành khác hoặc không ký | Chưa hỗ trợ |

## 6. Network broker và phiên đăng nhập

Adapter không nhận `fetch` toàn quyền. Broker ở main process:

- chỉ cho origin đã khai trong manifest và kiểm lại sau mọi redirect;
- chỉ cho HTTPS ngoài fixture test;
- chặn loopback, link-local, private network và DNS rebinding;
- giới hạn timeout, redirect, response bytes, concurrency và request budget;
- rate limit theo adapter và tài khoản;
- hỗ trợ UTF-8, GBK/GB18030 và charset được khai;
- cache phân vùng theo nguồn/tài khoản;
- gắn User-Agent Mira và redact secret khỏi log;
- hủy request cùng job.

HTTP 200 chưa phải thành công. Adapter phải xác nhận remote ID, body không rỗng, không phải login/challenge
page và catalog không giảm bất thường.

Cookie/token nằm ở main process, mã hóa bằng `safeStorage`. Adapter và renderer chỉ thấy opaque handle.
Handle bị khóa với `sourceId`, tài khoản và origin; broker tự gắn credential. Backup `.mira` chỉ mang
`authProfileId` tham chiếu; máy khác mở được tác phẩm nhưng binding chuyển sang `login_required`.

Browser auth dùng partition riêng theo nguồn/tài khoản và chỉ mở sau hành động rõ ràng của người dùng.
CAPTCHA, xác minh tuổi và mua quyền chuyển job sang `waiting_user`; hoàn tất xong người dùng tiếp tục
đúng lượt đang làm. Bản đầu không chạy browser ẩn hoặc browser nền.

## 7. Mô hình dữ liệu đề xuất

### `library.db`: dữ liệu cấp ứng dụng

#### `source_adapter_install`

```text
adapter_id · version · manifest_json · artifact_sha256
publisher_key_id · trust_level · state · installed_at · updated_at
```

State: `enabled`, `disabled`, `quarantined`, `broken`.

#### `source_auth_profile`

```text
id · adapter_id · label · encrypted_secret
account_partition · state · created_at · updated_at
```

#### `source_schedule_index`

Projection rebuild được từ `.mira`, giúp scheduler tìm binding đến hạn mà không mở mọi tác phẩm:

```text
work_id · binding_id · enabled · next_check_at · priority · last_result
```

#### `source_job`

```text
id · work_id · binding_id · kind · state · attempt
not_before · lease_until · progress_json · failure_json
created_at · updated_at
```

State: `queued`, `running`, `waiting_user`, `completed`, `failed`, `cancelled`.

### `<work>.mira`: dữ liệu thuộc tác phẩm

#### `source_binding`

Một tác phẩm có nhiều bản raw và nhiều binding cùng ngôn ngữ:

```text
id · adapter_id · adapter_version · remote_work_id · canonical_url
country_code · language_tag · label · is_primary · enabled
auth_profile_id · schedule_policy_json · catalog_cursor_json
last_valid_sync_at · last_attempt_at · next_check_at
consecutive_failures · created_at · updated_at
UNIQUE(adapter_id, remote_work_id)
```

`id`, không phải `language_tag`, là identity của bản raw.

#### `source_sync_run`

```text
id · binding_id · trigger · state · adapter_version
catalog_complete · started_at · finished_at
failure_kind · failure_message · stats_json
```

#### `source_catalog_item`

```text
id · binding_id · remote_chapter_id · remote_url · chapter_id
ordinal_key · volume_title · title · kind
published_at · remote_updated_at · revision_token · access_state
first_seen_at · last_seen_at · missing_streak · removed_at · metadata_hash
UNIQUE(binding_id, remote_chapter_id)
```

Nhiều catalog item từ nhiều nguồn có thể trỏ tới cùng `chapter_id`; một bản dịch không bị nhân đôi chỉ
vì có nhiều raw đối chiếu.

#### `source_content_revision`

```text
id · catalog_item_id · content_hash · payload_hash
normalized_text · normalization_version · remote_updated_at
fetched_at · adapter_version · access_state · is_complete
UNIQUE(catalog_item_id, content_hash)
```

`chapter_text.source` tiếp tục là raw đang được dịch; revision nguồn là lịch sử quan sát, không tự ghi
đè vào raw làm việc.

#### `source_update_event`

```text
id · binding_id · catalog_item_id · kind · dedupe_key UNIQUE
payload_json · detected_at · seen_at · acted_at
```

Kind: `added`, `renamed`, `moved`, `access_changed`, `raw_changed`, `missing_remote`, `reappeared`,
`parser_warning`. “Đã xem”, “đã nhập”, “đã xếp hàng” và “đã dịch” là trạng thái độc lập.

## 8. Catalog diff và content revision

Mỗi lượt:

1. Adapter trả catalog đầy đủ hoặc các trang cursor.
2. Core kiểm remote work ID, ID trùng, pagination và mức giảm bất thường.
3. Chỉ snapshot `valid + complete` mới được dùng cho thay đổi có tính phá hủy.
4. Ghép bằng `remoteChapterId`; nguồn không có ID mới fallback URL chuẩn hóa hoặc số chương + tiêu đề và
   lưu `matchConfidence`.
5. Sinh `added`, `renamed`, `moved`, `access_changed`, `missing_remote`, `reappeared`.
6. Upsert catalog và event trong một transaction của work file.
7. Lấy nội dung cho item mới, thiếu hoặc stale theo policy.
8. Commit từng content revision ngay khi hoàn thành.
9. Chỉ khi người dùng hoặc policy cho phép mới tạo/link `chapter` và áp vào `chapter_text.source`.

Quy tắc:

- catalog lỗi/rỗng không được đánh dấu toàn bộ chương bị gỡ;
- `missing_streak` chỉ tăng sau snapshot đầy đủ hợp lệ;
- xác nhận `removed_at` sau ba snapshot đầy đủ, hợp lệ liên tiếp; vẫn lưu ngưỡng trong policy để có thể
  migration hoặc thay đổi sau này mà không đổi schema;
- chương xuất hiện lại giữ `first_seen_at` cũ;
- raw hash đổi thì lưu revision và tạo `raw_changed`, không ghi đè bản dịch;
- chương thông báo có `kind='notice'`, mặc định không xếp hàng dịch;
- apply raw dùng optimistic revision hiện có để không đè chỉnh sửa của người dùng.

## 9. Scheduler

Mira là desktop app. Bản đầu chỉ kiểm khi người dùng bấm kiểm tra và ứng dụng đang mở. Khi ứng dụng hoặc
máy tính đã tắt thì Mira không thể phát hiện hay gửi thông báo mới. Cập nhật khi app tắt chỉ khả thi nếu
sau này bổ sung OS background agent hoặc dịch vụ máy chủ; cả hai đều chưa được chốt.

```text
startup
  → reconcile schedule index từ .mira
  → thu hồi lease hết hạn
  → enqueue binding đến hạn
  → global limit + per-adapter limit
  → catalog sync → optional content fetch
  → persist next_check_at
```

- Chỉ một job active cho `(workId, bindingId, kind)`.
- Chỉ manual refresh được bật trong bản đầu và vẫn phải tôn trọng rate limit.
- Sleep/wake và mất mạng không tạo bão request.
- `Retry-After` dài được lưu thành `not_before`, không giữ timer treo.
- Lỗi quyền truy cập hoặc parser chuyển trạng thái, không retry.
- Scheduler giữ kiến trúc job/lease để mở rộng sau này, nhưng lịch cố định hoặc adaptive đều chưa bật.

## 10. UX khám phá và lọc nguồn

### Màn cấp ứng dụng: Nguồn nội dung

Ba tab:

1. **Khám phá:** tìm nguồn hoặc tác phẩm, dán URL, lọc capability.
2. **Đã kết nối:** tài khoản, nguồn đang dùng, tác phẩm đang theo dõi.
3. **Tình trạng:** adapter suy giảm/hỏng, phiên hết hạn và việc chờ người dùng.

Thanh công cụ:

```text
[Tìm nguồn, tên bản địa, domain hoặc dán URL…]

Nền tảng: [Tất cả] [Trung Quốc] [Nhật Bản] [Hàn Quốc] [Khác]
Ngôn ngữ: [Trung giản thể] [Trung phồn thể] [Nhật] [Hàn]
Bộ lọc: [Khả năng] [Truy cập] [Tình trạng]
```

Trung/Nhật/Hàn là facet nổi bật nhưng không phải ba tab đóng; nguồn Đài Loan, Anh hay Việt Nam nằm ở
`Khác` và có thể được thêm mà không đổi IA.

Dán URL ưu tiên nhận diện adapter trực tiếp, không bắt chọn quốc gia trước.

### Thẻ nguồn

Luôn hiện riêng:

- tên, domain và tên bản địa;
- quốc gia nền tảng;
- ngôn ngữ nội dung;
- capability: tìm, catalog, nội dung, incremental;
- kiểu truy cập;
- health và thời điểm kiểm gần nhất;
- CTA phù hợp.

Không dùng cờ quốc gia làm nhãn ngôn ngữ duy nhất.

### Health adapter

| Trạng thái | Ý nghĩa |
| --- | --- |
| **Ổn định** | Smoke test gần nhất qua |
| **Suy giảm** | Một capability lỗi hoặc tỷ lệ lỗi tăng |
| **Hỏng** | Parser/invariant thất bại; dừng đồng bộ tự động |
| **Chưa xác định** | Mạng, rate limit hoặc challenge làm test không kết luận được |
| **Chưa kiểm tra** | Adapter mới/chưa chạy |

Health, trạng thái tài khoản và access của chương là ba dữ liệu độc lập.

## 11. UX thêm và quản lý bản raw

Đổi tên khu vực mock **Nguồn raw** thành **Bản raw**.

Wizard **Thêm bản raw**:

1. Chọn cách: dán URL, tìm trên nguồn, nhập tệp, theo dõi thư mục, API/RSS.
2. Nhận diện/chọn adapter; nếu không nhận diện thì đề nghị nhập tệp hoặc mở browser, không báo URL sai.
3. Xem trước: tên/tác giả/ngôn ngữ, tổng chương, chương đọc được, chương khóa, chương khớp và chưa ghép.
4. Chọn vai trò: bản chính hay đối chiếu; chỉ catalog hay cả nội dung; theo dõi chương mới; giới hạn tự
   xếp hàng dịch.
5. Tạo binding rồi đọc lại đúng binding vừa thêm.

Mỗi thẻ bản raw hiện:

- tên do người dùng đặt;
- ngôn ngữ, nền tảng và adapter;
- vai trò bản chính/đối chiếu;
- độ phủ nội dung và số chương đã ghép;
- lần kiểm, health và trạng thái tài khoản;
- raw sửa/chương bị gỡ.

Một tác phẩm có một bản chính mặc định và có thể override theo chương. Đổi bản chính phải preview ảnh
hưởng và không tự thay raw hay bản dịch đã có.

CTA theo lỗi:

- `login_required`: **Đăng nhập rồi tiếp tục**;
- `age_verification_required`: **Mở để xác minh**;
- `entitlement_required`: **Mở trên nền tảng** / **Kiểm tra lại quyền**;
- `manual_intervention_required`: **Mở trang để xử lý**;
- `temporarily_unavailable`: hiện thời gian thử lại;
- `parser_broken`: dừng tự động, **Xem tình trạng nguồn**.

Không có CTA né quyền mua, phá DRM, giả quảng cáo hay tự chuyển sang mirror.

## 12. IPC đề xuất

Thêm contract `src/shared/contracts/sources.ts` và nhóm API:

```text
sources:catalog:list|get
sources:bindings:list|identify|create|update|delete
sources:sync:start|cancel|status
sources:updates:list|mark-seen|preview-apply|apply
```

Event hẹp:

```text
source:sync:progress
source:auth:required
```

Input/output được validate như các contract hiện tại. Renderer nhận view model, không nhận secret,
database handle hoặc primitive kiểu `adapter.call(method, unknown)`.

## 13. Migration và tương thích

### Ngôn ngữ

Bước đầu thêm `ko` vào contract. Vì `work.source_lang` có `CHECK` cứng, migration phải rebuild bảng
`work` trong transaction. Về dài hạn, file format nên lưu BCP-47 string và validation/application profile
nằm ở code; danh sách preset dịch không nên giới hạn ngôn ngữ mà file có thể lưu.

Các đường AI/ngữ cảnh đang dựa trên union ngôn ngữ phải có fallback thay vì từ chối ngôn ngữ chưa có
preset.

### Schema

- `library.db`: adapter install, auth profile, schedule index, job.
- `.mira`: binding, sync run, catalog item, content revision, update event.
- Restore trên máy thiếu adapter/auth vẫn mở được; binding hiện `adapter_missing` hoặc `login_required`.
- Cập nhật schema snapshot và fixture migration từ mọi version cũ.

## 14. Package, health và rollback

Package adapter khai file, SHA-256, kích thước, manifest canonical và chữ ký. Feed update cũng được ký.
Từ chối downgrade trừ rollback có chủ ý; update mở rộng origin/auth/capability phải hỏi quyền lại.

Pipeline:

```text
schema validation
→ static policy scan
→ fixture/golden tests
→ broker security tests
→ package + sign
→ clean-machine verification
→ canary
→ staged rollout
```

Health tách installation, fixture, live, account và job. Adapter có catalog rỗng bất thường hoặc parser
fail liên tiếp bị quarantine; quarantine dừng job nền nhưng không xóa cache, chương hay credential.

Giữ version active và version tốt gần nhất. Activation đổi con trỏ atomically; rollback tiếp tục từ
checkpoint chương thay vì tải lại toàn bộ.

## 15. Lộ trình triển khai

### Giai đoạn 1 — nền dữ liệu

- thêm `ko` và mở schema ngôn ngữ;
- tạo binding/catalog/revision/event;
- adapter tệp/thư mục;
- catalog diff và preview mới/sửa/gỡ;
- đổi “Nguồn raw” thành “Bản raw”.

### Giai đoạn 2 — catalog UI

- màn Nguồn nội dung;
- lọc Trung/Nhật/Hàn và ngôn ngữ độc lập;
- dán URL/nhận diện;
- nhiều bản raw cho một tác phẩm;
- health/access/account states.

### Giai đoạn 3 — mạng công khai

- network broker;
- một hoặc hai adapter API/RSS;
- scheduler, progress/cancel và fixture/live smoke tests.

### Giai đoạn 4 — HTML và đăng nhập

- rule adapter HTTP/HTML;
- browser auth partition riêng;
- job `waiting_user`;
- adapter nguồn công khai hoặc nội dung tài khoản có quyền.

### Giai đoạn 5 — adapter code đã ký

Chỉ sau khi signing, package lifecycle, quarantine và rollback hoạt động. Marketplace/plugin cộng đồng,
JavaScript tùy ý, browser automation nền và selector do AI tự phát hành đều hoãn.

Mỗi giai đoạn cần OpenSpec riêng trước khi triển khai.

## 16. Acceptance criteria cấp hệ thống

1. Lọc độc lập được theo quốc gia nền tảng và ngôn ngữ nội dung.
2. Có lựa chọn rõ Trung Quốc, Nhật Bản, Hàn Quốc và `Khác`.
3. Có `zh-Hans`, `zh-Hant`, `ja`, `ko`; không dùng cờ làm nhãn ngôn ngữ duy nhất.
4. Dán URL nhận diện adapter mà không cần chọn quốc gia trước.
5. Mỗi nguồn hiện riêng capability, access và health.
6. Một tác phẩm chứa nhiều bản raw cùng ngôn ngữ với ID riêng.
7. Nhiều catalog item có thể ghép vào cùng chương Mira.
8. Raw mới/sửa/gỡ không tự ghi đè bản dịch.
9. Snapshot rỗng/lỗi không đánh dấu hàng loạt chương bị gỡ.
10. Chương khóa vẫn ở catalog với access state.
11. Resume và cache dựa trên remote ID; ticket/signed URL không phải identity.
12. Adapter không truy cập trực tiếp DB, filesystem, secret hoặc network ngoài broker.
13. Cookie/token không về renderer hoặc runtime adapter dạng rõ.
14. Health adapter, phiên tài khoản và quyền chương không bị gộp.
15. Lỗi parser dừng đồng bộ; lỗi mạng retry hữu hạn theo policy.
16. Adapter/version có fixture, golden output và rollback.
17. Scheduler phục hồi sau crash bằng lease/checkpoint và chỉ chạy khi app mở ở bản đầu.
18. Restore `.mira` không có adapter/auth vẫn mở được dữ liệu tác phẩm.
19. UI không có đường né quyền mua, CAPTCHA, DRM hoặc tự dùng mirror.
20. Tất cả màn nguồn hiện là đề xuất cho tới khi OpenSpec và mã được nghiệm thu.

---

[Nguồn và cập nhật](README.md) · [Khảo sát repo](repository-survey.md) ·
[Cơ chế Cập nhật](updates-research.md) · [Tính năng toàn app](../workspace/app-level-features.md)
