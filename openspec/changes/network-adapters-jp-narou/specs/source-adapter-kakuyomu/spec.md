## REMOVED Requirements

### Requirement: Availability is controlled by a release gate
**Reason**: Ngày 2026-10-24 chủ sản phẩm bỏ yêu cầu nghiên cứu ToS, smoke test live và phê duyệt riêng cho
từng adapter; adapter do Mira phát hành là bật.
**Migration**: Kakuyomu đã được bật từ 2026-10-11 nên hành vi người dùng không đổi. Trường `releaseGate` và
tùy chọn `allowUnreleased` bị gỡ khỏi manifest và registry.
