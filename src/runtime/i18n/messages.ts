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
}

export const BUILTIN_MESSAGES: Record<string, MessageCatalog> = { en, fa }

/** Keys the module itself emits. Extra keys may be added through options. */
export type CornerstoneMessageKey = keyof typeof en

/** A built-in key, or any key an app has registered of its own. */
export type MessageKey = CornerstoneMessageKey | (string & {})
