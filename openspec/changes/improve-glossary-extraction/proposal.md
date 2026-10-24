## Why

Từ 2026-10-23, mục do bước trích tạo ra có hiệu lực ngay, không còn người duyệt (change
`unblock-auto-translate-context`). Vì vậy chất lượng trích quyết định trực tiếp chất lượng bản dịch. Soát dữ
liệu thật của hai tác phẩm (log AI và file tác phẩm, 2026-10-23) thấy năm lỗi có hệ thống:

- **Mất thuật ngữ.** 13/51 dạng mà lượt AI quét tìm ra (25%) bị bỏ trước bước phân loại: 王立回復術師協会,
  聖ルミエール治療院, オルム村, 痛覚増幅, 洗脳の呪い, biệt danh 翠風… Nguyên nhân là ngưỡng "xuất hiện ≥ 2 lần"
  áp cho cả dạng AI tìm được, và chỉ đếm trong một khúc 40k ký tự.
- **Cùng họ thuật ngữ nhưng dịch lệch.** 銀級 "Hạng Bạc", 鉄級 "Cấp Sắt", 金級 "Cấp Vàng"; "Ma thuật Cấp Hai" và
  "Ma thuật cấp Ba"; mục ガイゼル là "Geizel" nhưng ghi chú của mục khác viết "Gaizel". Lô phân loại không thấy
  glossary đã có.
- **Lấy thừa từ thông dụng.** ベテラン "Kỳ cựu", シスター "Sơ", スキル持ち; tác phẩm thứ hai có 45/68 mục loại
  `term`. Không còn bước duyệt nên các mục này ép bản dịch cứng nhắc.
- **Không gom được alias.** Gặp dạng đã có thì `saveExtraction` bỏ qua cả ứng viên, nên tác phẩm thứ hai có
  0 alias. Mục đã có vẫn bị gửi phân loại lại ở mỗi khúc.
- **Ứng viên rác và tín hiệu bị bỏ phí.**
  - Rác: mảnh katakana của động từ (バレ từ バレる), từ tượng thanh (カッ, ゴチャゴチャ), từ trong lời nhắn của
    tác giả cuối chương (クリック, レビュー, スマホ).
  - Bỏ phí: mẫu `漢字（カタカナ）` như 診断（スキャン）, gần như luôn là tên kỹ năng, chưa được dùng.
  - Giới tính chỉ dựa vào đại từ xưng nên sai: Morgreid xưng 僕 bị ghi nam dù nguồn có 僕は女の子.

Các công cụ khác (KeywordGacha, AiNiee, LinguaGacha) xử lý đúng những điểm này: đếm dạng dài trước, gom alias
theo nhóm, ưu tiên ít mà chắc. Nghiên cứu đầy đủ ở `docs/modules/context/glossary-extraction.md`.

## What Changes

- **Ứng viên code:**
  - đếm trên mọi chương đã nhập tới chương cuối của task, không đếm theo khúc;
  - dạng dài được đếm trước và che vị trí của nó, để 田中 không được đếm bên trong 田中太郎;
  - lọc mảnh nối okurigana, từ tượng thanh và ứng viên chỉ có trong phần lời nhắn của tác giả;
  - thêm tín hiệu `漢字（カナ）` và ruby.
- **Dạng do AI quét tìm được** chỉ cần có thật ít nhất một lần trong văn bản nguồn; ngưỡng tần suất chỉ áp cho
  ứng viên code.
- **Lọc trước khi phân loại:** ứng viên trùng nguồn hoặc alias của mục đã có (kể cả mục `rejected`) không gửi
  phân loại. Dạng mới là biến thể của mục đã có thì gắn thành alias của mục đó.
- **Phân loại:**
  - lô xếp theo họ thuật ngữ (chuỗi con, cùng hậu tố) thay vì theo tần suất;
  - mỗi lô kèm các mục đã có liên quan làm "đã chốt";
  - model được trả `alias_of` để gắn dạng vào mục đã có;
  - prompt chỉ nhận `term` khi từ đó cần dịch thống nhất trong thế giới truyện, và nghiêng về bỏ khi không chắc.
- **Kiểm bằng code thêm:**
  - các mục cùng họ thuật ngữ phải dịch theo cùng khuôn, sai thì gắn cờ `family_mismatch`;
  - alias ≤ 2 ký tự nằm trong từ thường thì không lưu làm alias, gắn cờ `short_alias`.
- **Lưu thêm:**
  - trường `reading` (cách đọc kana) của tên người;
  - giới tính chỉ lưu khi có câu chứng nhắc tới giới tính; đại từ xưng 僕/俺/私 không tính là bằng chứng.
- **Không có thay đổi phá vỡ.** Có một migration file tác phẩm thêm cột `reading`; mục cũ có `reading = NULL`.

## Capabilities

### New Capabilities
- `glossary-extraction`: cách sinh, lọc, phân loại, kiểm và lưu ứng viên thuật ngữ — tần suất, tín hiệu,
  lọc rác, họ thuật ngữ, alias, bằng chứng giới tính.

### Modified Capabilities
- `agent-context-workflow`: yêu cầu "Kiểm ứng viên bằng code trước khi lưu" đổi từ "bỏ ứng viên trùng mục đã có"
  thành "gắn dạng mới làm alias của mục đã có"; thêm hai mã cờ mới.

## Impact

- `src/main/services/ai/glossaryExtraction.ts`: đếm theo phạm vi, che dạng dài, lọc rác, tín hiệu mới, nhóm họ
  thuật ngữ, prompt phân loại kèm mục đã có, `alias_of`, `reading`, bằng chứng giới tính.
- `src/main/services/context/contextExtractionService.ts`: truyền văn bản của toàn phạm vi để đếm, lọc mục đã có,
  kiểm họ thuật ngữ và alias ngắn.
- `src/main/infra/storage/contextEntries.ts` (`saveExtraction`): gắn alias vào mục đã có; lưu `reading`.
- `src/main/infra/storage/workSchema.ts`: migration thêm cột `reading` cho `context_entry`.
- `src/shared/contracts/glossary.ts`: thêm `family_mismatch`, `short_alias` vào `REVIEW_FLAG_CODES` và nhãn tiếng Việt.
- Màn Từ điển hiện thêm hai badge cờ mới, không đổi bố cục.
- Lab: chạy lại hai tác phẩm hiện có để so số dạng bị mất, số họ lệch khuôn và tỉ lệ `term` là từ thông dụng.
