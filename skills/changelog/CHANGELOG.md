# Nhật ký thay đổi

Mọi thay đổi đáng chú ý của skill `changelog` được ghi tại đây theo
[Keep a Changelog 1.1.0](https://keepachangelog.com/vi/1.1.0/). Phiên bản theo
`metadata.version` trong [SKILL.md](./SKILL.md) và [SemVer](https://semver.org/lang/vi/).

## [Unreleased]

### Added

- Ra mắt skill `changelog` (khai báo `metadata.version` 1.0.0): soạn và đối chiếu mục
  `[Unreleased]` từ thay đổi thực tế trong Git (gồm cả thay đổi chưa commit) theo
  Keep a Changelog; mặc định viết tiếng Việt có dấu, UTF-8 nếu kho chưa có quy ước.
- Chỉ ghi hành vi người dùng nhận thấy: gộp commit cùng kết quả, bỏ refactor/kiểm thử
  nội bộ, không ghi tính năng đã hoàn tác; chạy lại không làm tăng số mục trùng.
- Giữ nguyên lịch sử đã phát hành và định dạng tệp; không đổi phiên bản, gắn ngày,
  tạo tag, commit hay push. Dùng Changesets, towncrier hoặc fragment nếu kho đã có.
- [Hướng dẫn tích hợp](./references/integration.md) với mẫu chỉ dẫn thường trực tùy chọn,
  chỉ thêm khi người dùng đồng ý; khuyến nghị không dùng hook tự viết changelog.
