# agent-skills

[![skills.sh](https://skills.sh/b/hinorashi/agent-skills)](https://skills.sh/hinorashi/agent-skills)

Reusable [Agent Skills](https://agentskills.io/specification) by @hinorashi.

| Skill | What it does |
|---|---|
| [peekaboo](skills/peekaboo/SKILL.md) | Adds a peeking mascot to your web app: pick a ready-made character (Kei, Mochi, Bolt), describe a new one, or bring your own image (photo, pet, sketch) and it draws an original SVG in chibi or realistic style, checking the image is eligible first and showing a preview page for your approval before touching your code. The mascot peeks out from page edges without covering the UI, looks around, blinks, hides and leaves a clickable keepsake. One mascot per app: if one is already installed, it asks whether to replace it. |

![Kei, Mochi and Bolt](docs/gallery.png)

## Install

```bash
npx skills add hinorashi/agent-skills --skill peekaboo
```

Replace `hinorashi/agent-skills` with the GitHub `owner/repo` this is pushed to. Skills appear on
[skills.sh](https://skills.sh) automatically once people install them with the `skills` CLI.

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

## Validate

```bash
uvx --from "git+https://github.com/agentskills/agentskills#subdirectory=skills-ref" skills-ref validate skills/peekaboo
```
