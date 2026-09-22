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
  'app.annotations.needImages':
    'Open the DICOM images first — an annotation file is matched to the slices that are loaded.',

  // Cine playback, and the prefetch that makes it run at the rate asked for.
  'app.cine.play': 'Play the series',
  'app.cine.pause': 'Pause',
  'app.cine.buffering': 'Preparing enough of the series to play…',
  'app.cine.loop': 'Loop',
  'app.cine.frameRate': 'Frame rate',
  'app.cine.fps': '{count} fps',
  'app.cine.prepare': 'Prepare',
  'app.cine.prepareHint':
    'Decode every image up front, so playback and scrolling never wait for the loader.',

  'app.tools.heading': 'Tools',
  'app.tool.windowLevel': 'Window/Level',
  'app.tool.pan': 'Pan',
  'app.tool.zoom': 'Zoom',
  'app.tool.length': 'Length',
  'app.tool.rectangle': 'Rectangle',
  'app.tool.ellipse': 'Ellipse',
  'app.tool.probe': 'Probe',

  // Deleting the measurements the reader drew. Counts ride in the labels
  // because the buttons are only shown when there is something to delete, so
  // the number is the useful part of the sentence.
  'app.measurements.deleteSelected': {
    one: 'Delete the selected measurement',
    other: 'Delete {count} selected measurements',
  },
  'app.measurements.selectHint': 'Click a measurement to select it, then delete it.',
  'app.measurements.clearSlice': {
    one: 'Delete {count} measurement on this image',
    other: 'Delete {count} measurements on this image',
  },
  'app.measurements.clearAll': {
    one: 'Delete {count} measurement in this series',
    other: 'Delete {count} measurements in this series',
  },
  'app.measurements.confirmTitle': 'Delete all measurements?',
  'app.measurements.confirmBody': {
    one: 'The measurement drawn on this series will be removed. This cannot be undone.',
    other: 'All {count} measurements drawn on this series will be removed. This cannot be undone.',
  },
  'app.measurements.confirmDelete': 'Delete',
  'app.measurements.cancel': 'Cancel',

  'app.shortcuts.title': 'Keyboard shortcuts',
  'app.shortcuts.slice': 'Previous / next image',
  'app.shortcuts.series': 'Previous / next series',
  'app.shortcuts.ends': 'First / last image',
  'app.shortcuts.tools': 'Pick a tool — each button on the rail shows its key',
  'app.shortcuts.reset': 'Reset the viewport',
  'app.shortcuts.cine': 'Play / pause the series',
  'app.shortcuts.delete': 'Delete the selected measurement — click one to select it',
  'app.shortcuts.help': 'Open this list',

  'app.error.noSamples':
    'No samples found. Run `pnpm samples` to download them into playground/public/samples/.',

  'app.source.samples': {
    one: '{count} bundled sample (one CT slice per transfer syntax)',
    other: '{count} bundled samples (one CT slice per transfer syntax)',
  },
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
  'app.annotations.needImages':
    'نخست تصاویر دایکام را باز کنید — فایل حاشیه‌نویسی با برش‌های بارگذاری‌شده تطبیق داده می‌شود.',

  'app.cine.play': 'پخش سری',
  'app.cine.pause': 'توقف',
  'app.cine.buffering': 'در حال آماده‌سازی بخش کافی از سری برای پخش…',
  'app.cine.loop': 'تکرار',
  'app.cine.frameRate': 'نرخ فریم',
  'app.cine.fps': '{count} فریم بر ثانیه',
  'app.cine.prepare': 'آماده‌سازی',
  'app.cine.prepareHint':
    'همهٔ تصاویر از پیش رمزگشایی می‌شوند تا پخش و پیمایش منتظر بارگذار نمانند.',

  'app.tools.heading': 'ابزارها',
  'app.tool.windowLevel': 'پنجره/سطح',
  'app.tool.pan': 'جابه‌جایی',
  'app.tool.zoom': 'بزرگ‌نمایی',
  'app.tool.length': 'طول',
  'app.tool.rectangle': 'مستطیل',
  'app.tool.ellipse': 'بیضی',
  'app.tool.probe': 'کاوشگر',

  'app.measurements.deleteSelected': { other: 'حذف {count} اندازه‌گیری انتخاب‌شده' },
  'app.measurements.selectHint': 'روی یک اندازه‌گیری کلیک کنید تا انتخاب شود، سپس آن را حذف کنید.',
  'app.measurements.clearSlice': { other: 'حذف {count} اندازه‌گیری روی این تصویر' },
  'app.measurements.clearAll': { other: 'حذف {count} اندازه‌گیری در این سری' },
  'app.measurements.confirmTitle': 'همهٔ اندازه‌گیری‌ها حذف شوند؟',
  'app.measurements.confirmBody': {
    other: 'همهٔ {count} اندازه‌گیری ترسیم‌شده روی این سری حذف می‌شوند. این کار برگشت‌پذیر نیست.',
  },
  'app.measurements.confirmDelete': 'حذف',
  'app.measurements.cancel': 'انصراف',

  'app.shortcuts.title': 'میان‌برهای صفحه‌کلید',
  'app.shortcuts.slice': 'تصویر قبلی / بعدی',
  'app.shortcuts.series': 'سری قبلی / بعدی',
  'app.shortcuts.ends': 'نخستین / آخرین تصویر',
  'app.shortcuts.tools': 'انتخاب ابزار — کلید هر ابزار روی دکمهٔ آن در نوار نوشته شده است',
  'app.shortcuts.reset': 'بازنشانی نمای تصویر',
  'app.shortcuts.cine': 'پخش / توقف سری',
  'app.shortcuts.delete': 'حذف اندازه‌گیری انتخاب‌شده — برای انتخاب روی آن کلیک کنید',
  'app.shortcuts.help': 'باز کردن همین فهرست',

  'app.error.noSamples':
    'نمونه‌ای پیدا نشد. برای دانلود آن‌ها در playground/public/samples/ دستور `pnpm samples` را اجرا کنید.',

  'app.source.samples': { other: '{count} نمونهٔ همراه (یک برش CT برای هر نحو انتقال)' },
}

export const messages = { en, fa }
