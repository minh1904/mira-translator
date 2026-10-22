# Soát task dịch thật ngày 2026-10-22

Cập nhật: 2026-10-22 · Trạng thái: **quan sát** từ một task dịch thật và **đề xuất** sửa, chưa triển khai.

## Bối cảnh

Tác phẩm "New" (Nhật → Việt, 30 chương, người kể ngôi thứ nhất là Mikkanen). Task dịch nền tạo lúc 17:45 bằng
lệnh "Dịch full 30 chương cho tôi tự trích glossary ra", model `gemini-3.8-flash` (`thinking: high`), chiến lược
`extract_then_review`. Lúc soát, task đã dịch xong chương 1–6 và đang dịch chương 7; glossary có 46 mục đã duyệt,
đều do AI trích.

Ba agent soát đối chiếu từng đoạn nguồn với bản dịch của chương 1–7. Nghĩa nhìn chung bám nguồn: không sót đoạn,
không còn chữ Nhật, thuật ngữ chính khớp glossary. Các lỗi lặp lại dồn về ba nguyên nhân trong cách app lắp ngữ
cảnh và chia việc, cộng một lỗi trích glossary. Người dùng nhận xét cùng model dịch trên web thì không lệch như vậy;
các quan sát dưới đây giải thích vì sao.

## Quan sát

### 1. Chương không nhắc tên người kể thì mất toàn bộ cặp xưng hô

- Snapshot ngữ cảnh của lượt dịch chương 2 (`translate_run_context`) có `dyads: []`, nhân vật chỉ có Isfana.
  Chương 1 có 2 cặp, chương 3 có 12 cặp.
- `takeContextSnapshot` (`src/main/services/ai/translate/contextSnapshot.ts`) lọc cặp bằng `dyadsMentionedIn`
  (`translatePrompt.ts`): chỉ giữ cặp khi **cả hai** nhân vật có tên trong nguồn của chương. Nhân vật cũng lọc
  theo tên (`charactersMentionedIn`).
- Nguồn chương 2 nhắc ミッカネン 0 lần; Mikkanen chỉ là オレ (36 lần) và bị Isfana gọi 貴様 (8 lần). Cặp
  "Isfana → Mikkanen: tôi – anh" vì vậy bị bỏ.
- Hậu quả: cả chương 2 Isfana xưng "ta – ngươi" (10 chỗ "ngươi"), trong khi chương 1 và 3 là "tôi – anh". Không
  phải model làm trái chỉ dẫn: prompt không có chỉ dẫn nào, và "ngươi" là cách dịch 貴様 thường gặp.
- Bộ lọc này trái với nguyên tắc đã ghi ở [Lắp ngữ cảnh](context-assembly.md): nhân vật và xưng hô cần phạm vi
  rộng hơn đoạn vì tiếng Nhật thường không nhắc lại tên. Với truyện ngôi thứ nhất, chuyện người kể không được gọi
  tên trong cả chương là bình thường, nên lỗi sẽ lặp ở nhiều chương.

### 2. Lô nhỏ và không thấy bản dịch của lô trước

- Mục model `gemini-3.8-flash` không đặt `inputTokenLimit`, nên `planBatches` dùng mặc định 30 câu hoặc 1.200
  token mỗi lô. `agent_operation_batch` ghi 4–6 lô mỗi chương (chương 2: 5 lô, 128 câu).
- Mỗi lô chỉ kèm `PREVIOUS_PARAGRAPHS = 3` đoạn **nguồn** liền trước (`chapterTranslationRunner.ts`), không kèm
  bản dịch đã có. Mỗi lô tự chọn lại đại từ, cấp bậc và cách dịch biệt danh.
- Khớp với các lỗi không nhất quán trong cùng chương: Mikkanen lúc "hắn", lúc "anh ta", lúc "anh" (chương 6);
  小隊 lúc "trung đội", lúc "tiểu đội" (chương 4); 凡人 "kẻ tầm thường"/"phàm nhân"; ガンギマリショタ hai cách.
