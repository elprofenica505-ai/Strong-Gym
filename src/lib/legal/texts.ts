/**
 * Textos legales públicos (privacidad, términos y cookies).
 * BORRADOR: deben ser revisados por un abogado en Nicaragua antes de publicar.
 * Los datos marcados entre corchetes [así] son pendientes que el gimnasio debe confirmar.
 */
import { siteConfig } from "../../config/site.ts";
import type { Locale } from "../../i18n/config.ts";

import { LEGAL_VERSION } from "./version.ts";
export { LEGAL_VERSION };
export const LEGAL_UPDATED = "21 de octubre de 2026";

export type LegalSection = { title: string; paragraphs: string[]; items?: string[] };
export type LegalDocument = { title: string; intro: string; sections: LegalSection[] };

const contact = siteConfig.contactEmail
  ? `correo ${siteConfig.contactEmail}`
  : `WhatsApp ${siteConfig.phoneIntl}`;
const contactEn = siteConfig.contactEmail
  ? `email ${siteConfig.contactEmail}`
  : `WhatsApp ${siteConfig.phoneIntl}`;
const legalName = siteConfig.legalName;
const address = `${siteConfig.address.street}, ${siteConfig.address.city}, ${siteConfig.address.region}, ${siteConfig.address.country}`;

export const PRIVACY: Record<Locale, LegalDocument> = {
  es: {
    title: "Política de privacidad",
    intro: `Esta política explica qué datos personales recoge ${legalName}, para qué los usa, quién los puede ver y qué derechos tiene. Última actualización: ${LEGAL_UPDATED}. Versión ${LEGAL_VERSION}.`,
    sections: [
      { title: "1. Quién trata sus datos", paragraphs: [
        `Responsable: ${legalName}, ${address}. Para ejercer sus derechos puede escribirnos por ${contact}.`,
      ] },
      { title: "2. Qué datos recogemos", paragraphs: ["Según lo que usted use del sitio:"], items: [
        "Datos de la cuenta: nombre, correo, teléfono y fecha de nacimiento. La contraseña la gestiona el proveedor de acceso y no la guardamos en texto.",
        "Datos de salud y de entrenamiento (sólo si usted los ingresa): peso, altura, edad, sexo, nivel de actividad, objetivo, medidas corporales y su plan o rutina.",
        "Datos de uso del gimnasio: reservas, asistencia, compras, pagos, abonos y saldos.",
        "Datos de contacto: lo que escriba en el formulario de contacto o su correo para el boletín.",
      ] },
      { title: "3. Para qué los usamos", paragraphs: ["Usamos sus datos para:"], items: [
        "Crear y mantener su cuenta, y darle acceso a su panel de cliente.",
        "Gestionar reservas, asistencia, pagos y saldos.",
        "Calcular, sólo si usted lo solicita, sus datos de referencia de nutrición y ejercicio, y registrar su peso y altura en su ficha de progreso.",
        "Responder mensajes y enviar el boletín si usted se suscribió.",
      ] },
      { title: "4. Base legal y consentimiento", paragraphs: [
        "Los datos de salud (peso, altura, medidas y objetivos) sólo se tratan con su consentimiento expreso, que usted da al marcar la casilla correspondiente. Puede retirarlo en cualquier momento; eso no afecta lo tratado antes.",
      ] },
      { title: "5. Menores de edad", paragraphs: [
        "El panel de cliente, la calculadora y las reservas son sólo para personas de 18 años o más. Una persona menor de 18 años puede navegar la página de inicio, pero no puede crear una cuenta de cliente ni usar esas funciones. Pedimos la fecha de nacimiento para verificarlo.",
      ] },
      { title: "6. Con quién compartimos los datos", paragraphs: [
        "No vendemos sus datos. Los proveedores que nos permiten operar el sitio (alojamiento de la web y de la base de datos, y el servicio de correo cuando esté configurado) procesan datos sólo por cuenta nuestra. Pueden aplicar medidas propias de seguridad y están sujetos a sus propias políticas.",
      ] },
      { title: "7. Cuánto tiempo los guardamos", paragraphs: [
        "Guardamos sus datos mientras su cuenta esté activa y, después, por el tiempo que exijan las obligaciones contables y legales [plazo a confirmar con el abogado]. Las mediciones corporales no se editan ni se borran: una corrección se registra como una medición nueva.",
      ] },
      { title: "8. Sus derechos", paragraphs: [
        `Usted puede pedir acceso, corrección, cancelación u oposición al tratamiento de sus datos. Escríbanos por ${contact} y le responderemos en el plazo que indique la ley aplicable [plazo a confirmar].`,
      ] },
      { title: "9. Seguridad", paragraphs: [
        "Aplicamos medidas técnicas: conexión cifrada (HTTPS), control de acceso por rol, autenticación de dos factores para el personal, permisos por fila en la base de datos y cabeceras de seguridad. Ningún sistema es totalmente invulnerable; si detectamos una brecha que le afecte, se lo informaremos.",
      ] },
      { title: "10. Cookies", paragraphs: [
        "Usamos cookies sólo para lo necesario. Consulte nuestra política de cookies.",
      ] },
      { title: "11. Cambios", paragraphs: [
        "Si cambiamos esta política, publicaremos la nueva versión con su fecha. Si el cambio es importante, se lo avisaremos en su cuenta.",
      ] },
    ],
  },
  en: {
    title: "Privacy policy",
    intro: `This policy explains what personal data ${legalName} collects, what we use it for, who can see it and what rights you have. Last updated: ${LEGAL_UPDATED}. Version ${LEGAL_VERSION}.`,
    sections: [
      { title: "1. Who handles your data", paragraphs: [
        `Controller: ${legalName}, ${address}. To exercise your rights, write to us by ${contactEn}.`,
      ] },
      { title: "2. What data we collect", paragraphs: ["Depending on what you use on the site:"], items: [
        "Account data: name, email, phone and date of birth. The password is handled by the access provider and is not stored in plain text by us.",
        "Health and training data (only if you enter it): weight, height, age, sex, activity level, goal, body measurements and your plan or routine.",
        "Gym usage data: bookings, attendance, purchases, payments, deposits and balances.",
        "Contact data: what you write in the contact form, or your email for the newsletter.",
      ] },
      { title: "3. What we use it for", paragraphs: ["We use your data to:"], items: [
        "Create and maintain your account and give you access to your client panel.",
        "Manage bookings, attendance, payments and balances.",
        "Calculate, only if you request it, nutrition and exercise reference data, and record your weight and height in your progress file.",
        "Answer messages and send the newsletter if you subscribed.",
      ] },
      { title: "4. Legal basis and consent", paragraphs: [
        "Health data (weight, height, measurements and goals) is processed only with your express consent, which you give by ticking the corresponding box. You may withdraw it at any time; this does not affect processing carried out before.",
      ] },
      { title: "5. Minors", paragraphs: [
        "The client panel, the calculator and bookings are only for people aged 18 or over. A person under 18 may browse the home page, but cannot create a client account or use those features. We ask for the date of birth to check this.",
      ] },
      { title: "6. Who we share data with", paragraphs: [
        "We do not sell your data. Providers that let us run the site (web and database hosting, and the email service once configured) process data only on our behalf. They may apply their own security measures and are subject to their own policies.",
      ] },
      { title: "7. How long we keep it", paragraphs: [
        "We keep your data while your account is active and afterwards for as long as accounting and legal obligations require [period to be confirmed with the lawyer]. Body measurements are never edited or deleted: a correction is recorded as a new measurement.",
      ] },
      { title: "8. Your rights", paragraphs: [
        `You may request access, correction, deletion or objection to the processing of your data. Write to us by ${contactEn} and we will reply within the period set by the applicable law [period to be confirmed].`,
      ] },
      { title: "9. Security", paragraphs: [
        "We apply technical measures: encrypted connection (HTTPS), role-based access control, two-factor authentication for staff, row-level permissions in the database and security headers. No system is completely invulnerable; if we detect a breach affecting you, we will inform you.",
      ] },
      { title: "10. Cookies", paragraphs: ["We use cookies only where necessary. See our cookie policy."] },
      { title: "11. Changes", paragraphs: [
        "If we change this policy, we will publish the new version with its date. For material changes, we will notify you in your account.",
      ] },
    ],
  },
};

