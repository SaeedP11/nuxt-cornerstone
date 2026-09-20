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
  'app.openFiles': 'Open DICOM files…',
  'app.openZip': 'Open ZIP…',
  'app.clear': 'Clear',
  'app.resetCamera': 'Reset camera',
  'app.empty':
    'Drop DICOM files or a ZIP archive here, open them from the toolbar, or load the bundled samples.',

  'app.tool.windowLevel': 'Window/Level',
  'app.tool.pan': 'Pan',
  'app.tool.zoom': 'Zoom',
  'app.tool.length': 'Length',
  'app.tool.rectangle': 'Rectangle',
  'app.tool.ellipse': 'Ellipse',
  'app.tool.probe': 'Probe',

  'app.progress.reading': 'Reading archive…',
  'app.progress.extracting': 'Extracting…',
  'app.progress.indexing': 'Reading headers {done} / {total}',

  'app.error.noSamples':
    'No samples found. Run `pnpm samples` to download them into playground/public/samples/.',
  'app.error.noDicomInZip': 'No DICOM images found in {file}.',

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
  'app.openFiles': 'باز کردن فایل‌های دایکام…',
  'app.openZip': 'باز کردن فایل ZIP…',
  'app.clear': 'پاک‌سازی',
  'app.resetCamera': 'بازنشانی دوربین',
  'app.empty':
    'فایل‌های دایکام یا یک بایگانی ZIP را اینجا رها کنید، از نوار ابزار بازشان کنید، یا نمونه‌های همراه را بارگذاری کنید.',

  'app.tool.windowLevel': 'پنجره/سطح',
  'app.tool.pan': 'جابه‌جایی',
  'app.tool.zoom': 'بزرگ‌نمایی',
  'app.tool.length': 'طول',
  'app.tool.rectangle': 'مستطیل',
  'app.tool.ellipse': 'بیضی',
  'app.tool.probe': 'کاوشگر',

  'app.progress.reading': 'در حال خواندن بایگانی…',
  'app.progress.extracting': 'در حال استخراج…',
  'app.progress.indexing': 'خواندن سرآیندها {done} / {total}',

  'app.error.noSamples':
    'نمونه‌ای پیدا نشد. برای دانلود آن‌ها در playground/public/samples/ دستور `pnpm samples` را اجرا کنید.',
  'app.error.noDicomInZip': 'هیچ تصویر دایکامی در {file} پیدا نشد.',

  'app.source.samples': { other: '{count} نمونهٔ همراه (یک برش CT برای هر نحو انتقال)' },
  'app.source.files': { other: '{count} فایل محلی، مرتب‌شده بر اساس InstanceNumber' },
  'app.source.zip': '{file} — {images} در {series}',
  'app.count.images': { other: '{count} تصویر' },
  'app.count.series': { other: '{count} سری' },
  'app.count.skipped': { other: '{count} فایل نادیده گرفته شد' },
}

export const messages = { en, fa }
