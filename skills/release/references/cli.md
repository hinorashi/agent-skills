# Công cụ release độc lập

## Nguồn và phạm vi

Được mang sang từ `scripts/release.mjs` và `scripts/release.test.mjs` của Ganttz
tại commit `80ce47369c655b405aae5b51a708014ba5e1b3d6`. Bản đóng gói bổ sung trailer
Copilot cho commit release và kiểm thử tương ứng. Không cần truy cập Ganttz lúc chạy.

Yêu cầu Node.js hiện đại hỗ trợ `node:test`, Git, curl và terminal tương tác. Cần
npm nếu kho có `package.json`; bài test HTTPS cục bộ cần openssl. Không có dependency
npm cần cài cho chính công cụ.

Hỗ trợ một gói npm ở gốc với `package-lock.json` tùy chọn, hoặc không có manifest.
Không hỗ trợ monorepo/workspaces, `npm-shrinkwrap.json`, build metadata `+...`,
registry publishing, artifact hay deploy. Changelog phải nằm ở gốc, được Git theo
dõi, dùng Keep a Changelog với `[Unreleased]` có ghi chú.

## Lệnh

Trong các ví dụ, thay `/duong-dan/skill-release` bằng đường dẫn thật đến skill.
Chạy từ **kho đích**; không chạy phát hành ngay trong kho chứa skill để thử công cụ.

```bash
node /duong-dan/skill-release/scripts/release.mjs --help
node --test /duong-dan/skill-release/scripts/release.test.mjs

node /duong-dan/skill-release/scripts/release.mjs 1.2.0
node /duong-dan/skill-release/scripts/release.mjs v1.2.0 --name "Ứng dụng 1.2.0"
node /duong-dan/skill-release/scripts/release.mjs 1.3.0-rc.1 --prerelease
```

Nếu người dùng muốn cài vào kho, sao chép `release.mjs` vào vị trí đã thống nhất
và có thể khai báo `"release": "node scripts/release.mjs"` trong npm scripts.
Commit bước cài đặt đã được duyệt trước khi chạy release mới.

| Tùy chọn | Ý nghĩa |
|---|---|
| `--remote <tên>` | Remote đẩy, mặc định `origin`; chỉ chấp nhận đúng một URL đẩy |
| `--provider github\|gitea` | Bắt buộc nếu máy chủ không phải github.com/gitea.com |
| `--api-url <URL>` | API HTTPS thuộc cùng máy chủ; GitHub công cộng dùng api.github.com |
| `--name <tên>` | Tiêu đề release, mặc định tên tag |
| `--prerelease` / `--stable` | Ghi đè trạng thái suy ra từ hậu tố SemVer |
| `--fast` | Bỏ npm test/build, không bỏ xác nhận hoặc kiểm tra an toàn khác |
| `--delete <phiên-bản>` / `-d` | Xóa release và tag sau xác nhận riêng |

Nhận `1.2.0` hoặc `v1.2.0`; tag luôn là `v1.2.0`, manifest và changelog dùng
`1.2.0`. Không có `--yes`, `--dry-run` hoặc chế độ công bố không tương tác.
`NO_COLOR=1` tắt màu đầu ra.

## Trình tự và quyền ghi

1. Với phát hành mới, yêu cầu cây Git sạch, HEAD gắn với nhánh, tag chưa tồn tại;
   xác minh remote, API và khả năng push. Không fetch/rebase tự động.
2. Đồng bộ phiên bản bằng `npm version --no-git-tag-version --ignore-scripts`
   nếu có npm, chuyển ghi chú `[Unreleased]` sang phiên bản có ngày địa phương,
   giữ `[Unreleased]` trống và cập nhật liên kết tham chiếu.
3. Chạy npm `test` và `build` được khai báo. Không chạy e2e riêng, không chờ CI.
4. Hiển thị diff, kho/nhánh và commit cục bộ sẽ đẩy; hỏi `[y/N]`.
5. Khi đồng ý, commit `chore: release version X.Y.Z` với trailer Copilot, tạo tag
   có chú thích, push nguyên tử nhánh/tag và tạo/xác minh release qua API.

HEAD đã có đúng phiên bản và ghi chú: không tạo commit mới, chỉ kiểm tra, xin
duyệt rồi tag/push/công bố. Nhánh tiếp tục từ tag có sẵn không bump, không sửa
changelog và không chạy lại test/build; agent cần báo và kiểm tra phần thiếu riêng.

Xác thực qua Git credential helper hoặc biến môi trường có sẵn `GITEA_TOKEN`,
`GH_TOKEN`/`GITHUB_TOKEN`. Không yêu cầu dán token vào chat; không ghi token vào
lệnh, URL hoặc tệp dự án. Thiếu xác thực thì dừng với hướng dẫn cấu hình an toàn.

## Khi hủy hoặc thất bại

| Trạng thái | Hành vi |
|---|---|
| Trả lời không ở bước cuối | Hoàn tác đúng tệp công cụ đã chuẩn bị nếu chúng không bị sửa thêm; không commit/tag/push |
| Tệp đổi trong lúc chờ | Giữ lại để kiểm tra, không ghi đè thay đổi mới |
| Test/build/hook lỗi | Giữ tệp/staging để kiểm tra, không reset hoặc amend |
| Đã commit/tag nhưng push lỗi | Giữ commit/tag; kiểm tra remote trước khi xử lý, không tự xóa hoặc dời tag |
| Tag đã đẩy nhưng chưa có release | Chạy lại cùng lệnh; kiểm tra ghi chú tại tag rồi xin duyệt công bố |
| Tag chỉ có trên remote | Xác minh rồi fetch đúng tag trước khi chạy lại; không tạo tag trùng |
| Release đã tồn tại và khớp | Báo URL đã xác minh; không tạo thêm |
| Release đã tồn tại nhưng khác | Dừng, không ghi đè |
| API lỗi không rõ kết quả | Báo release có thể đã tạo; kiểm tra máy chủ trước khi thử lại |

Xóa chỉ theo yêu cầu cụ thể: công cụ liệt kê release, tag remote/cục bộ rồi hỏi
xác nhận; giữ commit release và các tệp phiên bản/changelog. Nếu xóa một phần thất
bại, báo phần đã xóa và kiểm tra trước khi tiếp tục.

API có thể tự tạo tag nếu tag bị xóa giữa kiểm tra và lúc tạo release; kiểm tra
trước/sau không loại bỏ hoàn toàn cuộc đua này. Không hứa quy trình nguyên tử từ
commit đến API; chỉ lần push nhánh/tag dùng `--atomic`.

## Kiểm thử an toàn

```bash
node --test skills/release/scripts/release.test.mjs
```

Bộ test dùng kho Git tạm, remote bare cục bộ, API giả lập và HTTPS loopback cho
curl; không phát hành lên GitHub/Gitea thật. Giữ test đi cùng script khi thay đổi
công cụ. Các ca trong `evals/evals.json` kiểm tra quyết định của agent và cần được
chạy riêng; chúng không phải kết quả benchmark đã thực hiện.
