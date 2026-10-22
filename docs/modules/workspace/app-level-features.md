# Tính năng toàn app cho thanh bên chung

Cập nhật: 2026-10-09 · Trạng thái: **Quan sát** (phần 1–2), **Đề xuất** (phần 3–4), **Đã chốt** (phần 5),
**Đã triển khai trong working tree** (phần 6), **Lộ trình** (phần 7).
Chủ trì: chủ sản phẩm.

## Câu hỏi chương này trả lời

Ngày 2026-10-08, [nghiên cứu thanh bên](sidebar-research.md#6-kết-luận) chốt không dùng rail, vì ngoài
một tác phẩm Mira chỉ có hai đích là Thư viện và Cài đặt. Kết luận đó cũng ghi: cân lại khi có thứ dùng
chung vượt khỏi một truyện và hay mở. Chủ sản phẩm muốn có thanh bên chung, nên câu hỏi là: **tính năng
toàn app** nào (nằm ngoài mọi tác phẩm) đáng làm, để thanh bên có lý do tồn tại?

Tính năng bên trong một tác phẩm nằm ở [tính năng của đối thủ](competitor-features.md).

## Nguồn

Đọc ngày 2026-10-08. **[mã]** đọc mã nguồn; **[docs]** tài liệu chính thức; **[chưa kiểm]** hiểu biết
chung, chưa đối chiếu.

| App | Nguồn |
| --- | --- |
| GalTransl desktop | [`Sidebar.tsx`](https://github.com/GalTransl/GalTransl/blob/main/desktop/src/components/Sidebar.tsx), [`zh-CN/common.json`](https://github.com/GalTransl/GalTransl/blob/main/desktop/src/i18n/locales/zh-CN/common.json) [mã] |
| AiNiee | [`AppFluentWindow.py`](https://github.com/NEKOparapa/AiNiee/blob/main/UserInterface/AppFluentWindow.py) [mã] |
| LinguaGacha | [`navigation/schema.ts`](https://github.com/neavo/LinguaGacha/blob/main/src/frontend/app/navigation/schema.ts) [mã] |
| Mihon (Tachiyomi) | [`HomeScreen.kt`](https://github.com/mihonapp/mihon/blob/main/app/src/main/java/eu/kanade/tachiyomi/ui/home/HomeScreen.kt), `MoreScreen.kt` [mã] |
| Novelcrafter | [Prompt library](https://www.novelcrafter.com/help/docs/prompts/prompt-library), [Series codex](https://www.novelcrafter.com/help/docs/codex/series-codex) [docs] |
| Sudowrite | [Plugins](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/how-do-i-use-plugins/vuk8oVgWv5K7ZAE68D5Smi) [docs] |
| Ulysses, Notion, Readwise Reader | [Ulysses library](https://help.ulysses.app/ulysses-library), [Notion sidebar](https://www.notion.com/help/navigate-with-the-sidebar), [Reader navigation](https://docs.readwise.io/reader/docs/faqs/navigation) [docs] |
| Crowdin, memoQ, Smartcat, Phrase, Trados | [Crowdin](https://support.crowdin.com/crowdin-intro/), [memoQ resources](https://memoquickies.substack.com/p/they-aint-heavy-theyre-my-resources), [Smartcat assets](https://smartcat-company.helpjuice.com/understanding-linguistic-assets), [Phrase](https://support.phrase.com/hc/en-us/articles/5709748435484), [Trados](https://web.atanet.org/webinars/ataWebinar173_trados_handout.pdf) [docs] |
| Calibre, Claude/ChatGPT desktop, Cursor, Kindle | [chưa kiểm] |

## 1. Đối thủ đặt gì ở cấp app (quan sát)

- **GalTransl** [mã], gần Mira nhất vì cũng có nhiều dự án. Trên: **Trang chủ** (dự án gần đây, tạo
  mới) và **Agent** (chat ngoài mọi dự án, chấm xanh khi agent đang chạy). Giữa: **các dự án đang mở**,
  mỗi dự án bung ra Dịch / Văn bản / Từ điển dự án / Bảng tên / Cấu hình và có chấm "đang dịch". Đáy:
  **Model** (chấm cảnh báo khi chưa cấu hình), **Từ điển chung** cho mọi dự án, Cài đặt. Repo còn có
  trang mẫu prompt và hướng dẫn chung, nhưng không có link trên thanh bên.
- **AiNiee** [mã], một dự án: nhóm **Bảng dùng chung** (thuật ngữ, bảng không dịch, thay thế trước/sau
  dịch), nhóm Prompt (nền, nhân vật, bối cảnh, văn phong, câu mẫu), đáy có **Nhật ký chạy** và Cài đặt.
- **LinguaGacha** [mã], một dự án: Model, Agent, Hiệu đính, Bàn làm việc, Skills, các bảng quy tắc,
  Phòng thí nghiệm.
- **Novelcrafter** [docs]: **thư viện prompt** với mặc định ba tầng tài khoản → series → truyện; **codex
  của series** dùng chung cho mọi cuốn, mục codex chuyển qua lại giữa series và cuốn. Kết nối AI nằm
  trong menu hồ sơ, không phải mục thanh bên.
- **Mihon** [mã], app đọc truyện: thanh chính **Thư viện, Cập nhật, Lịch sử, Duyệt nguồn, Thêm**; "Thêm"
  chứa **Hàng đợi tải**, Danh mục, **Thống kê**, Cài đặt. "Cập nhật" gom chương mới của mọi bộ truyện,
  chạy theo lịch.
- **Ulysses, Notion, Readwise** [docs]: bộ lọc toàn cục (7 ngày gần đây, Thùng rác), Trang chủ có mục
  gần đây và việc cần chú ý, Tìm kiếm là mục cố định ở đầu.
- **CAT/TMS** [docs]: Crowdin có Dự án, Hoạt động, Việc của tôi; TM, glossary, style guide là tài nguyên
  cấp tài khoản. memoQ gom TM, termbase, QA profile vào **Resource Console**, có cột "đang dùng ở dự án
  nào" và "lần dùng cuối".
- **Calibre** [chưa kiểm]: thư viện ảo lưu bằng truy vấn; chỉ báo **Jobs** ở góc dưới mở danh sách tác
  vụ nền.

## 2. Mẫu lặp lại (quan sát)

- Mục toàn app hay gặp nhất: **Trang chủ**, **tài nguyên dùng chung** (từ điển, prompt), **tác vụ nền**,
  **cập nhật từ nguồn** (ở app đọc truyện).
- **Chấm trạng thái thay cho thêm mục:** GalTransl đặt chấm "đang chạy" lên dự án và Agent, chấm cảnh
  báo lên Model; Mihon và Calibre báo số tác vụ trên icon.
- **Model, nhật ký, thùng rác** hiếm khi có chỗ riêng ở đầu thanh bên; nếu có thì ở đáy.
- **Tìm kiếm** là thao tác gõ phím (Notion, Obsidian), không phải nơi để đến.

## 3. Mục ứng viên cho Mira (đề xuất)

Tần suất là đánh giá cho một người dịch làm một mình với nhiều tác phẩm.

| Mục | Đối thủ có | Làm gì ở Mira | Tần suất | Hiện trạng Mira |
| --- | --- | --- | --- | --- |
| **Trang chủ** | GalTransl, Notion, Readwise, Trados | Tiếp tục chương dở, tác vụ đang chạy hoặc lỗi, chi phí tuần này, hoạt động gần đây | Cao, màn mở app mỗi ngày | Chưa có |
| **Thư viện** | Tất cả | Lưới tác phẩm, tiến độ, bộ lọc lưu sẵn (Đang dịch, Có chương mới, Tạm dừng, Lưu trữ) | Cao | Dữ liệu có, giao diện đang dựng lại |
| **Tác vụ** | Mihon, Calibre, GalTransl, Cursor | Hàng đợi chung mọi truyện: dịch nhiều chương, trích thuật ngữ, nhập/xuất; tạm dừng, thử lại, lỗi, chi phí từng việc | Cao khi dịch hàng loạt; số trên icon có ích cả khi không bấm | Chưa triển khai; xem [roadmap agent](../proposals/agent-roadmap.md#2-tác-vụ-dịch-nhiều-chương) |
| **Kho dùng chung** | GalTransl, AiNiee, Novelcrafter, memoQ, Crowdin | Thuật ngữ, tên, bảng thay thế dùng cho nhiều truyện (cùng tác giả, cùng thể loại tu tiên); thấy "đang dùng ở truyện nào"; nhập Names.txt / VietPhrase.txt | Trung bình, sửa theo đợt nhưng là tài sản tích luỹ | Chưa có; glossary hiện theo từng tác phẩm |
| **Prompt & văn phong** | Novelcrafter, AiNiee, LinguaGacha, GalTransl, Sudowrite | Hồ sơ văn phong (cổ trang, đô thị, xưng hô), mẫu prompt, hướng dẫn chung mà tác phẩm kế thừa rồi ghi đè | Trung bình đến thấp: nhiều lúc đầu, sau hiếm | Văn phong theo tác phẩm đang mock |
| **Trợ lý AI** | GalTransl, Notion | Chat ngoài tác phẩm: hỏi điển cố, thành ngữ; nhờ agent làm việc trên cả thư viện | Cao | Có foundation trong mã; đường chạy đầu-cuối đang ở [giai đoạn 0–1](../proposals/agent-roadmap.md) |
| **Cập nhật** | Mihon, Readwise, lncrawl | Chương gốc mới của các truyện đang theo dõi; đưa vào hàng đợi dịch | Rất cao nếu có nguồn, không có nguồn thì bỏ | Nguồn đang mock |
| Thống kê & chi phí | Mihon, Sudowrite, Smartcat | Token và tiền theo model, truyện, ngày; số chương đã dịch | Trung bình; thẻ trên Trang chủ đủ cho hằng ngày | Chưa có |
| Nhật ký | AiNiee, LinguaGacha | Request, lỗi API, rate limit | Thấp, mở khi có sự cố | Chưa có |
| Thùng rác | Ulysses, Notion | Khôi phục tác phẩm, chương, thuật ngữ đã xoá | Rất thấp | Chưa có |
| Tìm toàn thư viện | Notion, Readwise, Obsidian | Tìm tên, thuật ngữ trong mọi bản gốc và bản dịch | Trung bình | Chưa có |
| Tra Hán Việt | Tiên Dịch, QuickTranslator | Âm Hán Việt, nghĩa | Cao nhưng là tra ngay trong editor | Chưa có |

## 4. Xếp chỗ (đề xuất)

**Thanh bên chung:**

| Vị trí | Mục | Ghi chú |
| --- | --- | --- |
| Đầu | Tìm (Ctrl+K) | Ô hoặc nút mở bảng lệnh; tìm tác phẩm, chương, thuật ngữ và nhảy lệnh |
| Chính | **Trang chủ** | Gộp Lịch sử và tóm tắt Thống kê |
| | **Thư viện** | Bộ lọc lưu sẵn có thể nằm ngay dưới, như Ulysses |
| | **Tác vụ** | Số việc đang chạy, chấm đỏ khi lỗi |
| | **Cập nhật** | Chỉ khi có Nguồn; có số chương mới |
| Tài nguyên | **Kho dùng chung** | Thuật ngữ và tên chung; muốn gọn thì gộp với mục dưới thành "Tài nguyên" có tab, như Resource Console của memoQ |
| | **Prompt & văn phong** | |
| | **Trợ lý AI** | Hiện khi vòng chat đầu-cuối đạt gate foundation |
| Giữa (tuỳ chọn) | Tác phẩm đang mở | Theo GalTransl: vài tác phẩm gần nhất, chấm đang dịch hoặc có đề xuất chờ; thay dải tab đã gỡ |
| Đáy | Cài đặt, theme | Chấm cảnh báo trên Cài đặt khi chưa có kết nối AI |

**Để trong Cài đặt:** model và kết nối AI; trang **Sử dụng** (chi phí chi tiết, mở được từ thẻ Trang chủ);
nhật ký và chẩn đoán (thông báo lỗi dẫn thẳng tới đây); thùng rác (Cài đặt › Dữ liệu, hoặc cuối Thư
viện); sao lưu, nhập/xuất cả thư viện.

**Để trong bảng lệnh:** tìm toàn thư viện, tra Hán Việt (cũng có trong panel editor), nhảy nhanh tới tác
phẩm hoặc "chương kế chưa dịch".

**Thứ tự làm gợi ý:** bản đầu của thanh bên chỉ cần **Trang chủ, Thư viện, Tác vụ** và đáy Cài đặt; hai
mục đầu dùng dữ liệu đã có. Kho dùng chung, Prompt & văn phong, Cập nhật và Trợ lý AI thêm vào khi tính
năng tương ứng chạy thật. Không đặt mục "Sắp có" lên thanh bên, để tránh lại cảm giác trống.

## 5. Quyết định

**Chốt ngày 2026-10-09:** mở lại kết luận "không rail" của [nghiên cứu thanh bên](sidebar-research.md#6-kết-luận)
và dùng **phương án A** của wireframe: thanh bên có nhãn, rộng 224 px, **thu được thành rail icon 48 px**.

- Thứ tự: Tìm (Ctrl K) · Trang chủ · Thư viện · Tác vụ · Cập nhật · nhóm **Tài nguyên** (Kho dùng chung,
  Prompt & văn phong, Trợ lý AI) · đáy Cài đặt và nút đổi nền.
- Không hiện "tác phẩm đang mở" trên thanh bên (phương án C không chọn).
- **Màn Chương tạm để ngoài**: ở màn Chương thanh bên ẩn, màn giữ nguyên cột danh sách chương và hai
  editor; Cài đặt và đổi nền trở lại cuối thanh trên. Bố cục màn Chương khi có thanh bên chốt sau.
  Ngày 2026-10-22: màn Chương có **activity bar** đổi nội dung sidebar như VS Code, xem
  [Tìm và thay thế](find-replace.md#6-chỗ-đặt-activity-bar-ở-màn-dịch-chương).
- Các mục chưa có tính năng thật vẫn hiện trên thanh bên và mở ra màn minh hoạ gắn nhãn "Sắp có", để
  chủ sản phẩm xem trước toàn bộ bố cục.

Còn mở: glossary dùng chung kế thừa thế nào (tác phẩm tự gắn kho, hay kho áp cho mọi tác phẩm rồi tác
phẩm ghi đè). Hướng hệ thống Nguồn và việc giữ trang Cập nhật đã chốt ngày 2026-10-10; website, lịch và
cách truy cập cụ thể vẫn theo [thiết kế nguồn đa quốc gia](../sources/system-design.md).

## 6. Hành vi đã có

- **Thanh bên** ([`AppNav`](../../../src/renderer/src/app/AppNav.tsx)): mục đang xem sáng lên; trong một tác
  phẩm và ở form tạo tác phẩm, mục Thư viện sáng. Thư viện có số tác phẩm chưa lưu trữ. Cài đặt có chấm
  cam khi chưa có kết nối AI. Nút đầu thanh hoặc Ctrl+B thu thành rail icon có tooltip; lựa chọn nhớ
  theo máy (`localStorage`, khoá `mira.navCollapsed`). Ở màn Chương, Ctrl+B vẫn ẩn/hiện cột danh sách
  chương như trước.
- **Hai tầng thanh trên** ([`AppShell`](../../../src/renderer/src/app/AppShell.tsx)): thanh tiêu đề cửa sổ
  chạy hết chiều ngang app và mang tên Mira; bên dưới, thanh bên chung và thanh của màn mới bắt đầu.
  Thanh của màn giữ tên màn ở bên trái
  ([`TopBarTitle`](../../../src/renderer/src/components/ui/TopBarActions.tsx)), nút riêng của màn ở bên phải.
- **Trang chủ** ([`HomeScreen`](../../../src/renderer/src/app/screens/home/HomeScreen.tsx)) là màn mở app khi
  không có tab tác phẩm nào để khôi phục. Thẻ "Tiếp tục dịch" là thật: tác phẩm sửa gần nhất, nút Dịch
  tiếp mở chương đang làm dở (hoặc mở tác phẩm khi chưa có chương), kèm tối đa ba tác phẩm khác. Thư viện
  trống thì hiện danh sách bước bắt đầu, bước kết nối AI tự đánh dấu xong khi đã có kết nối.
- **Thư viện** ([`LibraryScreen`](../../../src/renderer/src/modules/library/catalog/LibraryScreen.tsx)) là thật,
  thay chỗ placeholder "đang dựng lại": lưới thẻ tác phẩm mới sửa trước, lọc Tất cả / Đang dịch / Chưa
  bắt đầu / Tạm dừng / Lưu trữ (tác phẩm lưu trữ chỉ hiện ở bộ lọc của nó), tìm theo tên và tên gốc, báo
  số tệp tác phẩm không mở được.
- **Màn minh hoạ** (`MOCK_FEATURES` trong [`mockFeatures.ts`](../../../src/renderer/src/lib/mockFeatures.ts)):
  Tác vụ, Kho dùng chung, Prompt & văn phong, Trợ lý AI, bảng Tìm và lệnh (Ctrl K), và các thẻ
  số liệu, tác vụ, chương mới, hoạt động ở Trang chủ. Dữ liệu là chữ cố định, không đọc tệp, không gọi
  main, mọi nút bị khoá. (Màn **Cập nhật** và khu vực **Bản raw** đã được triển khai thật qua nền tảng
  Source System Foundation).

Wireframe đã duyệt (bốn phương án, chín màn) là tệp HTML tạm, không lưu trong repo. Ảnh chụp app ngày
2026-10-09 khớp phương án A.

## 7. Lộ trình: biến màn minh hoạ thành tính năng

Mỗi dòng là một tính năng sẽ có OpenSpec riêng trước khi làm. Xong dòng nào thì xoá mục tương ứng trong
`MOCK_FEATURES` và nhãn "Sắp có".

| Tính năng | Màn minh hoạ cho thấy | Cần có trước | Liên quan |
| --- | --- | --- | --- |
| **Hàng đợi tác vụ toàn app** | Tác vụ của mọi tác phẩm: tiến độ, tốc độ, token, chi phí, thời gian còn lại; thử lại, tạm dừng, huỷ, chạy trước; lỗi hết hạn mức tự thử lại; biểu đồ tốc độ; số việc đang chạy và chấm lỗi trên thanh bên | Task bền trong main, chia item, retry, ghi usage | [Giai đoạn tác vụ nhiều chương](../proposals/agent-roadmap.md#2-tác-vụ-dịch-nhiều-chương) |
| **Số liệu ở Trang chủ** | Chương dịch tuần này, chi phí tuần này, đề xuất chờ duyệt, lỗi kiểm tra; hoạt động gần đây | Ghi usage theo lượt gọi; đếm đề xuất theo tác phẩm (đã có theo chương); kiểm tra chất lượng | [Tính năng của đối thủ](competitor-features.md) hạng 2–3 |
| **Cập nhật chương mới** (Đã xong nền tảng) | Chương gốc mới của các truyện đang theo dõi, gom theo ngày; xem diff trước khi áp dụng; nguồn lỗi | **Đã triển khai** cho tệp/thư mục cục bộ (`source-system-foundation`); adapter mạng là follow-up | [Thiết kế nguồn đa quốc gia](../sources/system-design.md); [nghiên cứu cơ chế](../sources/updates-research.md) |
| **Kho dùng chung** | Bộ thuật ngữ dùng cho nhiều tác phẩm, số lần khớp, mục bị tác phẩm ghi đè, nhập Names.txt / VietPhrase.txt, bảng thay thế | Mô hình kế thừa kho → tác phẩm; trình đọc Names.txt / VietPhrase.txt | [Glossary](../context/glossary.md); câu hỏi còn mở ở phần 5 |
| **Prompt & văn phong** | Hồ sơ văn phong: giọng văn, xưng hô mặc định, cách phiên âm tên, câu mẫu; tác phẩm kế thừa rồi ghi đè; ước lượng token gửi kèm | Lắp ngữ cảnh đọc được hồ sơ; khu vực Văn phong của tác phẩm | Lát 5 của [lộ trình Ngữ cảnh](../context/roadmap.md) |
| **Trợ lý AI toàn ứng dụng** | Chat không gắn chương/tác phẩm, đọc được cả thư viện, resolve target và thao tác trực tiếp có Undo | Có các khối foundation; còn nối và kiểm chứng runtime | [Roadmap agent](../proposals/agent-roadmap.md) |
| **Tìm và lệnh (Ctrl K)** | Một ô tìm cho tác phẩm, chương, thuật ngữ, câu trong bản dịch, và lệnh có phím tắt | Chỉ mục tìm kiếm toàn thư viện; danh sách lệnh | [Tính năng của đối thủ](competitor-features.md) hạng 10–11 |

Thứ tự cho Trợ lý và tác vụ theo [roadmap agent](../proposals/agent-roadmap.md). Các mục toàn ứng dụng
khác được ưu tiên riêng theo nhu cầu sản phẩm.

---

[Phiên làm việc theo tác phẩm](README.md) · [Những gì nên đặt ở thanh bên](sidebar-research.md) ·
[Tính năng của đối thủ](competitor-features.md)
