export type Lang = 'ar' | 'fr' | 'en'

export const LANGS: { id: Lang; label: string }[] = [
  { id: 'ar', label: 'ع' },
  { id: 'fr', label: 'FR' },
  { id: 'en', label: 'EN' },
]

const en = {
  title: 'Prompt Mask',
  tagline: 'Hide keys, tokens and personal data before you paste into an AI chat',
  trust: 'Everything happens in this page. Its security policy forbids it from sending anything anywhere, and the real values are forgotten when you close it.',
  whatToMask: 'What to hide',
  secrets: 'Keys and passwords',
  personal: 'Personal data',
  network: 'IP addresses',
  example: 'Try an example',
  forget: 'Clear and forget',
  yourPrompt: 'Your prompt',
  promptPlaceholder: 'Paste your text, logs or code here...',
  safeToSend: 'Safe to send',
  maskedEmpty: 'Placeholders such as [[GITHUB_TOKEN_1]] appear here.',
  nothing: 'Nothing found. Still read it before sending.',
  copy: 'Copy',
  copied: 'Copied',
  modelReply: "The model's reply",
  replyPlaceholder: 'Paste the reply here to put the real values back...',
  restored: 'With your values',
  restoredEmpty: 'The reply appears here, with the placeholders replaced.',
  limits: 'It finds known formats and checks numbers where it can (cards, IBAN, RIB). It can miss a secret with no recognisable shape, and names or addresses written in plain text, so read the text before sending it.',
}

export type Strings = typeof en

const fr: Strings = {
  title: 'Prompt Mask',
  tagline: "Masquez clés, jetons et données personnelles avant de coller dans un chat d'IA",
  trust: "Tout se passe dans cette page. Sa politique de sécurité lui interdit d'envoyer quoi que ce soit, et les vraies valeurs sont oubliées à sa fermeture.",
  whatToMask: 'Quoi masquer',
  secrets: 'Clés et mots de passe',
  personal: 'Données personnelles',
  network: 'Adresses IP',
  example: 'Essayer un exemple',
  forget: 'Effacer et oublier',
  yourPrompt: 'Votre prompt',
  promptPlaceholder: 'Collez ici votre texte, vos logs ou votre code...',
  safeToSend: 'Sûr à envoyer',
  maskedEmpty: 'Des marqueurs comme [[GITHUB_TOKEN_1]] apparaissent ici.',
  nothing: 'Rien trouvé. Relisez quand même avant d’envoyer.',
  copy: 'Copier',
  copied: 'Copié',
  modelReply: 'La réponse du modèle',
  replyPlaceholder: 'Collez la réponse ici pour remettre les vraies valeurs...',
  restored: 'Avec vos valeurs',
  restoredEmpty: 'La réponse apparaît ici, avec les marqueurs remplacés.',
  limits: 'L’outil reconnaît des formats connus et vérifie les numéros quand c’est possible (cartes, IBAN, RIB). Il peut manquer un secret sans forme reconnaissable, ou des noms et adresses en clair : relisez le texte avant de l’envoyer.',
}

const ar: Strings = {
  title: 'Prompt Mask',
  tagline: 'أخفِ المفاتيح وكلمات المرور والبيانات الشخصية قبل لصقها في محادثة الذكاء الاصطناعي',
  trust: 'كل شيء يتم داخل هذه الصفحة. سياسة الأمان تمنعها من إرسال أي شيء إلى أي مكان، وتُنسى القيم الحقيقية عند إغلاقها.',
  whatToMask: 'ما يجب إخفاؤه',
  secrets: 'المفاتيح وكلمات المرور',
  personal: 'البيانات الشخصية',
  network: 'عناوين IP',
  example: 'جرّب مثالا',
  forget: 'امسح وانسَ',
  yourPrompt: 'نصك',
  promptPlaceholder: 'الصق هنا نصك أو السجلات أو الكود...',
  safeToSend: 'آمن للإرسال',
  maskedEmpty: 'تظهر هنا رموز بديلة مثل [[GITHUB_TOKEN_1]].',
  nothing: 'لم يُعثر على شيء. اقرأه مع ذلك قبل الإرسال.',
  copy: 'نسخ',
  copied: 'تم النسخ',
  modelReply: 'رد النموذج',
  replyPlaceholder: 'الصق الرد هنا لإعادة القيم الحقيقية...',
  restored: 'بقيمك الحقيقية',
  restoredEmpty: 'يظهر الرد هنا، مع استبدال الرموز البديلة.',
  limits: 'يتعرف على الصيغ المعروفة ويتحقق من الأرقام حيث أمكن (البطاقات، IBAN، RIB). قد يفوته سر بلا شكل مميز، أو أسماء وعناوين مكتوبة نصا، فاقرأ النص قبل إرساله.',
}

export const STRINGS: Record<Lang, Strings> = { ar, fr, en }

export function initialLang(): Lang {
  try {
    const saved = localStorage.getItem('mask:lang')
    if (saved === 'ar' || saved === 'fr' || saved === 'en') return saved
  } catch {
    /* private window */
  }
  const nav = navigator.language.slice(0, 2)
  return nav === 'ar' || nav === 'fr' ? nav : 'en'
}
