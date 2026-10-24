## Context

Xem proposal.md - Why. Hiện trạng đã đọc từ mã:

- `suggestRegister(sourceLang, genre)` (`languageProfiles.ts`) là hàm thuần, tính lại mỗi lần, trả một `RegisterPresetId` hoặc `null`. Nó được gọi ở
  `contextSnapshot.ts` (`takeContextSnapshot`), `chapterTranslation.ts` (đường dịch chương không qua bản chụp) và
  `contextExtractionService.ts`; `addressingAnalysis.ts` và `paragraphTranslation.ts` nhận `register` từ các nơi đó.
  Cần grep lại toàn bộ nơi gọi, kể cả đường chat, trước khi thay.
- `genreFamily` đang xếp "xuyên không" vào nhóm cổ đại; `suggestRegister` đẩy mọi văn bản tiếng Anh về `en-western`.
- `REGISTER_PRESETS` (`src/shared/contracts/addressingPresets.ts`) có 6 bảng phẳng, mỗi bảng có `sourceLangs`.
  `presetSection` (`translatePrompt.ts`) ghép bảng vào system prompt nên prompt giữ nguyên giữa các lô.
- `ContextSnapshot.register` nằm trong JSON chuẩn hóa nên nằm trong hash; mỗi lô so hash snapshot hiện tại với hash đã
  lưu và bật `contextChanged` khi khác. Bản chụp được dựng lại từ dữ liệu đã lưu (`rebuildTranslateRequest`).
- Thể loại là cột `genre` kiểu chuỗi ở `work` và `work_index`. Schema tác phẩm hiện ở v17, schema thư viện v19; mỗi
  phiên bản có fixture `.schema.sql` mà các test snapshot schema đối chiếu.
- Chính sách hậu tố (quyết định 2026-10-04) hiện chỉ được `japanese()` nhận; `korean()` không nhận chính sách nào
  (theo khảo sát `addressing-research-ko.md`, chưa đối chiếu lại bằng mã trong change này).
- Nội dung bảng mới lấy từ bốn tài liệu khảo sát `docs/modules/context/addressing-research-{ja,ko,zh,west}.md`. Đó là
  nghiên cứu, chưa phải quyết định; nhãn độ tin cậy trong từng dòng quyết định dòng nào được đưa vào dữ liệu. Phần
  lớn dòng mới là suy luận chưa đo bằng model.

Các quyết định của chủ sản phẩm cho change này (ghi 2026-10-23): một bối cảnh chính cộng nhiều bối cảnh phụ; Việt
hóa `-ssi` và dịch `오빠`/`형`/`선배` theo vai với công tắc giữ hậu tố theo tác phẩm; không có tín hiệu thì chỉ gửi
dòng cách suy; "em" của hầu gái chuyển sang điều kiện thẻ nhân vật.

## Goals / Non-Goals

**Goals:**
- Chọn đúng bảng cho truyện chỉ có tên, truyện Hàn, và truyện Á đọc qua bản tiếng Anh.
- Thêm một văn hóa hoặc bối cảnh mới chỉ bằng dữ liệu.
- Không gửi bảng cặp khi không có tín hiệu, cho mọi ngôn ngữ.
- Bản chụp và trace cũ vẫn đọc và dựng lại được.

**Non-Goals:**
- AI đề xuất bối cảnh hay văn hóa, dò tín hiệu từ nội dung chương, cờ 18+, kết nối dự phòng, log chung.
- Ghi đè bảng theo chương hoặc theo nhân vật (ví dụ nội tâm người chuyển sinh).
- Dịch nhãn chip sang ngôn ngữ giao diện khác; chip dùng tiếng Việt như giao diện hiện tại.
- Thêm trường họ hàng (bên nội/ngoại, hơn/kém) vào thẻ nhân vật: bảng chỉ ghi quy tắc, thiếu dữ liệu thì gọi theo tuổi.

## Decisions

