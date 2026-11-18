# Hướng dẫn kho agent-skills

## Cấu trúc và nguồn chính

- Mỗi skill nằm trong `skills/<tên>/` theo [đặc tả Agent Skills](https://agentskills.io/specification):
  `SKILL.md` (frontmatter `name`, `description`, `license`, `compatibility`, `metadata.author`,
  `metadata.version`), `CHANGELOG.md`, cùng `references/`, `scripts/`, `assets/`, `evals/` khi cần.
  Giữ `SKILL.md` ngắn; chi tiết đưa vào `references/` và dẫn liên kết tương đối.
- Remote `origin` là Gitea (`gitea.com/hinorashi/agent-skills`), nguồn chính. GitHub chỉ được đồng bộ
  mỗi giờ bởi [sync-from-gitea.yml](workflows/sync-from-gitea.yml); không commit trực tiếp trên GitHub.
- Cách cài, chi phí ước tính và lệnh kiểm tra nằm trong [README](../README.md); không lặp lại tại đây.

## Phiên bản và changelog

- Mỗi skill có phiên bản SemVer riêng tại `metadata.version`, cột **Version** trong bảng skill của
  README phải khớp giá trị này.
- Ghi thay đổi người dùng skill nhận thấy vào `[Unreleased]` của `skills/<tên>/CHANGELOG.md` theo
  Keep a Changelog 1.1.0; dùng skill `changelog`. Không ghi refactor nội bộ hay mọi commit.
- Khi tăng phiên bản: đổi `metadata.version`, chuyển `[Unreleased]` sang phiên bản có ngày, cập nhật cột
  Version trong README. Không tự tạo tag, commit hay push nếu chưa được yêu cầu.
- Viết changelog cùng ngôn ngữ với tài liệu của skill: `peekaboo` dùng tiếng Anh; `changelog`,
  `release` dùng tiếng Việt có dấu.
- `peekaboo`: `metadata.version` và `PEEKABOO_VERSION` trong `assets/peekaboo.ts` luôn bằng nhau; thay đổi
  ảnh hưởng ứng dụng đã cài phải có mục **App changes** trong `references/updating.md`. Thay đổi chỉ về
  tài liệu không cần tăng phiên bản.

## Nguyên tắc thiết kế skill

- Hỏi trong **một form** với giá trị mặc định suy ra từ dự án; bỏ qua điều người dùng đã trả lời.
  Ưu tiên công cụ hỏi có cấu trúc, mô tả bằng lời thường (không dùng mã màu hex).
- Câu hỏi phê duyệt là một câu chọn một: **Approve** (mặc định), **Cancel** và ô nhập tự do để yêu cầu
  sửa. Không thêm lựa chọn "Change something" vì chọn option không mở ô nhập. Không phàn nàn thiếu
  chi tiết; nếu yêu cầu sửa chưa rõ, sửa theo cách hợp lý nhất và nói đã sửa gì.
- Cho người dùng xem trước (trang preview phục vụ qua localhost) trước khi đụng vào mã của họ; dọn
  thư mục nháp và tệp tạm sau khi xong.
- Tính năng cài vào ứng dụng phải là module tùy chọn trong thư mục riêng, sau một ranh giới mount duy
  nhất, gỡ được mà không ảnh hưởng mã nghiệp vụ.
- Khi skill cập nhật thứ đã cài trong dự án, phát hiện phiên bản cũ và đề nghị cập nhật trong cùng form
  ở lần dùng kế tiếp; giữ chỉnh sửa cục bộ trừ khi người dùng đồng ý bỏ.
- Thao tác có hệ quả (commit, tag, push, công bố, xóa, thay thế) cần xác nhận rõ ràng; khi người dùng từ
  chối ở bước cuối, hoàn tác tệp mà công cụ đã sửa. Không tự cài hook hoặc chỉ dẫn thường trực; với
  changelog, dùng skill hoặc chỉ dẫn, không dùng hook tự viết sau mỗi lần sửa tệp.
- Script đi kèm phải chạy độc lập, không cần dependency ngoài nếu tránh được, tái sử dụng được giữa các
  kho, giữ màu đầu ra và có kiểm thử. Tag dùng tiền tố `v` (`v1.2.0`); manifest và changelog thì không.
- Hình ảnh và nhân vật phải là sáng tác gốc; ảnh tham chiếu của người dùng không bao giờ được nhúng,
  vẽ lại theo nét hay commit.

## Kiểm tra trước khi hoàn tất

- Chạy `skills-ref validate` cho skill đã sửa và kiểm thử script liên quan (lệnh trong README).
- `evals/evals.json` là tình huống đánh giá, không phải benchmark đã chạy; không báo là đã chạy nếu chưa.
- Kiểm tra liên kết tương đối, UTF-8, dấu tiếng Việt và `git diff --check`.
