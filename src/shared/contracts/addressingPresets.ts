/**
 * Luật xưng hô chung cho mọi tác phẩm. Bảng gợi ý theo bối cảnh và văn hóa nằm ở `./addressing/`
 * (change `add-multilingual-addressing-presets`); bảng chỉ dùng khi một cặp nhân vật **chưa có** trong ma trận
 * xưng hô đã duyệt, cặp đã duyệt luôn thắng. Thứ quyết định cặp là quan hệ; đại từ của bản gốc là tín hiệu
 * giọng điệu (お前 so với 君, 你 so với 您), không phải bảng đổi từng đại từ.
 */

/** Gọi tên và lược đại từ: đúng với mọi ngôn ngữ nguồn, nên vừa ở luật chung vừa đi vào chat. */
export const NAME_ADDRESSING_RULE =
  'Khi bản gốc gọi tên hoặc chức danh thì giữ cách gọi tương ứng theo quy ước tên; có thể lược đại từ nếu câu vẫn rõ và tự nhiên, không nhét đủ cặp xưng hô vào mọi câu.'

/** Quy tắc xưng hô chung cho mọi bộ bối cảnh. */
export const ADDRESSING_RULES = [
  'Cặp xưng hô đã duyệt trong <addressing> là bắt buộc, kể cả khi nhân vật nói gắt; bảng mặc định chỉ dùng cho cặp chưa có ở đó.',
  'Quan hệ giữa hai người quyết định cặp xưng hô; đại từ của bản gốc là tín hiệu về giọng, tính cách và mức thô hay lịch sự, không phải bảng quy đổi từng chữ.',
  'Khi bản gốc đổi cách xưng gọi giữa cảnh (giận, mỉa mai, chuyển sang kính ngữ), thể hiện thay đổi bằng giọng điệu, tên gọi hoặc kính ngữ trong phạm vi quy ước đã duyệt; không tự phá cặp đã chốt chỉ vì nhân vật giận.',
  'Chỉ đổi cặp theo mốc có trong truyện (tỏ tình, cưới, bái sư, lộ thân phận…), không đổi sớm hơn nguyên tác.',
  'Không dùng "tôi – bạn" trong lời thoại.',
  'Giọng vùng miền (tớ – cậu hay tui – ông/bà) theo tính cách nhân vật, không theo mặc định chung.',
  'Khi chưa có cặp đã duyệt và không có dòng nào phù hợp, suy cặp từ tuổi tương đối, quan hệ, mức trang trọng và chức danh hay tước vị giữa hai người, rồi giữ nguyên cặp đó khi quan hệ chưa đổi; không gán một cặp cố định cho cả truyện.',
  'Người kể gọi mỗi nhân vật bằng một đại từ ngôi ba cố định cho cả truyện; chỉ đổi khi thái độ của người kể đổi theo mốc truyện.',
  NAME_ADDRESSING_RULE
]
