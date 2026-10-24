## 1. Hàm thuần trong `glossaryExtraction.ts`

- [x] 1.1 Thêm hàm cắt phần lời nhắn của tác giả theo design §3; test với đoạn 【感謝＆大切なお願い】 thật (bị cắt) và
      một dòng ngăn cách giữa truyện không có từ khóa (giữ nguyên)
- [x] 1.2 Đổi hàm đếm thành "dài trước, có che" (design §2); test "田中太郎"×5 + "田中"×1 cho "田中" = 1, và câu ngữ
      cảnh vẫn là câu gốc chưa che
- [x] 1.3 Lọc katakana dính okurigana và từ tượng thanh (design §4); test バレ/バレる bị bỏ, ゴチャゴチャ và カッ bị bỏ,
      ミリィが/ミリィさん được giữ
- [x] 1.4 Thêm tín hiệu chú âm `漢字（カナ）` và ruby《》 kèm cách đọc, miễn ngưỡng tần suất (design §5); test
      "診断（スキャン）" xuất hiện một lần thành ứng viên với cách đọc スキャン
- [x] 1.5 `mergeCandidates`: dạng do model quét chỉ cần có nguyên văn ≥ 1 lần, ứng viên code ≥ 2 lần, đếm trên văn
      bản truyền vào; test bằng dữ liệu "王立回復術師協会" một lần (được giữ) và dạng bịa (bị bỏ)
- [x] 1.6 Hàm gom họ thuật ngữ bằng union-find và xếp lô ≤ 60 giữ nguyên nhóm (design §6); test 銀級/鉄級/金級 cùng
      lô, và hai tên katakana cùng tận cùng ン không bị gom
- [x] 1.7 `buildClassifyMessages` nhận các mục đã chốt (`<known>`, ≤ 30), cách đọc của ứng viên, luật
      `term`/`not-a-term` mới và trường `alias_of`; `parseClassification` đọc `alias_of`, `reading`; cập nhật test
      snapshot của prompt
- [x] 1.8 Hàm kiểm khuôn họ thuật ngữ (design §9) và hàm kiểm alias ngắn (design §10); test các ca "Hạng Bạc"/"Cấp
      Sắt", "Cấp Hai"/"cấp Ba", "Cấp Vàng"/"Cấp Đồng" (không cờ), セラ/セラミック

## 2. Lưu trữ

- [x] 2.1 Migration 19 (số 18 đã thuộc thay đổi hồ sơ truyện) thêm `context_entry.reading`; cập nhật fixture schema và test migration, mở file schema 18 có
      dữ liệu ra thì `reading` là NULL
- [x] 2.2 `saveExtraction`: dạng của ứng viên trùng mục `term` đã có (không phải `rejected`) được gắn làm alias;
      trả `aliasesAdded`; ghi `reading`; test ca "ノエル様" thành alias, và mục `rejected` không nhận alias
- [x] 2.3 Thêm `family_mismatch`, `short_alias` vào `REVIEW_FLAG_CODES` và `reviewFlagLabel`; test nhãn tiếng Việt

## 3. Service

- [x] 3.1 `ContextExtractionService.extract` đọc một lần văn bản các chương tới chương cuối của task (đã cắt lời
      nhắn tác giả) để đếm; lượt quét nhận khúc đã cắt; test bằng caller giả: tên một lần ở khúc 1 và một lần ở
      khúc 2 được phân loại ở khúc 2
- [x] 3.2 Lọc ứng viên trùng nguồn hoặc alias của mục `term` đã có (kể cả `rejected`) trước khi phân loại; xử lý
      `alias_of`; test lô của khúc 2 không chứa tên đã trích ở khúc 1
- [x] 3.3 Chạy kiểm khuôn họ và kiểm alias ngắn trước khi ghi, gắn cờ; test cờ có trên mục mới, không có trên mục cũ
- [x] 3.4 Phân tích xưng hô: thêm `genderEvidence` vào prompt, chỉ giữ male/female khi câu chứng hợp lệ (design §11);
      test ca Morgreid "僕は女の子" → female, và ca chỉ có "僕が行く" → unknown

## 4. Đo và tài liệu

- [x] 4.1 Chạy lệnh trích của Lab trên hai tác phẩm hiện có, so với lần chạy cũ: số dạng model quét bị mất (cũ
      13/51), số họ lệch khuôn, số mục `term`, số alias; ghi kết quả vào `docs/modules/context/glossary-extraction.md`
- [x] 4.2 Cập nhật `docs/modules/context/glossary-extraction.md`: các bước đã đổi, trạng thái đã triển khai; thêm
      phần nghiên cứu công cụ khác (KeywordGacha, AiNiee, LinguaGacha) làm quan sát
- [ ] 4.3 Chạy `node scripts/check.mjs` và xác nhận typecheck, test, lint đều chạy và qua
