export const strings: Record<string, string> = {

  // ═══════════════════════════════════════
  // Navigation
  // ═══════════════════════════════════════
  "nav.items.dashboard": "לוח בקרה",
  "nav.items.contentEngine": "Content Engine",
  "nav.items.sumitSync": "Sumit Sync",
  "nav.items.documents": "מסמכים",
  "nav.items.settings": "הגדרות",

  // ═══════════════════════════════════════
  // Dashboard
  // ═══════════════════════════════════════
  "dashboard.title": "לוח בקרה",
  "dashboard.subtitle": "סקירה כללית",

  // Dashboard module links
  "dashboard.modules.title": "מודולים",
  "dashboard.modules.contentEngine.description": "ניהול תוכן מקצועי — חוזרים, מסמכים ופרסומים.",
  "dashboard.modules.sumitSync.description": "סנכרון נתוני סאמיט — ייבוא ועדכון אוטומטי.",

  // Placeholder modules (coming soon)
  "nav.items.customerOnboarding": "Customer Onboarding",
  "nav.items.analytics": "Analytics",
  "dashboard.modules.customerOnboarding.description": "קליטת לקוחות חכמה — דרך API סאמיט ודף נחיתה ייעודי.",
  "dashboard.modules.analytics.description": "ניתוח נתוני לקוחות — דוחות, תובנות וסטטיסטיקות.",

  // Dashboard — coming soon
  "dashboard.comingSoon": "בקרוב",
  "dashboard.comingSoonDetail": "לוח הבקרה יציג נתונים בזמן אמת לאחר הפעלת המודולים.",

  // Placeholder — coming soon (generic)
  "common.comingSoon.title": "בקרוב",
  "common.comingSoon.subtitle": "עמוד זה בפיתוח ויהיה זמין בקרוב.",

  // ═══════════════════════════════════════
  // Content Engine
  // ═══════════════════════════════════════
  "contentEngine.title": "Content Engine",
  "contentEngine.subtitle": "ניהול תוכן מקצועי",
  "contentEngine.upload.title": "העלאת מסמך",
  "contentEngine.upload.description": "ניתן לגרור קובץ DOCX לאזור זה או לבחור קובץ",
  "contentEngine.upload.button": "בחר קובץ DOCX",
  "contentEngine.upload.processing": "מעבד את המסמך...",
  "contentEngine.upload.success": "המסמך עובד בהצלחה",
  "contentEngine.upload.error": "שגיאה בעיבוד המסמך. נסו שנית.",
  "contentEngine.upload.another": "העלה מסמך נוסף",
  "contentEngine.preview.title": "תצוגה מקדימה",
  "contentEngine.preview.fallback": "הדפדפן אינו תומך בתצוגה מקדימה של PDF.",
  "contentEngine.download.button": "הורד PDF",
  "contentEngine.error.details": "פרטים טכניים",
  "contentEngine.history.title": "היסטוריית המרות",
  "contentEngine.history.empty": "אין המרות קודמות",
  "contentEngine.history.emptyDetail": "המרות שתבוצענה יופיעו כאן",
  "contentEngine.history.colFile": "קובץ",
  "contentEngine.history.colStatus": "סטטוס",
  "contentEngine.history.colSize": "גודל",
  "contentEngine.history.colDuration": "זמן",
  "contentEngine.history.colDate": "תאריך",
  "contentEngine.history.colActions": "פעולות",
  "contentEngine.history.download": "הורדה",
  "contentEngine.processing.step1": "מעלה קובץ...",
  "contentEngine.processing.step2": "ממיר למסמך ממותג...",
  "contentEngine.processing.step3": "מייצר PDF...",
  "contentEngine.export.title": "ייצוא",
  "contentEngine.export.pdf": "ייצוא כ־PDF",
  "contentEngine.export.success": "הקובץ יוצא בהצלחה",

  // ═══════════════════════════════════════
  // Sumit Sync
  // ═══════════════════════════════════════
  "sumitSync.title": "Sumit Sync",
  "sumitSync.subtitle": "סנכרון IDOM-SUMIT — התאמה, חריגים ויצוא",
  "sumitSync.status.synced": "מסונכרן",
  "sumitSync.status.syncing": "מסנכרן...",
  "sumitSync.status.error": "שגיאה בסנכרון",
  "sumitSync.status.lastSync": "סנכרון אחרון",
  "sumitSync.actions.syncNow": "סנכרון עכשיו",
  "sumitSync.actions.newRun": "הרצה חדשה",
  "sumitSync.syncComplete": "סנכרון Sumit Sync הושלם",
  "sumitSync.syncError": "שגיאה בסנכרון Sumit Sync. נסו שנית.",

  // Run list
  "sumitSync.runs.empty": "עדיין אין הרצות",
  "sumitSync.runs.emptyDetail": "לחצו על ׳הרצה חדשה׳ כדי להתחיל סנכרון ראשון",
  "sumitSync.runs.colYear": "שנת מס",
  "sumitSync.runs.colType": "סוג דוח",
  "sumitSync.runs.colStatus": "סטטוס",
  "sumitSync.runs.colDate": "תאריך",
  "sumitSync.runs.detail": "פרטים",
  "sumitSync.runs.typeFinancial": "דוחות כספיים",
  "sumitSync.runs.typeAnnual": "דוחות שנתיים",

  // Run detail
  "sumitSync.detail.title": "פרטי הרצה",
  "sumitSync.detail.status": "סטטוס",
  "sumitSync.detail.createdAt": "תאריך יצירה",
  "sumitSync.detail.processingTime": "זמן עיבוד",
  "sumitSync.detail.seconds": "שניות",
  "sumitSync.detail.completeRun": "סמן הרצה כהושלמה",
  "sumitSync.detail.completing": "מסיים...",
  "sumitSync.detail.backToList": "חזרה לרשימה",
  "sumitSync.detail.completedBanner": "ההרצה הושלמה ונעולה לעריכה.",
  "sumitSync.detail.notFound": "הרצה לא נמצאה",

  // Metrics
  "sumitSync.metrics.title": "מדדים",
  "sumitSync.metrics.idomRecords": "רשומות IDOM",
  "sumitSync.metrics.sumitRecords": "רשומות SUMIT",
  "sumitSync.metrics.matched": "התאמות",
  "sumitSync.metrics.unmatched": "ללא התאמה",
  "sumitSync.metrics.changes": "שינויים",
  "sumitSync.metrics.statusCompleted": "סטטוס הושלם",
  "sumitSync.metrics.regressions": "נסיגות סטטוס",

  // Files
  "sumitSync.files.output": "קבצי פלט",
  "sumitSync.files.input": "קבצי קלט",

  // Exceptions
  "sumitSync.exceptions.title": "חריגים",
  "sumitSync.exceptions.pending": "ממתינים",
  "sumitSync.exceptions.reviewed": "נבדקו",
  "sumitSync.exceptions.bulkAck": "סמן הכל כנבדק",
  "sumitSync.exceptions.updating": "מעדכן...",
  "sumitSync.exceptions.colType": "סוג",
  "sumitSync.exceptions.colRef": "מספר תיק",
  "sumitSync.exceptions.colName": "שם",
  "sumitSync.exceptions.colDesc": "תיאור",
  "sumitSync.exceptions.colStatus": "סטטוס",
  "sumitSync.exceptions.colActions": "פעולות",
  "sumitSync.exceptions.ack": "נבדק",
  "sumitSync.exceptions.dismiss": "דחייה",

  // Confirm dialog
  "sumitSync.confirm.completeTitle": "השלמת הרצה",
  "sumitSync.confirm.completeBody": "יש {n} חריגים שטרם נבדקו. לאחר השלמה ההרצה תינעל לעריכה. להמשיך?",

  // ═══════════════════════════════════════
  // Documents
  // ═══════════════════════════════════════
  "documents.title": "מסמכים",
  "documents.subtitle": "ניהול מסמכים",
  "documents.table.col.name": "שם",
  "documents.table.col.type": "סוג",
  "documents.table.col.size": "גודל",
  "documents.table.col.modified": "עודכן",
  "documents.table.col.owner": "בעלים",
  "documents.search.placeholder": "חיפוש מסמכים...",
  "documents.filter.all": "הכל",
  "documents.filter.recent": "אחרונים",
  "documents.filter.drafts": "טיוטות",
  "documents.filter.published": "פורסמו",

  // ═══════════════════════════════════════
  // Settings
  // ═══════════════════════════════════════
  "settings.title": "הגדרות",
  "settings.subtitle": "הגדרות מערכת",
  "settings.sections.general": "כללי",
  "settings.sections.users": "משתמשים",
  "settings.sections.integrations": "אינטגרציות",
  "settings.saved": "ההגדרות נשמרו בהצלחה",

  // ═══════════════════════════════════════
  // Common Actions
  // ═══════════════════════════════════════
  "common.actions.save": "שמירה",
  "common.actions.cancel": "ביטול",
  "common.actions.delete": "מחיקה",
  "common.actions.edit": "עריכה",
  "common.actions.export": "ייצוא",
  "common.actions.import": "ייבוא",
  "common.actions.upload": "העלאה",
  "common.actions.download": "הורדה",
  "common.actions.create": "יצירה",
  "common.actions.newDocument": "מסמך חדש",
  "common.actions.refresh": "רענון",
  "common.actions.filter": "סינון",
  "common.actions.search": "חיפוש",
  "common.actions.copy": "העתקה",
  "common.actions.close": "סגירה",
  "common.actions.back": "חזרה",
  "common.actions.next": "הבא",
  "common.actions.confirm": "אישור",
  "common.actions.selectFile": "בחירת קובץ",
  "common.actions.tryAgain": "נסו שנית",

  // ═══════════════════════════════════════
  // Common Status
  // ═══════════════════════════════════════
  "common.status.loading": "טוען...",
  "common.status.saving": "שומר...",
  "common.status.processing": "מעבד...",
  "common.status.syncing": "מסנכרן...",

  "common.status.active": "פעיל",
  "common.status.inactive": "לא פעיל",
  "common.status.published": "פורסם",
  "common.status.draft": "טיוטה",
  "common.status.pending": "ממתין",
  "common.status.error": "שגיאה",
  "common.status.completed": "הושלם",

  // ═══════════════════════════════════════
  // Common Messages
  // ═══════════════════════════════════════
  "common.messages.saveSuccess": "נשמר בהצלחה",
  "common.messages.deleteSuccess": "נמחק",
  "common.messages.exportSuccess": "יוצא בהצלחה",
  "common.messages.uploadSuccess": "הועלה בהצלחה",
  "common.messages.copySuccess": "הועתק",
  "common.messages.genericSuccess": "הפעולה בוצעה",

  "common.messages.saveError": "שגיאה: לא ניתן לשמור. נסו שנית.",
  "common.messages.loadError": "שגיאה: לא ניתן לטעון את הנתונים.",
  "common.messages.networkError": "אין חיבור לשרת. בדקו את החיבור ונסו שנית.",
  "common.messages.timeoutError": "תם הזמן. נסו שנית.",
  "common.messages.permissionError": "אין הרשאה לביצוע פעולה זו.",
  "common.messages.notFound": "הפריט המבוקש לא נמצא.",
  "common.messages.invalidFormat": "סוג הקובץ אינו נתמך.",
  "common.messages.fileTooLarge": "הקובץ חורג מהגודל המותר.",
  "common.messages.sessionExpired": "פג תוקף ההתחברות. יש להתחבר מחדש.",
  "common.messages.genericError": "אירעה שגיאה. נסו שנית.",

  // ═══════════════════════════════════════
  // Common Dialogs
  // ═══════════════════════════════════════
  "common.confirm.deleteTitle": "מחיקת פריט",
  "common.confirm.deleteBody": "הפריט יימחק לצמיתות. פעולה זו אינה הפיכה.",
  "common.confirm.deleteDocument": "המסמך יימחק לצמיתות. פעולה זו אינה הפיכה.",
  "common.confirm.unsavedTitle": "שינויים שלא נשמרו",
  "common.confirm.unsavedBody": "קיימים שינויים שלא נשמרו. האם לשמור לפני יציאה?",
  "common.confirm.saveAndExit": "שמירה ויציאה",
  "common.confirm.exitWithout": "יציאה ללא שמירה",

  // ═══════════════════════════════════════
  // Empty States
  // ═══════════════════════════════════════
  "common.emptyState.title": "אין נתונים להצגה",
  "common.emptyState.subtitle": "ניתן ליצור מסמך חדש",
  "common.emptyState.documents": "אין מסמכים להצגה",
  "common.emptyState.activity": "אין פעילות אחרונה",
  "common.emptyState.results": "לא נמצאו תוצאות",
  "common.emptyState.searchResults": "לא נמצאו תוצאות עבור החיפוש",

  // ═══════════════════════════════════════
  // Form Validation
  // ═══════════════════════════════════════
  "common.validation.required": "שדה חובה",
  "common.validation.invalidEmail": "כתובת דוא״ל אינה תקינה",
  "common.validation.minLength": "יש להזין לפחות {min} תווים",
  "common.validation.maxLength": "ניתן להזין עד {max} תווים",
  "common.validation.invalidNumber": "יש להזין מספר תקין",

  // ═══════════════════════════════════════
  // Date & Time
  // ═══════════════════════════════════════
  "common.time.today": "היום",
  "common.time.yesterday": "אתמול",
  "common.time.minutesAgo": "לפני {n} דקות",
  "common.time.hoursAgo": "לפני {n} שעות",
  "common.time.daysAgo": "לפני {n} ימים",

  // ═══════════════════════════════════════
  // Content Factory
  // ═══════════════════════════════════════
  "nav.items.contentFactory": "Content Factory",
  "contentFactory.title": "Content Factory",
  "contentFactory.subtitle": "ניהול מאמרים, נכסים והפצה",
  "contentFactory.newArticle": "Article חדש",
  "contentFactory.search.placeholder": "חיפוש לפי כותרת...",
  "contentFactory.filter.all": "הכל",

  // Article statuses
  "contentFactory.status.DRAFT": "טיוטה",
  "contentFactory.status.IN_REVIEW": "בבדיקה",
  "contentFactory.status.APPROVED": "מאושר",
  "contentFactory.status.ARCHIVED": "בארכיון",

  // Distribution statuses
  "contentFactory.distribution.NOT_PUBLISHED": "לא פורסם",
  "contentFactory.distribution.PARTIALLY_PUBLISHED": "פורסם חלקית",
  "contentFactory.distribution.FULLY_PUBLISHED": "פורסם במלואו",

  // Article detail
  "contentFactory.article.title": "פרטי מאמר",
  "contentFactory.article.status": "סטטוס",
  "contentFactory.article.version": "גרסה",
  "contentFactory.article.distribution": "הפצה",
  "contentFactory.article.updatedAt": "עודכן",
  "contentFactory.article.backToList": "חזרה לרשימה",

  // Transitions
  "contentFactory.transition.submitReview": "שלח לבדיקה",
  "contentFactory.transition.approve": "אשר",
  "contentFactory.transition.reject": "החזר לטיוטה",
  "contentFactory.transition.archive": "ארכיון",

  // Next action hints
  "contentFactory.nextAction.DRAFT": "מה השלב הבא? שלח את המאמר לבדיקה.",
  "contentFactory.nextAction.IN_REVIEW": "מה השלב הבא? אשר או החזר לטיוטה.",
  "contentFactory.nextAction.APPROVED": "מה השלב הבא? צור נכסים לפלטפורמות והפץ.",
  "contentFactory.nextAction.ARCHIVED": "המאמר בארכיון.",
  "contentFactory.nextAction.allPublished": "כל הנכסים פורסמו בהצלחה.",

  // Assets
  "contentFactory.assets.title": "נכסים",
  "contentFactory.assets.create": "צור נכס",
  "contentFactory.assets.platform": "פלטפורמה",
  "contentFactory.assets.empty": "אין נכסים עדיין",
  "contentFactory.assets.emptyDetail": "צור נכס חדש לפלטפורמה",
  "contentFactory.assets.submitReview": "שלח לבדיקה",
  "contentFactory.assets.approve": "אשר",
  "contentFactory.assets.reject": "החזר לטיוטה",

  // Publish
  "contentFactory.publish.title": "פרסום ידני",
  "contentFactory.publish.urlLabel": "קישור חיצוני",
  "contentFactory.publish.urlPlaceholder": "https://...",
  "contentFactory.publish.submit": "פרסם",
  "contentFactory.publish.success": "הנכס פורסם בהצלחה",
  "contentFactory.publish.requiresApproval": "נדרש אישור לפני פרסום",

  // Publish jobs
  "contentFactory.publishJob.SUCCEEDED": "פורסם",
  "contentFactory.publishJob.FAILED": "נכשל",
  "contentFactory.publishJob.QUEUED": "בתור",
  "contentFactory.publishJob.RUNNING": "בפרסום",
  "contentFactory.publishJob.PARTIAL": "חלקי",

  // Errors
  "contentFactory.error.loadArticles": "שגיאה בטעינת מאמרים",
  "contentFactory.error.loadArticle": "שגיאה בטעינת מאמר",
  "contentFactory.error.createArticle": "שגיאה ביצירת מאמר",
  "contentFactory.error.transition": "שגיאה בשינוי סטטוס",
  "contentFactory.error.createAsset": "שגיאה ביצירת נכס",
  "contentFactory.error.publish": "שגיאה בפרסום",
  "contentFactory.error.technicalDetails": "פרטים טכניים",
  "contentFactory.error.notFound": "המאמר לא נמצא",

  // Table columns
  "contentFactory.col.title": "כותרת",
  "contentFactory.col.status": "סטטוס",
  "contentFactory.col.distribution": "הפצה",
  "contentFactory.col.updated": "עודכן",
  "contentFactory.col.assets": "נכסים",

  // Dashboard
  "dashboard.modules.contentFactory.description": "ניהול מאמרים, נכסים והפצה לפלטפורמות.",

  // ═══════════════════════════════════════
  // Bitan Website (Founder Console)
  // ═══════════════════════════════════════
  "nav.items.bitanWebsite": "Bitan Website",
  "bitanWebsite.title": "אתר ביטן את ביטן",
  "bitanWebsite.subtitle": "ניהול ומעקב אחר האתר — קישורים מהירים וסטטוס",

  // Quick Actions
  "bitanWebsite.quickActions.title": "פעולות מהירות",
  "bitanWebsite.quickActions.site": "אתר",
  "bitanWebsite.quickActions.siteDesc": "אתר ביטן את ביטן — סביבת Staging",
  "bitanWebsite.quickActions.studio": "עריכת תוכן (Sanity Studio)",
  "bitanWebsite.quickActions.studioDesc": "ממשק ניהול תוכן — Sanity Studio",
  "bitanWebsite.quickActions.ga4": "Analytics (GA4)",
  "bitanWebsite.quickActions.ga4Desc": "Google Analytics 4 — תצוגה בזמן אמת",

  // Status
  "bitanWebsite.status.title": "סטטוס שירותים",
  "bitanWebsite.status.site": "סטטוס אתר",
  "bitanWebsite.status.checking": "בודק...",
  "bitanWebsite.status.up": "פעיל",
  "bitanWebsite.status.down": "לא זמין",
  "bitanWebsite.status.availabilityBasic": "בדיקת זמינות (בסיסית)",

  // Resources
  "bitanWebsite.resources.title": "משאבים",
  "bitanWebsite.resources.railway": "Railway",
  "bitanWebsite.resources.railwayDesc": "ניהול שרת ודיפלוי — Railway",
  "bitanWebsite.resources.github": "GitHub",
  "bitanWebsite.resources.githubDesc": "קוד מקור האתר — GitHub",

  // Dashboard module card
  "dashboard.modules.bitanWebsite.description": "ניהול אתר ביטן את ביטן — קישורים, סטטוס ותוכן.",

  // ═══════════════════════════════════════
  // Module Names (English — never translate)
  // ═══════════════════════════════════════
  "modules.osHub": "OS Hub",
  "modules.contentEngine": "Content Engine",
  "modules.sumitSync": "Sumit Sync",
  "modules.contentFactory": "Content Factory",
  "modules.bitanWebsite": "Bitan Website",

};