export const TERMS: Record<Locale, LegalDocument> = {
  es: {
    title: "Términos y condiciones",
    intro: `Estas condiciones regulan el uso del sitio y de los servicios de ${legalName}. Al usar el sitio o crear una cuenta, usted las acepta. Versión ${LEGAL_VERSION}, ${LEGAL_UPDATED}.`,
    sections: [
      { title: "1. Servicios", paragraphs: [
        "El sitio permite conocer el gimnasio, ver horarios, reservar clases (cuando estén habilitadas), consultar su progreso y usar herramientas de cálculo de referencia.",
      ] },
      { title: "2. Cuenta y edad mínima", paragraphs: [
        "Para crear una cuenta de cliente debe tener 18 años o más y dar información veraz. Usted es responsable de la confidencialidad de su acceso. Avísenos de inmediato si sospecha un uso no autorizado.",
      ] },
      { title: "3. Herramientas de cálculo (no son consejo médico)", paragraphs: [
        "Los resultados de la calculadora de peso, calorías, comidas y ejercicio son genéricos, no personalizados y de referencia. No sustituyen la opinión de un médico, un nutricionista o un profesional de la actividad física. Usted decide si los usa y lo hace bajo su propia responsabilidad.",
        "Antes de empezar cualquier plan de alimentación o ejercicio, consulte con su médico si tiene alguna condición de salud, lesión, embarazo o toma medicamentos. Si siente dolor, mareo o molestias, deje la actividad y busque atención médica.",
      ] },
      { title: "4. Planes, reservas y pagos", paragraphs: [
        "Los planes, precios, horarios, cupos, cancelaciones y saldos se rigen por las reglas vigentes del gimnasio en el momento de la compra o la reserva [reglas comerciales a confirmar]. Los precios se muestran en dólares; los cobros en córdobas se regirán por el tipo de cambio de referencia del día [a confirmar].",
      ] },
      { title: "5. Conducta y uso del gimnasio", paragraphs: [
        "Debe respetar las normas del gimnasio, usar los equipos correctamente y no compartir su acceso. El gimnasio puede suspender cuentas por uso indebido o por incumplir estos términos.",
      ] },
      { title: "6. Limitación de responsabilidad", paragraphs: [
        "En la medida que la ley lo permita, el gimnasio no responde por daños derivados del uso de las herramientas de cálculo ni por lesiones que no se deban a negligencia. [Cláusula a revisar por el abogado, ya que ciertas responsabilidades no pueden excluirse por contrato.]",
      ] },
      { title: "7. Propiedad intelectual", paragraphs: [
        "Los textos, imágenes, marcas y el diseño del sitio pertenecen al gimnasio o a sus titulares. No puede copiarlos sin autorización.",
      ] },
      { title: "8. Cambios", paragraphs: [
        "Podemos actualizar estos términos. La versión vigente será la publicada en el sitio, con su fecha.",
      ] },
      { title: "9. Ley aplicable y contacto", paragraphs: [
        `Estas condiciones se rigen por las leyes de Nicaragua. Para consultas escriba por ${contact}.`,
      ] },
    ],
  },
  en: {
    title: "Terms and conditions",
    intro: `These terms govern the use of the site and the services of ${legalName}. By using the site or creating an account, you accept them. Version ${LEGAL_VERSION}, ${LEGAL_UPDATED}.`,
    sections: [
      { title: "1. Services", paragraphs: [
        "The site lets you learn about the gym, see schedules, book classes (when enabled), check your progress and use reference calculation tools.",
      ] },
      { title: "2. Account and minimum age", paragraphs: [
        "To create a client account you must be 18 or over and provide accurate information. You are responsible for keeping your access confidential. Tell us immediately if you suspect unauthorised use.",
      ] },
      { title: "3. Calculation tools (not medical advice)", paragraphs: [
        "The calculator results for weight, calories, meals and exercise are generic, not personalised and for reference only. They do not replace advice from a doctor, a nutritionist or an exercise professional. You decide whether to use them and do so at your own responsibility.",
        "Before starting any diet or exercise plan, consult your doctor if you have a health condition, an injury, are pregnant or take medication. If you feel pain, dizziness or discomfort, stop the activity and seek medical care.",
      ] },
      { title: "4. Plans, bookings and payments", paragraphs: [
        "Plans, prices, schedules, places, cancellations and balances are governed by the gym's rules in force at the time of purchase or booking [commercial rules to be confirmed]. Prices are shown in US dollars; córdoba charges follow the reference exchange rate of the day [to be confirmed].",
      ] },
      { title: "5. Conduct and use of the gym", paragraphs: [
        "You must follow the gym's rules, use equipment properly and not share your access. The gym may suspend accounts for misuse or breach of these terms.",
      ] },
      { title: "6. Limitation of liability", paragraphs: [
        "To the extent permitted by law, the gym is not liable for damage arising from the use of the calculation tools, or for injuries not caused by negligence. [Clause to be reviewed by the lawyer, as some liabilities cannot be excluded by contract.]",
      ] },
      { title: "7. Intellectual property", paragraphs: [
        "The texts, images, trademarks and design of the site belong to the gym or its owners. You may not copy them without permission.",
      ] },
      { title: "8. Changes", paragraphs: ["We may update these terms. The version in force is the one published on the site, with its date."] },
      { title: "9. Governing law and contact", paragraphs: [
        `These terms are governed by the laws of Nicaragua. For questions, write by ${contactEn}.`,
      ] },
    ],
  },
};

