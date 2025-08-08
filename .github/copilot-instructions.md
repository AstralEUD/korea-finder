<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# Korea Finder Extension Context
- Purpose: Press Shift+K to auto-select Korea in any country selection UI (select, datalist, ARIA combobox, etc.) across various naming variants.
- Core files: manifest.json (MV3), background.js (command listener), contentScript.js (DOM heuristics), data/koreaVariants.json (variant list).
- Keep additional heuristics modular; prefer pure functions for scoring & selection for easier future testing.
- Avoid heavy libraries; must stay lightweight.
- If adding frameworks, confirm first.