**1. Dữ liệu hai tầng, ghép khi dựng prompt.** Hai bảng tra: `SETTINGS[setting]` giữ nhãn, dòng chung và
`thirdPerson`; `CULTURES[culture]` giữ nhãn, ngôn ngữ mặc định, quy ước kính ngữ và `rows` riêng theo bối cảnh
(`Partial<Record<Setting, Row[]>>`). Một hàm thuần ghép `compose(settings, culture)` nhận danh sách bối cảnh có thứ
tự (chính rồi phụ) và ra bảng đưa vào `presetSection`. Khi nhiều dòng có cùng `relation`: dòng riêng của văn hóa
thắng dòng chung, và trong cùng loại thì bối cảnh đứng trước thắng. Nhờ vậy cung đình và tu chân dùng chung dòng
bằng cách một tác phẩm chọn cả hai, không cần bối cảnh `ancient` trung gian. Chọn cách này thay vì bảng phẳng cho
từng tổ hợp vì các bảng fantasy của Nhật, Hàn, phương Tây trùng phần lớn và chép lại sẽ làm lệch dần; thay vì ma
trận đầy đủ 5×4 bảng vì nhiều ô trống hoặc vô nghĩa. Test kiểm: mỗi ô cặp có đúng một cặp (không có " hoặc "), mỗi
dòng có nhãn độ tin cậy, và bảng ghép không vượt trần dòng đặt trong test (mặc định 14).

**2. Mã cũ là bí danh.** Bảng tra `ja-modern`→(`modern`,`ja`), `ja-fantasy`→(`fantasy`,`ja`), `ja-court`→(`court`,`ja`),
`zh-modern`→(`modern`,`zh`), `zh-ancient`→(`court`,`zh`), `en-western`→(`fantasy`,`west`). Giả định ghi nhận:
`en-western` cũ trộn fantasy và hiện đại nên không có ánh xạ đúng; chọn `fantasy` vì các dòng tước vị và vua của nó
chỉ có nghĩa ở đó, và `[en-western]` trong thể loại là hiếm. `zh-ancient` cũ gồm cả tu chân; người dùng muốn bảng
tu chân phải chọn bối cảnh `cultivation` (chính hoặc phụ).

**3. Lưu ba cột nullable trên `work`.** `setting TEXT NULL`, `settings_extra TEXT NULL` (danh sách bối cảnh phụ
ngăn bằng dấu phẩy, thứ tự là thứ tự ghép) và `culture TEXT NULL`; migration v17→v18 bằng `ALTER TABLE ADD COLUMN`,
không backfill. "Không dùng bảng" lưu là `setting = 'none'` (văn hóa vẫn có thể có để điều khiển quy ước kính ngữ).
Thay vì cột boolean thứ tư để tránh giá trị đặc biệt: chọn `'none'` vì chỉ có một ngữ nghĩa "không bảng" và nó
nằm cùng chỗ với lựa chọn bối cảnh. Bối cảnh phụ chỉ hợp lệ khi `setting` là một bối cảnh thật. Danh sách giá trị hợp
lệ lấy từ cùng hằng với bảng dữ liệu, kiểm bằng schema validate ở biên IPC.

**4. Thể loại vẫn là một chuỗi.** Chip ghi nhãn vào cột `genre` hiện có, nối bằng dấu phẩy; chip bối cảnh khớp bảng
tra nhãn→bối cảnh ở mã dùng chung. Thay vì cột JSON mới cho danh sách thể loại: không cần migration cho `work_index`
và tác phẩm cũ không mất gì, đổi lại thể loại vẫn khó lọc và thống kê. Giá trị gõ tự do cũ được giữ và vẫn được
quét từ khóa như hiện nay. Nhãn chip phải ổn định vì việc khớp dựa vào chúng; đổi nhãn SHALL đi kèm bí danh nhãn cũ.
Chip chế độ kể (Xuyên Không) và `genreFamily` hiện xếp "xuyên không" vào cổ đại: sửa để từ này không còn cho ra
bối cảnh. Khi nhiều chip bối cảnh khác nhau mà người dùng chưa chọn, không suy ra bối cảnh nào.