export const COOKIES: Record<Locale, LegalDocument> = {
  es: {
    title: "Política de cookies",
    intro: `Una cookie es un pequeño archivo que el sitio guarda en su navegador. Esta página explica cuáles usamos en ${legalName}. Versión ${LEGAL_VERSION}, ${LEGAL_UPDATED}.`,
    sections: [
      { title: "1. Cookies necesarias", paragraphs: [
        "Sesión de acceso: mantienen su sesión iniciada en la cuenta de cliente o del personal. Sin ellas no puede usar el panel. Se eliminan al cerrar sesión.",
        "Idioma (strong-gym-locale): recuerda si eligió español o inglés. Dura un año.",
      ] },
      { title: "2. Lo que no usamos", paragraphs: [
        "No usamos cookies de publicidad ni de seguimiento entre sitios, ni herramientas de analítica de terceros en esta versión del sitio.",
      ] },
      { title: "3. Almacenamiento del navegador", paragraphs: [
        "La app instalable guarda archivos en la caché de su navegador para funcionar sin conexión y cargar más rápido. Puede borrarlos desde la configuración del navegador.",
      ] },
      { title: "4. Cómo gestionarlas", paragraphs: [
        "Puede bloquear o borrar cookies desde su navegador. Si bloquea las necesarias, algunas funciones, como iniciar sesión, dejarán de funcionar.",
      ] },
    ],
  },
  en: {
    title: "Cookie policy",
    intro: `A cookie is a small file the site stores in your browser. This page explains which ones ${legalName} uses. Version ${LEGAL_VERSION}, ${LEGAL_UPDATED}.`,
    sections: [
      { title: "1. Necessary cookies", paragraphs: [
        "Access session: keep you signed in to your client or staff account. Without them you cannot use the panel. They are removed when you sign out.",
        "Language (strong-gym-locale): remembers whether you chose Spanish or English. Lasts one year.",
      ] },
      { title: "2. What we do not use", paragraphs: [
        "We do not use advertising or cross-site tracking cookies, nor third-party analytics tools in this version of the site.",
      ] },
      { title: "3. Browser storage", paragraphs: [
        "The installable app stores files in your browser cache so it works offline and loads faster. You can clear them from your browser settings.",
      ] },
      { title: "4. How to manage them", paragraphs: [
        "You can block or delete cookies from your browser. If you block the necessary ones, some features, such as signing in, will stop working.",
      ] },
    ],
  },
};
