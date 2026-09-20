# CLAUDE.md

## Project Overview

This project is a Nuxt plugin/module for displaying and interacting with DICOM medical images.

The project is built around the Cornerstone3D ecosystem and aims to provide a reusable, maintainable, and developer-friendly integration for Nuxt applications.

### Core Technologies

* Nuxt
* Vue 3
* TypeScript
* Cornerstone3D
* PrimeVue
* Tailwind CSS

---

## Workspace Boundaries

### Strict Project Scope

You must only work within the current project.

Do not inspect, analyze, reference, copy code from, or modify neighboring projects, repositories, or directories outside this project.

### Forbidden Actions

* Reading code from sibling projects.
* Copying implementations from other repositories in the workspace.
* Using adjacent projects as references.
* Modifying files outside the current project scope.

If information is needed that does not exist in the current project, ask the user before proceeding.

---

## UI Framework Rules

### Approved UI Libraries

Only the following UI technologies are allowed:

* PrimeVue
* Tailwind CSS

### UI Restrictions

Do not introduce any additional UI frameworks or component libraries.

Examples of disallowed libraries include:

* Vuetify
* Quasar
* Element Plus
* Shadcn Vue
* Naive UI
* Bootstrap Vue
* Ant Design Vue
* Any custom design system that duplicates PrimeVue functionality

---

## Migration Rules

If any UI component, utility, or styling solution other than PrimeVue or Tailwind is encountered:

1. Analyze its purpose and behavior.
2. Replace it with an equivalent PrimeVue component.
3. Recreate required styling using Tailwind CSS.
4. Preserve existing functionality.
5. Preserve accessibility whenever possible.
6. Preserve responsiveness.

### Migration Priority

Preferred replacements:

* Custom Button → PrimeVue Button
* Custom Dialog → PrimeVue Dialog
* Custom Dropdown → PrimeVue Select / Dropdown
* Custom Input → PrimeVue InputText
* Custom Table → PrimeVue DataTable
* Custom Toast → PrimeVue Toast

All styling should be implemented using Tailwind utilities.

---

## Code Quality

### Before Making Changes

Always:

1. Analyze the existing implementation.
2. Explain the intended approach.
3. Ask for confirmation when architectural decisions are required.

### Maintainability

Prioritize:

* Readability
* Simplicity
* Reusability
* Type safety
* Performance

Avoid unnecessary abstractions.

---

## DICOM and Cornerstone3D Guidelines

When working with Cornerstone3D:

* Preserve rendering performance.
* Avoid breaking viewport initialization.
* Avoid unnecessary re-renders.
* Keep image loading workflows stable.
* Respect Cornerstone3D best practices.
* Prefer modular and composable architecture.

---

## Communication Rules

When proposing changes:

* Explain findings clearly.
* Highlight potential risks.
* Ask questions when requirements are ambiguous.
* Do not make major architectural changes without approval.

---

## Success Criteria

Every change should:

* Work correctly in Nuxt.
* Remain compatible with Cornerstone3D.
* Use only PrimeVue and Tailwind for UI.
* Stay within the current project boundaries.
* Improve maintainability without changing intended behavior.

