# Nhật ký thay đổi

Mọi thay đổi đáng chú ý của skill `release` được ghi tại đây theo
[Keep a Changelog 1.1.0](https://keepachangelog.com/vi/1.1.0/). Phiên bản theo
`metadata.version` trong [SKILL.md](./SKILL.md) và [SemVer](https://semver.org/lang/vi/).

## [Unreleased]

### Added

- Ra mắt skill `release` (khai báo `metadata.version` 1.0.0): quy trình phát hành có
  xác nhận trên GitHub hoặc Gitea, ưu tiên quy trình phát hành sẵn có của kho; chỉ
  chuẩn bị/xem trước khi người dùng chưa yêu cầu công bố.
- Công cụ độc lập [`scripts/release.mjs`](./scripts/release.mjs), không cần dependency
  npm: đồng bộ phiên bản, chuyển `[Unreleased]` sang phiên bản có ngày, chạy npm
  `test`/`build`, hiển thị diff rồi hỏi `[y/N]` trước khi commit, tạo tag, push nguyên
  tử và tạo/xác minh release qua API.
- Tag luôn có tiền tố `v` (`v1.2.0`), còn manifest và changelog dùng `1.2.0`; hậu tố
  SemVer mặc định là prerelease, ghi đè bằng `--prerelease`/`--stable`.
- `--fast` bỏ npm test/build nhưng giữ xác nhận và các kiểm tra an toàn; `--delete`
  xóa release và tag sau xác nhận riêng, giữ commit, phiên bản và changelog.
- Trả lời không ở bước xác nhận cuối sẽ hoàn tác các tệp công cụ đã chuẩn bị; chạy lại
  cùng lệnh để tiếp tục công bố khi tag đã đẩy nhưng chưa có release.
- Giữ màu đầu ra (tắt bằng `NO_COLOR=1`); xác thực qua Git credential helper hoặc
  `GITEA_TOKEN`, `GH_TOKEN`/`GITHUB_TOKEN`, không yêu cầu dán token vào chat.
- [Hợp đồng sử dụng và cách khôi phục](./references/cli.md) cùng bộ kiểm thử
  [`release.test.mjs`](./scripts/release.test.mjs) chạy bằng `node --test`.
