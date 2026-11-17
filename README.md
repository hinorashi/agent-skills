# agent-skills

Reusable [Agent Skills](https://agentskills.io/specification) by @hinorashi.

| Skill | What it does |
|---|---|
| [peekaboo](skills/peekaboo/SKILL.md) | Adds a peeking mascot to your web app: pick a ready-made character (Kei, Mochi, Bolt) or describe a new one and it draws an original SVG. The mascot peeks out from page edges without covering the UI, looks around, blinks, hides and leaves a clickable keepsake. |

![Kei, Mochi and Bolt](docs/gallery.png)

## Install

```bash
npx skills add hinorashi/agent-skills --skill peekaboo
```

Replace `hinorashi/agent-skills` with the GitHub `owner/repo` this is pushed to. Skills appear on
[skills.sh](https://skills.sh) automatically once people install them with the `skills` CLI.

## Estimated cost

These are rough figures for one run of `peekaboo` with GitHub Copilot. The Bolt figure comes from a real run in
another project. The others are scaled from how long the skill's test runs took, at about 16.5k tokens per credit.

| Task | Tokens | Copilot credits |
|---|---|---|
| Answer the interview only (e.g. a vague request) | ~10k | < 1 |
| Add a ready-made character (e.g. Bolt) | ~156k | ~9.5 |
| Draw a new character and add it to a small app | ~115–160k | ~7–10 |

Actual cost depends on the model and its credit multiplier, how large the app is, and how many follow-up tweaks you ask for.

## Validate

```bash
uvx --from "git+https://github.com/agentskills/agentskills#subdirectory=skills-ref" skills-ref validate skills/peekaboo
```
