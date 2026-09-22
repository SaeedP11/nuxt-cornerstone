/**
 * Message catalogues for the strings this module produces itself.
 *
 * Both locales are bundled statically rather than imported on demand. They are
 * a few hundred bytes each, and `t()` is called from error paths that are
 * synchronous by nature — `asZipError()` has to return an `Error`, not a
 * promise of one.
 *
 * Keys are flat and dotted. Anything in `{braces}` is interpolated; a numeric
 * parameter is run through the locale's number formatter on the way in, which
 * is what puts Persian-Indic digits into Farsi messages.
 */

/** CLDR plural categories, as `Intl.PluralRules` selects them. */
export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other'

/**
 * A message is either a plain string, or a set of plural forms chosen by the
 * `count` parameter. Missing categories fall back to `other`, so Farsi — where
 * a counted noun does not inflect — only needs to supply `other`.
 */
export type MessageValue = string | Partial<Record<PluralCategory, string>>

export type MessageCatalog = Record<string, MessageValue>

export type MessageParams = Record<string, string | number>

/**
 * Identifiers stay in English inside every translation: `cornerstone.autoInit`,
 * `ensureCornerstone()` and `@cornerstonejs/tools` are things the reader has to
 * type or search for, not prose.
 */
export const en = {
  'error.ssr':
    'Cornerstone3D is browser-only (WebGL, web workers, WASM) and cannot run during SSR. '
    + 'Call ensureCornerstone() from onMounted, or wrap the caller in <ClientOnly>.',
  'error.optionsLocked':
    'Cornerstone3D is already initialising; options can no longer be changed. '
    + 'Set `cornerstone.autoInit: false` in nuxt.config and call `ensureCornerstone(options)` from your own plugin.',
  'error.initFailed': 'initialisation failed',
  'error.toolGroupCreate': 'could not create tool group "{groupId}".',
  'error.toolNotInGroup':
    'tool "{tool}" is not in tool group "{groupId}". '
    + 'Add its class name to `cornerstone.tools.register` in nuxt.config.',
  'warn.unknownTool':
    '"{tool}" is not an exported tool class of @cornerstonejs/tools; skipping.',
  'error.annotationViewport':
    'there is no viewport to place annotations on. '
    + 'Wait for the viewport\'s `ready` event before calling addBoxes().',
  'error.annotationToolGroup':
    'that viewport is not in a tool group, so annotations would never be drawn. '
    + 'Mount it through <CornerstoneViewport>, or add it with useCornerstoneTools().addViewport().',
  'error.annotationTool':
    'RectangleROITool is not available from @cornerstonejs/tools, and imported boxes are drawn with it.',
  'annotationJson.notJson': 'That file is not valid JSON: {message}',
  'annotationJson.unknownShape':
    'That JSON is not a recognised annotation file. '
    + 'Expected a list of boxes, each with a `sopInstanceUid` and a `box`, '
    + 'or a report with a `findings` array whose entries carry `slice_findings`.',
  'annotationJson.finding': 'Finding {index}',
  'annotationJson.class': 'Class {value}',
  'annotationJson.labelled': '{name} · {confidence}%',
  'zip.tooLarge':
    'Archive expands to more than {limit} of DICOM data. '
    + 'Extract it and open the series you need, or raise `maxBytes`.',
  'zip.notReadable': 'That file is not a readable ZIP archive.',
  'zip.readFailed': 'Could not read the ZIP archive: {message}',
  'series.numbered': 'Series {number}',
  'series.unnamed': 'Unnamed series',
  'series.images': { one: '{count} image', other: '{count} images' },
  'series.label': '{name} ({details})',
  'list.separator': ', ',
  // Byte units come from the catalogue rather than from `Intl`'s unit style:
  // CLDR's short English name for `byte` is "byte", so a 900-byte archive
  // would read "900 byte".
  'bytes.value': '{value} {unit}',
  'bytes.unit.B': 'B',
  'bytes.unit.KB': 'KB',
  'bytes.unit.MB': 'MB',
  'bytes.unit.GB': 'GB',
  'bytes.unit.TB': 'TB',

  // ---------------------------------------------------------------------
  // useDicomStudy: what was opened, how the opening is going, and what was
  // turned away. Reasons read as a noun phrase so they drop straight into
  // "{name} ({reason})".
  'study.progress.reading': 'Reading archive…',
  'study.progress.extracting': 'Extracting…',
  'study.progress.indexing': 'Reading headers {done} / {total}',
  'study.error.noDicomInZip': 'No DICOM images found in {file}.',
  'study.error.noDicomFiles': {
    one: 'That file is not DICOM.',
    other: 'None of those {count} files is DICOM.',
  },
  'study.error.noUrls': 'None of those addresses could be read.',
  'study.skipped.summary': '{count}: {named}',
  'study.skipped.more': '{count}: {named}, and {rest} more',
  'study.skipped.entry': '{name} ({reason})',
  'study.skip.metadata': 'housekeeping file',
  'study.skip.notDicomExtension': 'not a DICOM extension',
  'study.skip.notDicom': 'no DICOM header',
  'study.skip.empty': 'empty',
  'study.source.files': {
    one: '{count} local file, sorted by InstanceNumber',
    other: '{count} local files, sorted by InstanceNumber',
  },
  'study.source.urls': { one: '{count} image', other: '{count} images' },
  'study.source.zip': '{file} — {images} in {series}',
  // "Series" is its own plural; a hand-rolled one says "serieses".
  'study.count.series': { one: '{count} series', other: '{count} series' },
  'study.count.skipped': { one: '{count} file skipped', other: '{count} files skipped' },

  // useStackCine: how far decoding the stack ahead of playback has got.
  'cine.preparing': 'Preparing… {percent}%',
  'cine.prepared': { one: '{count} image ready', other: '{count} images ready' },
  'cine.preparedWithFailures': {
    one: '{count} image ready, {failed} could not be decoded',
    other: '{count} images ready, {failed} could not be decoded',
  },
  'cine.cacheFull': 'Image cache full at {count} images — the rest load as you reach them.',

  // useAnnotationReport: what a JSON report placed on the stack on screen.
  'report.summary': '{file}: {placed} of {total} boxes placed.',
  'report.waiting': {
    one: '{count} more appears as you scroll to its slice.',
    other: '{count} more appear as you scroll to their slices.',
  },
  'report.dropped': {
    one: '{count} entry could not be read.',
    other: '{count} entries could not be read.',
  },
  'report.empty': '{file} lists no annotations.',
  'report.unmatched':
    'None of the {total} boxes belong to the images on screen — the report names series {series}. '
    + 'Open that study to see them.',
  'report.unmatchedNoSeries':
    'None of the {total} boxes belong to the images on screen. They name slices that are not loaded.',
  'report.failed': 'Could not read {file}: {message}',
} satisfies MessageCatalog

