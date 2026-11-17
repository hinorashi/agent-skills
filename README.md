# agent-skills

Reusable [Agent Skills](https://agentskills.io/specification) by @hinorashi.

| Skill | What it does |
|---|---|
| [peekaboo](skills/peekaboo/SKILL.md) | Interviews you for a mascot (name, look, personality, keepsake), draws an original SVG character and wires it into your web app: it peeks out from page edges without covering the UI, looks around, blinks, hides and leaves a clickable keepsake. |

## Install

```bash
npx skills add hinorashi/agent-skills --skill peekaboo
```

Replace `hinorashi/agent-skills` with the GitHub `owner/repo` this is pushed to. Skills appear on
[skills.sh](https://skills.sh) automatically once people install them with the `skills` CLI.

## Validate

```bash
uvx --from "git+https://github.com/agentskills/agentskills#subdirectory=skills-ref" skills-ref validate skills/peekaboo
```
