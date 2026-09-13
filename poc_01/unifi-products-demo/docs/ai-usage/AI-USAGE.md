# AI Usage Disclosure

## Summary

Throughout this assignment, I utilized AI assistants (Gemini, Claude, and ChatGPT) primarily as pair-programming partners and architectural sounding boards.

My workflow relies on a strict human-in-the-loop approach: I design and write the foundational logic first, using AI to evaluate edge cases, suggest refinements, and review code quality.

---

## Engineering & Development Workflow

### 1. Specification & Architecture
1. **Independent Analysis:** Read and analyze the requirements independently.
2. **Initial Solution:** Formulate an initial architectural design and strategy.
3. **AI Consultation:** Query AI models to identify alternative approaches or potential edge cases.
4. **Verification & Reconciliation:** Compare outputs, verify factual accuracy, and adopt only valid suggestions.

### 2. Code Implementation
1. **Directory Structure:** Design and set up the repository hierarchy and baseline file structures independently.
2. **Core Implementation:** Write the primary code, logic, and data flow.
3. **AI Review:** Prompt AI tools to review for code optimization, readability, or refactoring opportunities.
4. **Line-by-Line Review:** Evaluate every suggested modification line by line.
5. **Testing & Verification:** Double-check and test any logic where ambiguity or doubt exists.

### 3. Scripting & Repetitive Tasks
1. **Command Automation:** Documented and tested each terminal/CLI command manually during development, then used AI to package those verified commands into automated, executable Bash scripts (`_00_verify_environment.sh` through `_05_auto_register_devices.sh`).
2. **Boilerplate & Mocking:** Utilized AI to quickly generate repetitive boilerplate code, mock data payloads for testing, and structural scaffolding.
3. **Efficiency:** Delegating manual, repetitive tasks saved time and ensured execution consistency, allowing me to focus my cognitive energy on core architecture, state machine logic, and system resilience.

---

## Concrete Example of Critical Oversight

A clear example of this verification process occurred during the architectural design phase:

When generating the initial diagram structure for `architecture.svg`, the AI model incorrectly placed the Data Source / Data Access layer as an external standalone component outside of `monitoring-service`. Recognizing that this violated service boundaries, I identified the architectural error and manually corrected the model to encapsulate the Data Access layer properly within the `monitoring-service` boundary.

---

## Documentation

AI tools were also used to refine, structure, and polish project documentation, ensuring clear presentation for reviewers and teammates.
