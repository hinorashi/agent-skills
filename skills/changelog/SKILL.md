---
name: changelog
description: "Viết, rà soát và cập nhật changelog từ thay đổi thực tế trong Git theo Keep a Changelog. Dùng khi người dùng yêu cầu cập nhật CHANGELOG, ghi thay đổi đáng chú ý, tổng hợp Unreleased hoặc chuẩn bị ghi chú phát hành; cũng dùng khi quy trình release cần hoàn thiện ghi chú. Không tự phát hành, tạo tag, commit hay push. Không phải hook tự chạy sau mỗi thao tác sửa tệp."
license: MIT
compatibility: "Kho Git; dùng công cụ đọc tệp và Git. Không cần dịch vụ ngoài hoặc dependency bổ sung."
metadata:
  author: hinorashi
  version: "1.0.0"
---

# Changelog có bằng chứng

Ghi lại điều thay đổi đối với người sử dụng, không sao chép danh sách commit.
Mặc định chỉ cập nhật `[Unreleased]`; việc chốt phiên bản thuộc quy trình phát hành.

## 1. Xác định quy ước và phạm vi

- Đọc hướng dẫn kho, changelog hiện có, tài liệu sử dụng và trạng thái Git, gồm cả
  thay đổi staged, unstaged và tệp mới liên quan. Giữ nguyên thay đổi của người dùng.
- Tuân theo định dạng và ngôn ngữ đã được yêu cầu hoặc quy định trong kho. Nếu chưa
  có quy định, dùng tiếng Việt đầy đủ dấu, UTF-8 và Keep a Changelog 1.1.0.
  Giữ tên nhóm chuẩn: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.
- Nếu kho dùng Changesets, towncrier hoặc fragment theo PR, dùng cơ chế đó thay vì
  tạo thêm một nguồn changelog cạnh tranh.
- Với yêu cầu cho một thay đổi cụ thể, chỉ ghi thay đổi đó. Với yêu cầu tổng hợp,
  xác định mốc phát hành gần nhất thuộc lịch sử nhánh hiện tại; kiểm tra tag và
  nội dung changelog, không chỉ lấy tag có số lớn nhất hoặc commit mới nhất.
  Đọc cả commit trong khoảng đã chọn và diff cuối cùng, cộng thay đổi chưa commit.
- Khi có nhiều gói, nhiều chuỗi phát hành hoặc không xác định được mốc, hỏi trước.
  Nếu là lần đầu phát hành và đã xác nhận, dùng lịch sử từ đầu kho.
  Lịch sử hội thoại chỉ gợi ý nơi cần kiểm tra, không chứng minh tính năng đã tồn tại.

## 2. Chọn nội dung đáng ghi

- Đối chiếu mã nguồn, kiểm thử và tài liệu để xác nhận hành vi cuối cùng.
  Không ghi tính năng mới chỉ được đề xuất, thử nghiệm rồi gỡ hoặc đã hoàn tác.
- Mô tả thay đổi, lợi ích hoặc ảnh hưởng; kèm cách bật, mặc định, giới hạn và hướng
  di chuyển khi chúng cần thiết để sử dụng an toàn. Đánh dấu breaking change rõ ràng.
- Không đưa refactor nội bộ, thay đổi định dạng, kiểm thử đơn thuần hoặc mọi lần sửa
  vào changelog nếu chúng không ảnh hưởng người dùng, vận hành hay tương thích.
- Dùng `Fixed` cho lỗi đã sửa, `Changed` cho hành vi đổi có chủ đích. Với bản vá bảo
  mật, chỉ ghi thông tin đã được phép công bố, không lộ chi tiết nhạy cảm.
- Gộp commit cùng một kết quả thành một mục. So sánh với `[Unreleased]` hiện có và
  các phiên bản đã phát hành để tránh thêm trùng hoặc ghi lại điều đã phát hành.
  Đọc diff của chính lần cập nhật trước để chạy lại không làm tăng số mục.

## 3. Cập nhật có giới hạn

- Tạo đúng một mục `## [Unreleased]` khi chưa có; chỉ thêm nhóm có nội dung.
  Nếu đã có nhiều mục cùng tên, báo mơ hồ và xử lý trước khi ghi tiếp.
- Giữ nguyên lịch sử đã phát hành, thứ tự phiên bản, liên kết tham chiếu, BOM và kiểu
  xuống dòng hiện có. Chỉ sửa lịch sử đã phát hành khi người dùng yêu cầu đính chính.
- Không đổi số phiên bản, gắn ngày phát hành, tạo tag hoặc tự commit/push.
- Cập nhật tài liệu sử dụng trực tiếp liên quan nếu hành vi đã đổi mà tài liệu còn sai;
  không biến changelog thành hướng dẫn dài hoặc tự tạo tệp chỉ dẫn thường trực.
- Nếu không có thay đổi đáng chú ý chưa được ghi, báo rõ và không thêm mục giả.

Ví dụ:

```markdown
## [Unreleased]

### Added

- Thêm `Alt+Z` để bật/tắt ngắt dòng trong trình biên tập; lựa chọn được lưu cho lần mở sau.

### Fixed

- Khi không thể lưu, hiển thị lỗi thay vì thông báo lưu thành công.
```

## 4. Kiểm tra và bàn giao

Đọc lại diff: mỗi mục có bằng chứng, đúng phạm vi, không trùng, không đổi lịch sử;
kiểm tra UTF-8 và dấu tiếng Việt. Chạy kiểm tra tài liệu sẵn có và `git diff --check`.
Báo tệp đã sửa, phạm vi Git đã dùng và điểm chưa xác minh. Phân biệt “đã ghi chú”
với “đã phát hành”; changelog không chứng minh test/build đã chạy.

## Gọi thủ công hay tự động?

Skill là quy trình soạn thảo có suy luận, được gọi trực tiếp hoặc từ quy trình
release. Để thay đổi hằng ngày không bị quên, có thể thêm một chỉ dẫn thường trực
vào kho **khi người dùng đồng ý**, theo [hướng dẫn tích hợp](./references/integration.md).
Không tự cài hook. Hook/CI tùy chọn chỉ nên nhắc hoặc kiểm tra chính sách xác định
được; không tự viết nội dung sau mỗi lần gọi công cụ hay khi kết thúc phiên.