export const fa: Record<CornerstoneMessageKey, MessageValue> = {
  'error.ssr':
    'Cornerstone3D فقط در مرورگر اجرا می‌شود (WebGL، وب‌ورکر، WASM) و در زمان SSR قابل استفاده نیست. '
    + 'ensureCornerstone() را از onMounted فراخوانی کنید، یا فراخوان را داخل <ClientOnly> بگذارید.',
  'error.optionsLocked':
    'Cornerstone3D هم‌اکنون در حال راه‌اندازی است؛ گزینه‌ها دیگر قابل تغییر نیستند. '
    + 'در nuxt.config مقدار `cornerstone.autoInit: false` را بگذارید و ensureCornerstone(options) را از افزونهٔ خودتان فراخوانی کنید.',
  'error.initFailed': 'راه‌اندازی ناموفق بود',
  'error.toolGroupCreate': 'ساخت گروه ابزار «{groupId}» ممکن نشد.',
  'error.toolNotInGroup':
    'ابزار «{tool}» در گروه ابزار «{groupId}» نیست. '
    + 'نام کلاس آن را به `cornerstone.tools.register` در nuxt.config اضافه کنید.',
  'warn.unknownTool':
    '«{tool}» از کلاس‌های ابزار صادرشدهٔ @cornerstonejs/tools نیست؛ نادیده گرفته شد.',
  'error.annotationViewport':
    'نمایی برای قرار دادن حاشیه‌نویسی‌ها وجود ندارد. '
    + 'پیش از فراخوانی addBoxes() منتظر رویداد `ready` نما بمانید.',
  'error.annotationToolGroup':
    'این نما در هیچ گروه ابزاری نیست، بنابراین حاشیه‌نویسی‌ها هرگز رسم نمی‌شوند. '
    + 'آن را با <CornerstoneViewport> سوار کنید، یا با useCornerstoneTools().addViewport() اضافه کنید.',
  'error.annotationTool':
    'ابزار RectangleROITool از @cornerstonejs/tools در دسترس نیست، و کادرهای واردشده با همین ابزار رسم می‌شوند.',
  'annotationJson.notJson': 'این فایل JSON معتبر نیست: {message}',
  'annotationJson.unknownShape':
    'ساختار این JSON به‌عنوان فایل حاشیه‌نویسی شناخته نشد. '
    + 'یک فهرست از کادرها که هرکدام `sopInstanceUid` و `box` دارند انتظار می‌رفت، '
    + 'یا گزارشی با آرایهٔ `findings` که ورودی‌هایش `slice_findings` دارند.',
  'annotationJson.finding': 'یافتهٔ {index}',
  'annotationJson.class': 'کلاس {value}',
  'annotationJson.labelled': '{name} · ٪{confidence}',
  'zip.tooLarge':
    'حجم بازشدهٔ این بایگانی بیش از {limit} دادهٔ دایکام است. '
    + 'آن را استخراج کنید و تنها سری موردنیاز را باز کنید، یا مقدار `maxBytes` را افزایش دهید.',
  'zip.notReadable': 'این فایل یک بایگانی ZIP خوانا نیست.',
  'zip.readFailed': 'خواندن بایگانی ZIP ممکن نشد: {message}',
  'series.numbered': 'سری {number}',
  'series.unnamed': 'سری بدون نام',
  // Persian does not inflect a counted noun, so one form covers every count.
  'series.images': { other: '{count} تصویر' },
  'series.label': '{name} ({details})',
  'list.separator': '، ',
  'bytes.value': '{value} {unit}',
  'bytes.unit.B': 'بایت',
  'bytes.unit.KB': 'کیلوبایت',
  'bytes.unit.MB': 'مگابایت',
  'bytes.unit.GB': 'گیگابایت',
  'bytes.unit.TB': 'ترابایت',

  'study.progress.reading': 'در حال خواندن بایگانی…',
  'study.progress.extracting': 'در حال استخراج…',
  'study.progress.indexing': 'خواندن سرآیندها {done} / {total}',
  'study.error.noDicomInZip': 'هیچ تصویر دایکامی در {file} پیدا نشد.',
  'study.error.noDicomFiles': { other: 'هیچ‌کدام از آن {count} فایل دایکام نیست.' },
  'study.error.noUrls': 'هیچ‌یک از آن نشانی‌ها خوانده نشد.',
  'study.skipped.summary': '{count}: {named}',
  'study.skipped.more': '{count}: {named} و {rest} مورد دیگر',
  'study.skipped.entry': '{name} ({reason})',
  'study.skip.metadata': 'فایل جانبی',
  'study.skip.notDicomExtension': 'پسوند دایکام نیست',
  'study.skip.notDicom': 'سرآیند دایکام ندارد',
  'study.skip.empty': 'خالی',
  'study.source.files': { other: '{count} فایل محلی، مرتب‌شده بر اساس InstanceNumber' },
  'study.source.urls': { other: '{count} تصویر' },
  'study.source.zip': '{file} — {images} در {series}',
  'study.count.series': { other: '{count} سری' },
  'study.count.skipped': { other: '{count} فایل نادیده گرفته شد' },

  'cine.preparing': 'در حال آماده‌سازی… ٪{percent}',
  'cine.prepared': { other: '{count} تصویر آماده است' },
  'cine.preparedWithFailures': {
    other: '{count} تصویر آماده است، {failed} تصویر رمزگشایی نشد',
  },
  'cine.cacheFull': 'حافظهٔ نهان تصاویر در {count} تصویر پر شد — بقیه هنگام رسیدن به آن‌ها بارگذاری می‌شوند.',

  'report.summary': '{file}: {placed} کادر از {total} کادر قرار گرفت.',
  'report.waiting': { other: '{count} کادر دیگر با پیمایش به برش‌هایشان نمایان می‌شوند.' },
  'report.dropped': { other: '{count} ورودی خوانده نشد.' },
  'report.empty': 'فایل {file} هیچ حاشیه‌نویسی‌ای ندارد.',
  'report.unmatched':
    'هیچ‌یک از {total} کادر به تصاویر روی صفحه تعلق ندارد — این گزارش سری {series} را نام می‌برد. '
    + 'برای دیدن آن‌ها همان مطالعه را باز کنید.',
  'report.unmatchedNoSeries':
    'هیچ‌یک از {total} کادر به تصاویر روی صفحه تعلق ندارد؛ برش‌هایی را نام می‌برند که بارگذاری نشده‌اند.',
  'report.failed': 'خواندن {file} ممکن نشد: {message}',
}

export const BUILTIN_MESSAGES: Record<string, MessageCatalog> = { en, fa }

/** Keys the module itself emits. Extra keys may be added through options. */
export type CornerstoneMessageKey = keyof typeof en

/** A built-in key, or any key an app has registered of its own. */
export type MessageKey = CornerstoneMessageKey | (string & {})