**5. Một hàm `resolveRegister(work)`.** Thứ tự: mã tổ hợp trong thể loại > `setting`/`settings_extra`/`culture` đã
lưu > suy từ chip bối cảnh (khi không mâu thuẫn) và ngôn ngữ nguồn > không bảng. Văn hóa mặc định theo ngôn ngữ nguồn:
`ja`→`ja`, `ko`→`ko`, `zh-Hans`/`zh-Hant`→`zh`; tiếng Anh không cho văn hóa mặc định, vì văn bản tiếng Anh có thể mang
văn hóa bất kỳ (otome, isekai, xianxia bản Anh thường mang văn hóa Á). Khi có bối cảnh mà không có văn hóa thì chỉ
dùng dòng chung. Khi không có gì, prompt chỉ có dòng hướng dẫn cách suy xưng hô; dòng này thuộc phần quy tắc xưng
hô chung (`ADDRESSING_RULES`), cần kiểm xem quy tắc hiện có đã nói đủ chưa trước khi thêm. Hàm trả bối cảnh chính,
danh sách phụ và văn hóa (mỗi giá trị có thể `null`); mọi nơi gọi `suggestRegister` đổi sang hàm này, kể cả chat.
`suggestRegister` cũ xóa khi không còn nơi gọi.

**6. Bản chụp ghi giá trị thay vì mã bảng.** `ContextSnapshot` đổi trường `register` thành `{ setting, extra,
culture }`, và phiên bản bản chụp tăng. Bản chụp cũ có `register` kiểu chuỗi: khi dựng lại request, bộ đọc ánh xạ mã
cũ qua bảng bí danh; hash đã lưu không được tính lại hay ghi đè. Hash của bản chụp mới khác hash cũ cho cùng tác
phẩm; đây là hệ quả đã nêu trong proposal. `rebuildTranslateRequest` đã trả `matches` cho biết builder hiện tại có
tái tạo đúng `contextHash` không; bản chụp cũ có thể cho `matches = false` sau khi đổi nội dung bảng, và không coi
đó là lỗi. Tăng phiên bản prompt dịch cùng lúc.

**7. Quy ước kính ngữ theo văn hóa.** Profile ngôn ngữ (`japanese()`, `korean()`, `english()`...) hiện chọn theo
`sourceLang`. Thêm lớp chọn profile theo văn hóa khi có văn hóa, và quay về `sourceLang` khi chưa có. Đưa chính sách
hậu tố của tác phẩm vào `korean()` như `japanese()` đã nhận: mặc định Việt hóa `-ssi`, dịch `오빠`/`형`/`선배` theo vai
(`선배` xếp theo thâm niên nên gọi trống dịch "tiền bối", chỉ dịch "anh/chị" khi biết tuổi), và chế độ giữ hậu tố
giữ nguyên `oppa`/`hyung`/`sunbae`. `형님` cần giới tính người nói. Phần chung của `english()` (I/you không cho biết
quan hệ) giữ cho mọi văn bản tiếng Anh vì nó nói về ngôn ngữ, không về văn hóa; dòng "tên Latinh" của nó nhường cho
profile văn hóa Trung khi văn hóa gốc là `zh`.

**8. Điều kiện theo thẻ nhân vật nằm trong ghi chú dòng.** Dòng có điều kiện (ví dụ "em" của hầu gái) ghi điều kiện
bằng chữ trong `notes`, dựa vào trường thẻ nhân vật đã có (giới tính, vai, ghi chú); không thêm trường mới. Bảng
mặc định ghi cặp không điều kiện ("tôi – tiểu thư"). Đây là điều chỉnh cho nghi can lỗi Rion xưng "em" với Milly
(giả thuyết T3 trong docs, chưa kiểm chứng), nên 6.1 đo lại trước khi coi là đã sửa.

