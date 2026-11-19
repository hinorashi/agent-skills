# agent-skills

[![skills.sh](https://skills.sh/b/hinorashi/agent-skills)](https://skills.sh/hinorashi/agent-skills)

Reusable [Agent Skills](https://agentskills.io/specification) by @hinorashi.

Version is each skill's `metadata.version`; the link opens its changelog.

| Skill | Version | What it does |
|---|---|---|
| [changelog](skills/changelog/SKILL.md) | [1.0.0](skills/changelog/CHANGELOG.md) | Viết và đối chiếu ghi chú `[Unreleased]` từ thay đổi thực tế; gộp mục trùng, giữ lịch sử đã phát hành và không tự commit/tag/push. |
| [release](skills/release/SKILL.md) | [1.0.0](skills/release/CHANGELOG.md) | Phát hành có xác nhận trên GitHub/Gitea; ưu tiên quy trình của kho, kèm script độc lập và kiểm thử từ Ganttz cho kho phù hợp. |
| [peekaboo](skills/peekaboo/SKILL.md) | [1.5.0](skills/peekaboo/CHANGELOG.md) | Adds a peeking mascot to your web app: pick a ready-made character (Kei, Mochi, Bolt), describe a new one, or bring your own image (photo, pet, sketch) and it draws an original SVG in chibi or realistic style, checking the image is eligible first and showing a preview page for your approval before touching your code. The mascot peeks out from page edges without covering the UI, looks around, blinks, hides and leaves a clickable keepsake. One mascot per app: if one is already installed, it asks whether to replace it. |

![Kei, Mochi and Bolt](docs/gallery.png)

## Install

```bash
npx skills add hinorashi/agent-skills --skill peekaboo
```

Replace `hinorashi/agent-skills` with the GitHub `owner/repo` this is pushed to. Skills appear on
[skills.sh](https://skills.sh) automatically once people install them with the `skills` CLI.

### Cài skill changelog và release

```bash
npx skills add hinorashi/agent-skills --skill changelog --skill release
```

Hai skill dùng độc lập được; cài cả hai để quy trình release gọi bước soạn ghi chú
khi cần. Bản trong checkout này chỉ sẵn sàng cài từ GitHub sau khi được đẩy lên remote.
Để cài ngay từ checkout, chạy trong dự án đích:

```bash
npx skills add /home/quannt71/project/agent-skills --skill changelog --skill release
```

Ví dụ yêu cầu: “Cập nhật changelog cho thay đổi hiện tại”, “Chỉ chuẩn bị release
1.2.0, chưa công bố”, hoặc “Phát hành 1.2.0 lên Gitea sau khi kiểm tra”.

**Changelog nên là skill, không phải hook tự viết.** Dùng skill khi cần tổng hợp
hoặc trước release; để agent ghi chú trong công việc hằng ngày, thêm chỉ dẫn thường
trực theo [hướng dẫn tích hợp](skills/changelog/references/integration.md) sau khi
được đồng ý. Chỉ dẫn không bảo đảm thực thi; nếu cần cưỡng chế, dùng CI kiểm tra
chính sách rõ ràng. Không tự động viết changelog sau mỗi lần sửa tệp/kết thúc phiên.
Không có hook hoặc chỉ dẫn thường trực nào được tự cài bởi hai skill này.

Skill release kèm [công cụ độc lập](skills/release/scripts/release.mjs) và
[hợp đồng sử dụng](skills/release/references/cli.md). Công cụ cần Node.js, Git, curl,
terminal tương tác và npm nếu có manifest; hỗ trợ một gói npm ở gốc hoặc kho chỉ
có changelog, không hỗ trợ workspaces. Không có `--dry-run`: xem trước/chuẩn bị chỉ
là quy trình của skill, không phải một lần chạy lệnh công bố. Script không publish
lên registry, tải artifact hoặc deploy.

### Install from a local checkout

From the root of this repository, install the skill into the current project with the `skills` CLI:

```bash
npx skills add /home/quannt71/project/agent-skills/skills/peekaboo --skill peekaboo
```

For a personal installation without the CLI, copy the skill folder into GitHub Copilot's local skills directory:

```bash
mkdir -p ~/.copilot/skills
cp -R /home/quannt71/project/agent-skills/skills/peekaboo ~/.copilot/skills/
```

## Estimated cost

These are rough figures for one run of `peekaboo` with GitHub Copilot. The Bolt figure comes from a real run in
another project. The others are scaled from how long the skill's test runs took, at about 16.5k tokens per credit.

| Task | Tokens | Copilot credits |
|---|---|---|
| Answer the interview only (e.g. a vague request) | ~10k | < 1 |
| Add a ready-made character (e.g. Bolt) | ~156k | ~9.5 |
| Draw a new character and add it to a small app | ~115–160k | ~7–10 |
| Mascot from your image, with one preview round | ~130–180k | ~8–11 |

Actual cost depends on the model and its credit multiplier, how large the app is, and how many follow-up tweaks you ask for.

Optional concept art (OpenAI or Amazon Bedrock image models) is billed separately by that provider, per image, with
your own key. It is off unless you choose it.

## API keys for concept art

An AI agent only sees the environment variables of the program that started it: VS Code, the Copilot CLI or your
terminal. A variable you `export` in one terminal tab is invisible to an agent that was started elsewhere. Set the key
once, in a place that program reads, then restart it.

| Provider | Variables |
|---|---|
| OpenAI | `OPENAI_API_KEY` |
| Amazon Bedrock (API key) | `AWS_BEARER_TOKEN_BEDROCK`, `AWS_REGION` (e.g. `us-east-1`) |
| Amazon Bedrock (AWS credentials) | `AWS_PROFILE` or `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`; needs `pip install boto3` |

**Linux and macOS.** Keep the keys in a private file outside every repository:

```bash
mkdir -p ~/.config/agent-keys
cat > ~/.config/agent-keys/env <<'EOF'
export OPENAI_API_KEY='sk-...'
export AWS_BEARER_TOKEN_BEDROCK='...'
export AWS_REGION='us-east-1'
EOF
chmod 600 ~/.config/agent-keys/env
```

Load it from your shell profile. Use `~/.profile` (Linux) or `~/.zprofile` (macOS) so apps started from the desktop or
Dock also get it, plus `~/.bashrc` or `~/.zshrc` for terminals:

```bash
echo '[ -f ~/.config/agent-keys/env ] && . ~/.config/agent-keys/env' >> ~/.profile
echo '[ -f ~/.config/agent-keys/env ] && . ~/.config/agent-keys/env' >> ~/.bashrc
```

**Windows (PowerShell).** Set user variables, which every new program gets:

```powershell
[Environment]::SetEnvironmentVariable('OPENAI_API_KEY', 'sk-...', 'User')
[Environment]::SetEnvironmentVariable('AWS_BEARER_TOKEN_BEDROCK', '...', 'User')
[Environment]::SetEnvironmentVariable('AWS_REGION', 'us-east-1', 'User')
```

**Restart the agent.** Quit VS Code completely (every window, not just *Reload Window*) and open it again. On Linux, if
it still sees nothing, log out and back in, or start it from a terminal with `code .`. For the Copilot CLI or other
terminal agents, open a new terminal. Then check what the agent sees; it prints only FOUND or MISSING, never the
values:

```bash
python3 skills/peekaboo/scripts/generate_concept.py --check
```

Keep keys out of `.env` files in your projects, VS Code `settings.json` and anything you commit. Prefer a short-term
or restricted key, and revoke a key you have pasted into a chat.

## Validate

Kiểm thử công cụ release không cần cài dependency npm; test HTTPS cần openssl:

```bash
node --test skills/release/scripts/release.test.mjs
```

Các tình huống đánh giá hành vi agent nằm trong
[changelog/evals](skills/changelog/evals/evals.json) và
[release/evals](skills/release/evals/evals.json); đây không phải benchmark đã chạy.
Để kiểm tra cấu trúc hai skill bằng công cụ Agent Skills:

```bash
uvx --from "git+https://github.com/agentskills/agentskills#subdirectory=skills-ref" skills-ref validate skills/changelog
uvx --from "git+https://github.com/agentskills/agentskills#subdirectory=skills-ref" skills-ref validate skills/release
```

```bash
uvx --from "git+https://github.com/agentskills/agentskills#subdirectory=skills-ref" skills-ref validate skills/peekaboo
```

## Releasing a new peekaboo version

Installed apps keep their own copy of the mascot engine. When a change affects them, bump `metadata.version` in
[SKILL.md](skills/peekaboo/SKILL.md) and `PEEKABOO_VERSION` in
[peekaboo.ts](skills/peekaboo/assets/peekaboo.ts) to the same value, and add a changelog entry with the required app
changes to [updating.md](skills/peekaboo/references/updating.md). Move the `[Unreleased]` notes in
[CHANGELOG.md](skills/peekaboo/CHANGELOG.md) under the new version and update the version in the skill table above. The
next time someone uses the skill in an app with an older mascot, it offers to update it.

## Đồng bộ từ Gitea sang GitHub

Kho gốc nằm trên [Gitea](https://gitea.com/hinorashi/agent-skills); bản trên
[GitHub](https://github.com/hinorashi/agent-skills) được cập nhật bởi workflow
[sync-from-gitea.yml](.github/workflows/sync-from-gitea.yml), chạy mỗi giờ (phút 17)
hoặc chạy tay. Workflow dùng runner `ubuntu-slim` (container 1 vCPU, có sẵn git,
giới hạn 15 phút) và chỉ chạy trên GitHub, tự bỏ qua nếu Gitea Actions đọc được tệp.

Mỗi lần chạy, nhánh `main` trên GitHub được xử lý như sau:

| Trạng thái | Hành động |
|---|---|
| Trùng với Gitea | Không làm gì |
| Chậm hơn Gitea | Fast-forward rồi push |
| Đi trước Gitea | Không làm gì |
| Đã rẽ nhánh | Rebase commit riêng của GitHub lên Gitea rồi push `--force-with-lease`; nếu xung đột thì hủy rebase và báo lỗi để xử lý tay |

Tag cũng được đồng bộ.

### Cài đặt

1. Trên GitHub, mở **Settings → Secrets and variables → Actions** của kho và thêm
   repository secret:

   | Secret | Bắt buộc | Nội dung |
   |---|---|---|
   | `GITEA_TOKEN` | Khi kho Gitea riêng tư | Gitea personal access token có quyền đọc kho (`read:repository`) |
   | `GITEA_USER` | Không | Tên người dùng Gitea, mặc định `hinorashi` |
   | `GH_SYNC_TOKEN` | Nên có | GitHub fine-grained token cho kho này với quyền **Contents** và **Workflows** ở mức *Read and write* |

   `GITHUB_TOKEN` mặc định không được push commit có sửa tệp trong
   `.github/workflows/`. Vì workflow này đến từ Gitea, thiếu `GH_SYNC_TOKEN` thì lần
   đồng bộ đầu tiên và mọi lần sửa workflow sau đó sẽ bị từ chối.

2. Commit workflow, push lên Gitea, rồi push một lần lên GitHub để workflow có mặt ở đó:

   ```bash
   git push origin main
   git push https://github.com/hinorashi/agent-skills.git main
   ```

3. Trên GitHub, vào **Actions → Sync from Gitea → Run workflow** để chạy thử.

Đổi kho nguồn, nhánh hoặc lịch chạy bằng `UPSTREAM_URL`, `BRANCH` và `cron` ở đầu
workflow.