- Trên web, model đọc cả chương trong một lượt và còn thấy bản dịch chương trước trong cuộc chat.

### 3. Đơn vị dịch là câu nên một lời thoại bị tách ngoặc

- Chương 4 có 80 đoạn nguồn nhưng gửi 118 đơn vị: segment cắt theo câu, kể cả bên trong 「」.
- 「お、俺の腕がぁぁぁっ！　くそ、くそ…」 thành hai đơn vị, mỗi đơn vị được bọc ngoặc riêng:
  “T-Tay taoooo!” “Mẹ kiếp…”. Người đọc tưởng là hai người nói. Chương 4 có 5 chỗ như vậy; chương 1 và 3 có dấu “
  thừa giữa câu, nhiều khả năng cùng cơ chế.

### 4. Glossary do AI trích ghi sai giới tính

- Mục nhân vật Morgreid ghi `gender: male`, `thirdPerson: "cậu ta"`, đã duyệt. Nguồn có 僕は女の子, 困った女,
  銀の髪の女. Bản dịch theo glossary nên chương 3–4 vừa gọi "cậu ta" vừa có "người phụ nữ phiền toái".
- Lỗi thuộc bước trích xuất ([AI trích xuất glossary](glossary-extraction.md)), không liên quan chia lô. Nó cho
  thấy `extract_then_review` vẫn cần người duyệt đọc mục nhân vật, nhất là giới tính khi nhân vật nữ xưng 僕.

### Lỗi dịch lẻ (không do hệ thống)

Chương 2: 後を追ってやる thành "đuổi theo đến cùng" (mất ý chết theo), 退きたまえ thành "Lùi lại đi". Chương 4:
"Anh dồn ép viên chỉ huy" sai chủ ngữ, 大隊 có chỗ thành "đại đội", còn "Mikkanen-sama". Chương 5: 精霊 thành
"yêu tinh" (glossary dùng "yêu tinh" cho 妖精). Chương 6: 負けなかった thành "không chịu thua".

## Đề xuất

Thứ tự theo tác dụng trên chi phí. Cả bốn đều là đề xuất, cần OpenSpec change trước khi làm.

1. **Không bỏ cặp xưng hô của người kể.** Giữ cặp khi ít nhất một nhân vật được nhắc tên, và luôn giữ cặp có
   người kể ngôi thứ nhất (trường `role` của nhân vật hiện để trống; cần cách đánh dấu người kể khi trích hoặc
   khi duyệt). Phương án đơn giản hơn: tác phẩm có ít cặp (ở đây 12) thì gửi hết cặp hiệu lực của chương. Đo lại
   bằng chương 2 của "New".
2. **Cho lô thấy bản dịch trước nó.** Kèm bản dịch của vài đoạn cuối lô trước, không chỉ nguồn. Việc này buộc các
   lô của một chương chạy tuần tự, đúng như ràng buộc đã ghi ở [Lắp ngữ cảnh](context-assembly.md) mục "Tất định
   và chạy song song".
3. **Lô cỡ chương cho model context lớn.** Mặc định 1.200 token quá nhỏ với Gemini Flash. Cân nhắc mặc định theo
   context window của model, hoặc gợi ý người dùng đặt `inputTokenLimit`. Cách tạm không cần sửa code: đặt
   `inputTokenLimit` cho mục `gemini-3.8-flash` (ví dụ 30.000) để mỗi chương đi một lần gọi; cách này chỉ chữa
   quan sát 2.
4. **Không cắt đơn vị dịch bên trong 「」.** Gom các câu của một lời thoại vào một đơn vị, hoặc gửi theo đoạn rồi
   ánh xạ lại về segment.

## Câu hỏi mở

- Lô lớn có làm tăng tỉ lệ thiếu ID hoặc bị từ chối nội dung không? Cần đo trước khi đổi mặc định (đề xuất 3).
- Người kể nên được đánh dấu lúc trích glossary tự động hay chỉ khi người dùng duyệt?
