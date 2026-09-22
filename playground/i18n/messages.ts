/**
 * The demo's own strings.
 *
 * They are registered through `cornerstone.i18n.messages` in `nuxt.config.ts`
 * rather than through a second i18n library, which is the point of the demo:
 * the module's catalogue takes arbitrary keys, so an app can keep one locale
 * source of truth without adding a dependency.
 *
 * Keys are namespaced `app.*` so they cannot collide with the module's own.
 */
import type { MessageCatalog } from '../../src/runtime/i18n/messages'

export const en: MessageCatalog = {
  'app.language': 'Language',
  'app.ready': 'cornerstone ready',
  'app.initialising': 'initialising…',
  'app.loadSamples': 'Load bundled samples',
  'app.open': 'Open DICOM or ZIP…',
  'app.clear': 'Clear',
  'app.resetCamera': 'Reset camera',
  'app.empty':
    'Drop DICOM files or a ZIP archive here, open them from the toolbar, or load the bundled samples.',

  'app.series.heading': 'Series',
  'app.sidebar.collapse': 'Hide the series list',
  'app.sidebar.expand': 'Show the series list',

  // A JSON report drawn on top of the images that are already open.
  'app.annotations.open': 'Open annotations…',
  'app.annotations.show': 'Show annotations',
  'app.annotations.hide': 'Hide annotations',
  'app.annotations.summary': '{file}: {placed} of {total} boxes placed.',
  'app.annotations.waiting': {
    one: '{count} more appears as you scroll to its slice.',
    other: '{count} more appear as you scroll to their slices.',
  },
  'app.annotations.dropped': {
    one: '{count} entry could not be read.',
    other: '{count} entries could not be read.',
  },
  'app.annotations.empty': '{file} lists no annotations.',
  'app.annotations.unmatched':
    'None of the {total} boxes belong to the images on screen — the report names series {series}. Open that study to see them.',
  'app.annotations.unmatchedNoSeries':
    'None of the {total} boxes belong to the images on screen. They name slices that are not loaded.',
  'app.annotations.failed': 'Could not read {file}: {message}',
  'app.annotations.needImages':
    'Open the DICOM images first — an annotation file is matched to the slices that are loaded.',
  'app.tools.heading': 'Tools',
  'app.tool.windowLevel': 'Window/Level',
  'app.tool.pan': 'Pan',
  'app.tool.zoom': 'Zoom',
  'app.tool.length': 'Length',
  'app.tool.rectangle': 'Rectangle',
  'app.tool.ellipse': 'Ellipse',
  'app.tool.probe': 'Probe',

  'app.shortcuts.title': 'Keyboard shortcuts',
  'app.shortcuts.slice': 'Previous / next image',
  'app.shortcuts.series': 'Previous / next series',
  'app.shortcuts.ends': 'First / last image',
  'app.shortcuts.tools': 'Pick a tool — each button on the rail shows its key',
  'app.shortcuts.reset': 'Reset the viewport',
  'app.shortcuts.help': 'Open this list',

  'app.progress.reading': 'Reading archive…',
  'app.progress.extracting': 'Extracting…',
  'app.progress.indexing': 'Reading headers {done} / {total}',

  'app.error.noSamples':
    'No samples found. Run `pnpm samples` to download them into playground/public/samples/.',
  'app.error.noDicomInZip': 'No DICOM images found in {file}.',
  'app.error.noDicomFiles': {
    one: 'That file is not DICOM.',
    other: 'None of those {count} files is DICOM.',
  },

  // What the guard turned away, and why. Reasons read as a noun phrase so
  // they drop straight into "{name} ({reason})".
  'app.skipped.summary': '{count}: {named}',
  'app.skipped.more': '{count}: {named}, and {rest} more',
  'app.skipped.entry': '{name} ({reason})',
  'app.skip.metadata': 'housekeeping file',
  'app.skip.notDicomExtension': 'not a DICOM extension',
  'app.skip.notDicom': 'no DICOM header',
  'app.skip.empty': 'empty',

  'app.source.samples': {
    one: '{count} bundled sample (one CT slice per transfer syntax)',
    other: '{count} bundled samples (one CT slice per transfer syntax)',
  },
  'app.source.files': {
    one: '{count} local file, sorted by InstanceNumber',
    other: '{count} local files, sorted by InstanceNumber',
  },
  'app.source.zip': '{file} — {images} in {series}',
  'app.count.images': { one: '{count} image', other: '{count} images' },
  // "Series" is its own plural; the old hand-rolled version said "serieses".
  'app.count.series': { one: '{count} series', other: '{count} series' },
  'app.count.skipped': { one: '{count} file skipped', other: '{count} files skipped' },
}

