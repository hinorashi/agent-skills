---
name: release
description: "Chuẩn bị và thực hiện phát hành có xác nhận: hoàn thiện changelog, đồng bộ phiên bản, kiểm thử/build, xem diff, commit, tag, push và xác minh release trên GitHub hoặc Gitea. Dùng khi người dùng yêu cầu phát hành, release một phiên bản, công bố tag còn thiếu release hoặc xóa release cụ thể. Không dùng cho deploy đơn thuần, commit/push thông thường hoặc chỉ viết changelog. Chỉ công bố hoặc xóa khi có yêu cầu và xác nhận rõ ràng."
license: MIT
compatibility: "Git, Node.js hiện đại có node:test, curl; npm nếu kho có package.json. Công bố bằng script cần terminal tương tác và xác thực GitHub/Gitea. Test HTTPS cần openssl."
metadata:
  author: hinorashi
  version: "1.0.0"
---

# Phát hành có kiểm soát

Ưu tiên quy trình phát hành của kho. Bộ công cụ đi kèm là phương án độc lập,
không phải lý do để thay thế Changesets, semantic-release, release-please hoặc CI
đang hoạt động. Chuẩn bị không đồng nghĩa được phép công bố.

## 1. Đọc trạng thái và xác định ý định

- Đọc chỉ dẫn kho, tài liệu release, manifest/lockfile, changelog, workflow CI,
  trạng thái Git, nhánh, remote đẩy và tag liên quan. Không đọc hoặc in bí mật.
- Phân biệt **chuẩn bị/xem trước**, **phát hành**, **tiếp tục công bố tag** và
  **xóa**. “Tạo skill release” hay “viết ghi chú release” không cho phép phát hành.
- Xác nhận các giá trị còn thiếu: phiên bản, kho/remote đích, nhánh/commit, ổn định
  hay prerelease và cách công bố. Đề xuất SemVer dựa trên thay đổi, không tự chọn
  major/minor khi có nhiều cách hiểu hợp lý; tôn trọng chính sách phiên bản trước 1.0.
- Báo toàn bộ commit cục bộ sẽ được đẩy, không chỉ commit release. Không tự stage,
  stash, commit, xóa hoặc hoàn tác thay đổi sẵn có để làm sạch cây Git.
- Nếu chỉ yêu cầu chuẩn bị, dừng ở ghi chú, kế hoạch và diff các tệp được phép sửa;
  không chạy lệnh phát hành, vì script không có chế độ `--dry-run`.

## 2. Hoàn thiện ghi chú trước

Dùng skill `changelog` nếu có; nếu không, đọc diff/commit từ mốc phát hành đã xác
minh và ghi thay đổi đáng chú ý vào đúng một `[Unreleased]`, theo Keep a Changelog.
Tránh ghi trùng, giữ lịch sử và ngôn ngữ của kho, không suy diễn tính năng từ lời
hứa trong hội thoại. Ghi chú trống hoặc mơ hồ là điều kiện dừng, không phải lý do
để tự tạo nội dung chung chung.

Script không viết ghi chú. Nếu vừa sửa changelog hoặc cài script vào kho, cần một
bước commit được người dùng cho phép **trước** khi chạy phát hành mới. Không đưa
thay đổi không liên quan vào commit đó. Nếu cây Git còn bẩn, báo rõ và dừng.

## 3. Chọn công cụ

### Kho đã có quy trình

Dùng lệnh/CI chính thức sau khi hiểu các bước ghi và cơ chế duyệt của nó. Không
chạy song song script đi kèm, tự bump hai lần hoặc tạo release cạnh tranh.
Với GitHub, ưu tiên `gh` cho thao tác kiểm tra; không mặc định remote là GitHub.
Không tự thêm cơ chế phát hành nếu kho cần quyết định về nhiều gói hay registry.

### Kho phù hợp với script đi kèm

Đọc [hợp đồng công cụ và cách khôi phục](./references/cli.md) trước khi chạy.
Script hỗ trợ GitHub/Gitea, một gói npm ở gốc hoặc kho chỉ có changelog. Không hỗ
trợ workspaces, `npm-shrinkwrap.json`, build metadata `+...`, publish lên registry
hoặc tải artifact nhị phân. Nếu kho không phù hợp, dùng công cụ của kho hoặc hỏi
cách triển khai; không bỏ qua các ràng buộc bằng `--fast`.

