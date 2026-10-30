/* UI strings in Arabic and English. The layout flips between RTL and LTR with the language. */
var I18n = (function () {
  'use strict';

  var S = {
    en: {
      app_name: 'Nexlify',
      login_title: 'Sign in',
      login_sub: 'Enter your Xtream subscription once. It stays saved on this TV.',
      server: 'Server URL',
      server_hint: 'e.g. http://example.com:8080',
      username: 'Username',
      password: 'Password',
      login_btn: 'Sign in',
      lang_switch: 'العربية',

      menu_home: 'Home',
      menu_live: 'Live TV',
      row_continue: 'Continue watching',
      row_recent: 'Recently watched channels',
      row_fav_live: 'Favorite channels',
      row_fav: 'My list',
      row_new_vod: 'Recently added movies',
      row_new_series: 'Recently added series',
      home_loading: 'Getting your home screen ready...',
      menu_vod: 'Movies',
      menu_series: 'Series',
      menu_fav: 'Favorites',
      menu_search: 'Search',
      menu_settings: 'Settings',

      categories: 'Categories',
      all: 'All',
      recent: 'Recently watched',
      continue: 'Continue watching',

      connecting: 'Connecting to server...',
      loading_live: 'Loading channels...',
      loading_vod: 'Loading movies...',
      loading_series: 'Loading series...',
      loading_info: 'Loading details...',
      err_load: 'Could not load data from the server. Try again.',
      err_auth: 'Wrong username or password, or the subscription has expired.',
      err_connect: 'Could not reach the server. Check the URL and your internet.',
      err_fields: 'Please fill in all fields.',
      err_series: 'Could not load this series.',
      no_episodes: 'No episodes available for this series.',

      fav_added: 'Added to favorites: {name}',
      fav_removed: 'Removed from favorites: {name}',
      fav_empty: 'Nothing here yet. Long-press OK (or the yellow button) on any channel, movie or series to add it.',
      empty: 'Nothing here',
      search_ph: 'Search channels, movies and series...',
      search_hint: 'Type in the box above',
      search_min: 'Type at least 2 letters',
      search_none: 'No results for that name',
      search_results: 'Results ({n})',

      set_lang: 'Language',
      set_lang_value: 'English',
      set_format: 'Live stream format',
      set_reload: 'Reload lists from server',
      set_reload_done: 'Lists will reload next time you open them',
      set_exp: 'Subscription expires',
      set_conn: 'Allowed connections',
      set_server: 'Server',
      set_logout: 'Sign out',
      prev_ep: 'Previous episode',
      set_accounts: 'Subscriptions',
      acc_add: '+ Add subscription',
      acc_use: 'Use this subscription',
      acc_edit: 'Edit',
      acc_delete: 'Delete',
      acc_active: 'In use',
      acc_delete_q: 'Delete "{name}"?',
      acc_delete_msg: 'Its favorites and watch progress on this TV are deleted too.',
      acc_name: 'Subscription name',
      acc_name_hint: '(e.g. Home)',
      default_acc: 'Subscription {n}',
      saved_accounts: 'Saved subscriptions',
      add_title: 'Add subscription',
      edit_title: 'Edit subscription',
      save: 'Save',
      saved: 'Saved',
      logout_q: 'Sign out of "{name}"?',
      logout_msg: 'Your saved subscriptions stay on this TV.',
      yes: 'Yes',
      no: 'No',
      set_theme: 'Look',
      theme_aurora: 'Aurora',
      theme_cinema: 'Cinema',
      theme_pulse: 'Pulse',
      upnext_in: 'Next episode in {n}s',
      upnext_hint: 'OK: play it now',
      next_ep: 'Next episode',
      ep_label: 'S{s} E{e}',
      set_update: 'Check for updates',
      set_version: 'Version {v}',
      update_checking: 'Checking for updates...',
      update_none: 'You have the latest version',
      update_ready: 'Update downloaded. Restarting...',
      update_fail: 'Could not check for updates. Check the internet connection.',
      unknown: 'Unknown',
      expires: 'Expires {date}',

      kind_live: 'Channel',
      kind_vod: 'Movie',
      kind_series: 'Series',

      exit_confirm: 'Press Back again to exit',
      season: 'Season {n}',
      seasons: 'Seasons',
      episodes: 'Episodes',
      episode: 'Episode {n}',
      resume_badge: 'In progress',

      play: 'Play',
      resume: 'Resume from {time}',
      start_over: 'Start over',
      add_fav: 'Add to favorites',
      remove_fav: 'Remove from favorites',
      minutes: '{n} min',

      retry_format: 'Trying another stream format...',
      ch_down: 'This channel is not available right now',
      play_err: 'Could not play this video',
      no_channel: 'No channel number {n}',
      resume_from: 'Resuming from {time}',
      now: 'Now',
      next: 'Next',
      no_epg: 'No program info',
      channels_n: 'Channels ({n})',
      left: '{time} left',

      hint_browse: 'OK: Open  •  Hold OK / Yellow: Favorite  •  Back: Return',
      hint_details: 'OK: Select  •  Back: Return'
    },
    ar: {
      app_name: 'Nexlify',
      login_title: 'تسجيل الدخول',
      login_sub: 'اكتب بيانات اشتراك Xtream مرة واحدة، وهتتحفظ على الشاشة.',
      server: 'عنوان السيرفر',
      server_hint: 'مثال: http://example.com:8080',
      username: 'اسم المستخدم',
      password: 'كلمة السر',
      login_btn: 'دخول',
      lang_switch: 'English',

      menu_home: 'الرئيسية',
      menu_live: 'القنوات',
      row_continue: 'كمّل المشاهدة',
      row_recent: 'قنوات شوفتها مؤخراً',
      row_fav_live: 'قنواتك المفضلة',
      row_fav: 'قايمتي',
      row_new_vod: 'أفلام نزلت جديد',
      row_new_series: 'مسلسلات نزلت جديد',
      home_loading: 'بنجهّز الصفحة الرئيسية...',
      menu_vod: 'الأفلام',
      menu_series: 'المسلسلات',
      menu_fav: 'المفضلة',
      menu_search: 'بحث',
      menu_settings: 'الإعدادات',

      categories: 'الأقسام',
      all: 'الكل',
      recent: 'شوفتها مؤخراً',
      continue: 'كمّل المشاهدة',

      connecting: 'بنتصل بالسيرفر...',
      loading_live: 'بنحمّل القنوات...',
      loading_vod: 'بنحمّل الأفلام...',
      loading_series: 'بنحمّل المسلسلات...',
      loading_info: 'بنحمّل التفاصيل...',
      err_load: 'تعذّر تحميل البيانات من السيرفر. جرّب تاني.',
      err_auth: 'اسم المستخدم أو كلمة السر غلط، أو الاشتراك منتهي',
      err_connect: 'تعذّر الاتصال بالسيرفر. اتأكد من العنوان والنت.',
      err_fields: 'كمّل كل الخانات الأول',
      err_series: 'تعذّر تحميل بيانات المسلسل',
      no_episodes: 'مفيش حلقات متاحة للمسلسل ده',

      fav_added: 'اتضافت للمفضلة: {name}',
      fav_removed: 'اتشالت من المفضلة: {name}',
      fav_empty: 'لسه مفيش حاجة في المفضلة. اضغط OK مطوّل (أو الزرار الأصفر) على أي قناة أو فيلم أو مسلسل عشان تضيفه.',
      empty: 'مفيش حاجة هنا',
      search_ph: 'دوّر على قناة أو فيلم أو مسلسل...',
      search_hint: 'اكتب في الخانة اللي فوق',
      search_min: 'اكتب حرفين على الأقل',
      search_none: 'مالقيناش حاجة بالاسم ده',
      search_results: 'النتايج ({n})',

      set_lang: 'اللغة',
      set_lang_value: 'العربية',
      set_format: 'صيغة البث المباشر',
      set_reload: 'تحديث القوائم من السيرفر',
      set_reload_done: 'القوائم هتتحمّل من جديد لما تفتحها',
      set_exp: 'الاشتراك ينتهي',
      set_conn: 'عدد الأجهزة المسموح',
      set_server: 'السيرفر',
      set_logout: 'تسجيل الخروج',
      prev_ep: 'الحلقة اللي فاتت',
      set_accounts: 'الاشتراكات',
      acc_add: '+ إضافة اشتراك',
      acc_use: 'استخدم الاشتراك ده',
      acc_edit: 'تعديل',
      acc_delete: 'حذف',
      acc_active: 'شغال دلوقتي',
      acc_delete_q: 'تمسح "{name}"؟',
      acc_delete_msg: 'المفضلة والمكان اللي وقفت فيه للاشتراك ده هيتمسحوا من الشاشة كمان.',
      acc_name: 'اسم الاشتراك',
      acc_name_hint: '(مثال: البيت)',
      default_acc: 'اشتراك {n}',
      saved_accounts: 'الاشتراكات المحفوظة',
      add_title: 'إضافة اشتراك',
      edit_title: 'تعديل الاشتراك',
      save: 'حفظ',
      saved: 'اتحفظ',
      logout_q: 'عايز تسجّل خروج من "{name}"؟',
      logout_msg: 'الاشتراكات المحفوظة هتفضل على الشاشة.',
      yes: 'أيوه',
      no: 'لأ',
      set_theme: 'الشكل',
      theme_aurora: 'Aurora',
      theme_cinema: 'Cinema',
      theme_pulse: 'Pulse',
      upnext_in: 'الحلقة الجاية خلال {n} ثواني',
      upnext_hint: 'OK: شغّلها دلوقتي',
      next_ep: 'الحلقة الجاية',
      ep_label: 'م{s} ح{e}',
      set_update: 'دوّر على تحديث',
      set_version: 'نسخة {v}',
      update_checking: 'بندوّر على تحديث...',
      update_none: 'عندك آخر نسخة',
      update_ready: 'التحديث اتنزل. التطبيق هيفتح من جديد...',
      update_fail: 'تعذّر التحقق من التحديثات. اتأكد من النت.',
      unknown: 'غير محدد',
      expires: 'ينتهي {date}',

      kind_live: 'قناة',
      kind_vod: 'فيلم',
      kind_series: 'مسلسل',

      exit_confirm: 'اضغط رجوع تاني عشان تخرج',
      season: 'الموسم {n}',
      seasons: 'المواسم',
      episodes: 'الحلقات',
      episode: 'الحلقة {n}',
      resume_badge: 'مكمّل',

      play: 'تشغيل',
      resume: 'كمّل من {time}',
      start_over: 'من الأول',
      add_fav: 'إضافة للمفضلة',
      remove_fav: 'شيل من المفضلة',
      minutes: '{n} دقيقة',

      retry_format: 'بنجرّب صيغة تانية للقناة...',
      ch_down: 'القناة دي مش شغالة دلوقتي',
      play_err: 'تعذّر تشغيل الفيديو',
      no_channel: 'مفيش قناة رقم {n}',
      resume_from: 'هنكمّل من {time}',
      now: 'دلوقتي',
      next: 'بعدها',
      no_epg: 'مفيش معلومات عن البرنامج',
      channels_n: 'القنوات ({n})',
      left: 'فاضل {time}',

      hint_browse: 'OK: فتح  •  OK مطوّل / الأصفر: مفضلة  •  رجوع: للخلف',
      hint_details: 'OK: اختيار  •  رجوع: للخلف'
    }
  };

  var lang = Util.store.get('lang', 'ar') === 'en' ? 'en' : 'ar';

  function t(key, params) {
    var s = S[lang][key];
    if (s === undefined) s = S.en[key] !== undefined ? S.en[key] : key;
    if (params) {
      Object.keys(params).forEach(function (k) { s = s.split('{' + k + '}').join(params[k]); });
    }
    return s;
  }

  // Elements marked data-i18n / data-i18n-ph get their text from the table
  function apply() {
    var root = document.documentElement;
    root.lang = lang;
    root.dir = lang === 'ar' ? 'rtl' : 'ltr';
    var nodes = document.querySelectorAll('[data-i18n]'), i;
    for (i = 0; i < nodes.length; i++) nodes[i].textContent = t(nodes[i].getAttribute('data-i18n'));
    nodes = document.querySelectorAll('[data-i18n-ph]');
    for (i = 0; i < nodes.length; i++) nodes[i].placeholder = t(nodes[i].getAttribute('data-i18n-ph'));
  }

  function set(l) {
    lang = l === 'en' ? 'en' : 'ar';
    Util.store.set('lang', lang);
    apply();
  }

  return {
    t: t, apply: apply, set: set,
    lang: function () { return lang; },
    rtl: function () { return lang === 'ar'; },
    locale: function () { return lang === 'ar' ? 'ar-EG' : 'en-GB'; }
  };
})();