export const fa: MessageCatalog = {
  'app.language': 'زبان',
  'app.ready': 'Cornerstone آماده است',
  'app.initialising': 'در حال راه‌اندازی…',
  'app.loadSamples': 'بارگذاری نمونه‌های همراه',
  'app.open': 'باز کردن دایکام یا ZIP…',
  'app.clear': 'پاک‌سازی',
  'app.resetCamera': 'بازنشانی دوربین',
  'app.empty':
    'فایل‌های دایکام یا یک بایگانی ZIP را اینجا رها کنید، از نوار ابزار بازشان کنید، یا نمونه‌های همراه را بارگذاری کنید.',

  'app.series.heading': 'سری‌ها',
  'app.sidebar.collapse': 'پنهان کردن فهرست سری‌ها',
  'app.sidebar.expand': 'نمایش فهرست سری‌ها',

  'app.annotations.open': 'باز کردن حاشیه‌نویسی‌ها…',
  'app.annotations.show': 'نمایش حاشیه‌نویسی‌ها',
  'app.annotations.hide': 'پنهان کردن حاشیه‌نویسی‌ها',
  'app.annotations.summary': '{file}: {placed} کادر از {total} کادر قرار گرفت.',
  'app.annotations.waiting': { other: '{count} کادر دیگر با پیمایش به برش‌هایشان نمایان می‌شوند.' },
  'app.annotations.dropped': { other: '{count} ورودی خوانده نشد.' },
  'app.annotations.empty': 'فایل {file} هیچ حاشیه‌نویسی‌ای ندارد.',
  'app.annotations.unmatched':
    'هیچ‌یک از {total} کادر به تصاویر روی صفحه تعلق ندارد — این گزارش سری {series} را نام می‌برد. برای دیدن آن‌ها همان مطالعه را باز کنید.',
  'app.annotations.unmatchedNoSeries':
    'هیچ‌یک از {total} کادر به تصاویر روی صفحه تعلق ندارد؛ برش‌هایی را نام می‌برند که بارگذاری نشده‌اند.',
  'app.annotations.failed': 'خواندن {file} ممکن نشد: {message}',
  'app.annotations.needImages':
    'نخست تصاویر دایکام را باز کنید — فایل حاشیه‌نویسی با برش‌های بارگذاری‌شده تطبیق داده می‌شود.',
  'app.tools.heading': 'ابزارها',
  'app.tool.windowLevel': 'پنجره/سطح',
  'app.tool.pan': 'جابه‌جایی',
  'app.tool.zoom': 'بزرگ‌نمایی',
  'app.tool.length': 'طول',
  'app.tool.rectangle': 'مستطیل',
  'app.tool.ellipse': 'بیضی',
  'app.tool.probe': 'کاوشگر',

  'app.shortcuts.title': 'میان‌برهای صفحه‌کلید',
  'app.shortcuts.slice': 'تصویر قبلی / بعدی',
  'app.shortcuts.series': 'سری قبلی / بعدی',
  'app.shortcuts.ends': 'نخستین / آخرین تصویر',
  'app.shortcuts.tools': 'انتخاب ابزار — کلید هر ابزار روی دکمهٔ آن در نوار نوشته شده است',
  'app.shortcuts.reset': 'بازنشانی نمای تصویر',
  'app.shortcuts.help': 'باز کردن همین فهرست',

  'app.progress.reading': 'در حال خواندن بایگانی…',
  'app.progress.extracting': 'در حال استخراج…',
  'app.progress.indexing': 'خواندن سرآیندها {done} / {total}',

  'app.error.noSamples':
    'نمونه‌ای پیدا نشد. برای دانلود آن‌ها در playground/public/samples/ دستور `pnpm samples` را اجرا کنید.',
  'app.error.noDicomInZip': 'هیچ تصویر دایکامی در {file} پیدا نشد.',
  'app.error.noDicomFiles': { other: 'هیچ‌کدام از آن {count} فایل دایکام نیست.' },

  'app.skipped.summary': '{count}: {named}',
  'app.skipped.more': '{count}: {named} و {rest} مورد دیگر',
  'app.skipped.entry': '{name} ({reason})',
  'app.skip.metadata': 'فایل جانبی',
  'app.skip.notDicomExtension': 'پسوند دایکام نیست',
  'app.skip.notDicom': 'سرآیند دایکام ندارد',
  'app.skip.empty': 'خالی',

  'app.source.samples': { other: '{count} نمونهٔ همراه (یک برش CT برای هر نحو انتقال)' },
  'app.source.files': { other: '{count} فایل محلی، مرتب‌شده بر اساس InstanceNumber' },
  'app.source.zip': '{file} — {images} در {series}',
  'app.count.images': { other: '{count} تصویر' },
  'app.count.series': { other: '{count} سری' },
  'app.count.skipped': { other: '{count} فایل نادیده گرفته شد' },
}

export const messages = { en, fa }