**9. Giao diện.** Form dùng một thành phần chip chọn nhiều, một ô chọn bối cảnh chính, một ô chọn nhiều cho bối
cảnh phụ và một ô chọn văn hóa, có "Tự suy" và "Không dùng bảng". Tuân theo DESIGN.md hiện hành; cần đọc nó trước khi
dựng giao diện. Form hiện đã có `WorkForm.tsx`, `workFormValues.ts`, `EditWorkDialog.tsx`, `CreateWorkScreen.tsx` dùng
chung giá trị form.

## Risks / Trade-offs

- [Nội dung bảng chủ yếu là suy luận ngôn ngữ, chưa đo bằng model; nhiều nguồn chỉ đọc qua tóm tắt tìm kiếm] → Chỉ
  đưa vào dữ liệu các dòng có nhãn độ tin cậy chấp nhận được trong tài liệu khảo sát; dòng còn lại để phần "đề
  xuất". Đo bằng một lần dịch thử trên các truyện có lỗi xưng hô đã ghi trong `translation-run-2026-10-22.md` trước
  khi bật cho mọi tác phẩm.
- [Hai câu về Harry Potter trong docs hiện có ("hơn 50 cách", Draco "tao – mày") không xác minh được] → Kiểm lại nguồn
  khi cập nhật `vietnamese-addressing.md` (6.2); không đưa vào dữ liệu bảng.
- [Hash bản chụp đổi, `contextChanged` có thể bật với lượt đang chạy] → Chỉ đổi khi người dùng lập kế hoạch mới; bản
  chụp lưu theo lượt nên lượt đang chạy không bị ảnh hưởng.
- [Bỏ mặc định `en-western` làm các truyện Anh đang dùng bảng này mất bảng] → Ghi rõ trong tài liệu module và hiện
  gợi ý "chưa chọn bối cảnh" trong form; người dùng chọn bối cảnh để có lại bảng.
- [Tín hiệu chip mâu thuẫn, ví dụ Đô Thị cùng Fantasy] → Không suy ra bối cảnh nào và gợi ý chọn bối cảnh chính.
- [Tổ hợp không có nghĩa, ví dụ `cultivation` + `west`] → Ghép ra bảng chỉ có dòng chung (xem spec), không lỗi.
- [Bảng dài thêm làm tăng token mỗi lô, nhất là khi ghép nhiều bối cảnh] → Trần dòng trong test; dòng ít giá trị để
  ngoài dữ liệu; đo số token ở 6.1.

## Migration Plan

1. Thêm cột `setting`, `settings_extra`, `culture` ở schema tác phẩm v18 kèm fixture `work-v18.schema.sql` và cập nhật
   các test snapshot schema; tác phẩm cũ mở ra với các giá trị `NULL`.
2. Đổi bản chụp và bộ đọc bản chụp cũ cùng lúc với phiên bản prompt mới.
3. Chuyển dữ liệu bảng sang hai tầng và đưa bảng bí danh vào; so sánh văn bản bảng ghép với bảng phẳng cũ cho các mã
   cũ để biết thay đổi nào là có chủ ý.
4. Đổi các nơi gọi sang `resolveRegister`, rồi giao diện chip.
5. Rollback: các cột mới nullable nên bỏ qua được; phần mã đọc bản chụp giữ khả năng đọc cả hai dạng cho tới khi chắc
   chắn không còn bản chụp cũ cần dựng lại.

## Open Questions

- Số dòng tối đa của một bảng ghép: 14 hay thấp hơn, sau khi đo chi phí token trên một chương thật.
- Mã chip ổn định (`id`) hay chỉ nhãn tiếng Việt, nếu sau này có ngôn ngữ giao diện khác.
- Các câu hỏi về nội dung từng dòng (hôn phu "tôi – cô" hay "ta – nàng", cấp dưới → sếp "tôi" hay "em", "điện hạ" hay
  "bệ hạ" cho vua Joseon, "huân tước" hay "ngài" cho Lord, game riêng cho từng văn hóa hay chung): nằm trong mục
  câu hỏi mở của bốn tài liệu khảo sát và được chốt ở tác vụ 1.1 khi chọn dòng; chúng đổi nội dung dữ liệu, không đổi
  spec hay cách làm.
