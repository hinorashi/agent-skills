# Tích hợp changelog vào công việc hằng ngày

## Phân chia trách nhiệm

| Thành phần | Trách nhiệm | Thời điểm |
|---|---|---|
| Skill `changelog` | Đọc bằng chứng và soạn/đối chiếu ghi chú | Khi được yêu cầu, khi chỉ dẫn kho yêu cầu hoặc trước release |
| Chỉ dẫn kho | Nhắc cập nhật ghi chú cho hành vi người dùng nhận thấy | Trong quá trình sửa chức năng |
| Skill `release` | Chốt phiên bản, kiểm tra, xin duyệt và công bố | Chỉ khi người dùng yêu cầu phát hành |
| Hook/CI tùy chọn | Kiểm tra cấu trúc hoặc nhắc thiếu ghi chú | Theo chính sách đã thống nhất |

Skill không phải lịch chạy tự động. Chỉ dẫn là hướng dẫn cho agent, không phải
bảo đảm thực thi; nếu cần cưỡng chế, dùng kiểm tra xác định được trong CI.

Không dùng `PostToolUse` hoặc `Stop` để tự viết changelog: một tính năng có thể
trải qua nhiều lần sửa, hoàn tác hoặc nhiều phiên cùng lúc. Ghi theo từng lần sửa
tệp dễ tạo nội dung trùng, ghi nhận hành vi chưa hoàn thành và làm bẩn cây Git.
Hook cũng không tự biết thay đổi nào thực sự đáng chú ý.

## Mẫu chỉ dẫn thường trực, chỉ thêm khi được đồng ý

Đặt đoạn sau vào tệp chỉ dẫn đang dùng của kho, ví dụ `AGENTS.md` hoặc
`.github/copilot-instructions.md`. Hợp nhất với quy định có sẵn; không tạo đồng thời
nhiều bản giống nhau. Điều chỉnh đường dẫn nếu kho dùng changelog khác.

```markdown
## Changelog

- Ghi thay đổi đã hoàn tất mà người dùng nhận thấy vào `[Unreleased]` của
  `CHANGELOG.md` theo Keep a Changelog; dùng skill `changelog` nếu có.
- Đối chiếu mã nguồn và ghi chú hiện có, gộp mục trùng, không liệt kê mọi commit
  hoặc thay đổi thuần nội bộ. Cập nhật README nếu cách sử dụng thay đổi.
- Giữ nguyên lịch sử đã phát hành. Không tự đổi phiên bản, tạo tag, commit, push
  hay công bố release chỉ vì đang cập nhật changelog.
- Khi được yêu cầu phát hành, hoàn thiện ghi chú trước rồi dùng quy trình release
  của kho; xác nhận đích, phiên bản và thao tác công bố trước khi thực hiện.
```

## Nếu sau này cần kiểm tra tự động

Ưu tiên CI hoặc công cụ sẵn có của kho. Kiểm tra cấu trúc, mục trùng và fragment
bắt buộc theo nhãn/đường dẫn đã quy định; có cách miễn trừ rõ ràng cho thay đổi
không ảnh hưởng người dùng. Không coi việc “có sửa changelog” là bằng chứng nội dung
đúng hoặc đầy đủ. Chỉ thêm hook sau khi thống nhất nền tảng, sự kiện và tiêu chí chặn.
