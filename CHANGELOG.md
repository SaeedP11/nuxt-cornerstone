# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] - 2026-10-13

### Fixed

- **WASM Codecs**: Emit each WASM codec once into output assets, rather than once per build step.
- **Workers**: Optimize worker asset names and deduplicate shared packaging.

## [1.0.1] - 2026-10-10

### Fixed

- **HMR / Runtime**: Preserve module state when `import.meta.hot` has no active data store during hot reloading.

## [1.0.0] - 2026-09-23

### Added

- Initial stable release of `nuxt-cornerstone`: Nuxt 3/4 module wrapping Cornerstone3D 5.x for DICOM viewing.
- Viewport and DICOM stack loader with zero-config rendering pipeline.
- Cine film series playback controls and image navigation.
- OHIF keymap shortcuts integration (zoom, pan, window/level, length, measurements).
- Annotation overlay support from external reports and report viewer dialog.
- ZIP archive support in `useDicomFiles` for batch DICOM loading.
- Internationalization support with Farsi (fa-IR) and English (en-US) locales.
- Built-in playground application as a reference DICOM viewer.