- Chạy trực tiếp [scripts/release.mjs](./scripts/release.mjs) từ thư mục kho đích,
  dùng đường dẫn tuyệt đối đến skill. Cách này không làm bẩn kho để cài công cụ.
- Chỉ sao chép script và thêm npm script vào kho nếu người dùng muốn cài lâu dài;
  giữ tệp hiện có nếu khác nội dung, xin duyệt trước khi thay thế.
- Chạy [scripts/release.test.mjs](./scripts/release.test.mjs) để kiểm tra bản công
  cụ khi cài hoặc sửa nó; không chạy lại toàn bộ test công cụ cho mỗi release.
- Script dùng API trực tiếp cho cả GitHub/Gitea để cùng kiểm tra tag và nội dung
  công bố; không tạo thêm một release bằng `gh release create`.

## 4. Kiểm tra, xem trước và xác nhận

- Chạy kiểm tra cần thiết cho thay đổi: script chạy npm `test` và `build` nếu có,
  nhưng không tự chạy e2e hay CI. Với kho không dùng npm, chạy kiểm tra chính thức
  riêng. Báo rõ bước thiếu, bị bỏ qua hoặc chưa chạy.
- Chỉ dùng `--fast` khi người dùng yêu cầu bỏ qua và hiểu test/build sẽ không chạy.
  Hậu tố SemVer là prerelease mặc định; không ép `--stable` nếu chưa được yêu cầu.
- Hiển thị đích, phiên bản/tag, commit/nhánh, ghi chú, thay đổi phiên bản và phạm vi
  push trước khi xin duyệt commit/tag/push/công bố. Script hỏi `[y/N]` sau chuẩn bị
  và test/build; câu trả lời đồng ý cho phép toàn bộ chuỗi thao tác được hiển thị.
- Để người dùng xác nhận trong terminal tương tác. Không pipe `yes`, sửa script
  để tự duyệt hoặc gọi API `release()` với `confirm: async () => true` ngoài test.
  Nếu công cụ hiện tại không tương tác được, đưa lệnh cụ thể để người dùng chạy;
  không giả vờ đã phát hành hoặc lách kiểm tra TTY.
- Tôn trọng chính sách commit/trailer của kho. Bản script đi kèm thêm trailer
  Copilot; nếu chính sách khác, thống nhất trước khi điều chỉnh hoặc dùng quy trình
  của kho. Không bỏ hook ký commit hay tự amend để chữa lỗi.

## 5. Xác minh và phục hồi

- Sau khi công bố, kiểm tra tag trỏ đúng commit trên remote và release khớp tag,
  tên, ghi chú, trạng thái stable/prerelease. Dùng ghi chú tại commit của tag,
  không dùng changelog trong cây làm việc đã thay đổi.
- Báo URL đã xác minh, phiên bản, commit/tag và kết quả kiểm tra thực tế. Phân biệt
  “đã chuẩn bị”, “đã commit”, “đã đẩy tag” và “đã công bố”.
- Khi lỗi, báo trạng thái còn lại và bước khôi phục cụ thể. Không force-push, dời
  tag, xóa release hoặc reset cây Git để làm như chưa có lỗi. Nếu API timeout,
  kiểm tra trạng thái trên máy chủ trước khi thử lại.
- Tag đã đẩy nhưng thiếu release: kiểm tra tag cục bộ/remote trùng nhau rồi chạy lại
  đúng lệnh để tiếp tục; tag đã tồn tại nhưng chưa đẩy cần xử lý trạng thái trước,
  script không tự đẩy lại nhánh này. Release đã có phải khớp hoàn toàn; không ghi đè.
- Chỉ chạy `--delete` khi người dùng yêu cầu xóa đúng phiên bản. Giải thích thao tác
  xóa release, tag remote và tag cục bộ nhưng giữ commit/phiên bản/changelog; xin
  xác nhận riêng. Không dùng xóa như một bước sửa lỗi mặc định.
