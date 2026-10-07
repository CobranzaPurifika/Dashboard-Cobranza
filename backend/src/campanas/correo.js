// Envío de correo del módulo Campañas por SMTP (Google Workspace) desde la cuenta de
// cobranza. Los correos quedan también en la carpeta Enviados de esa cuenta, y las
// respuestas con comprobante llegan al mismo buzón.
import nodemailer from "nodemailer";
import { CONTACTO_ESCALAMIENTO } from "./config.js";

let transporte;

export function correoConfigurado() {
  return Boolean(process.env.CAMPANAS_SMTP_USER && process.env.CAMPANAS_SMTP_PASSWORD);
}

function obtenerTransporte() {
  if (!correoConfigurado()) {
    const error = new Error("El envío de correo no está configurado (CAMPANAS_SMTP_USER / CAMPANAS_SMTP_PASSWORD)");
    error.statusCode = 503;
    throw error;
  }
  if (!transporte) {
    const port = Number(process.env.CAMPANAS_SMTP_PORT ?? 465);
    transporte = nodemailer.createTransport({
      host: process.env.CAMPANAS_SMTP_HOST ?? "smtp.gmail.com",
      port,
      secure: port === 465,
      auth: { user: process.env.CAMPANAS_SMTP_USER, pass: process.env.CAMPANAS_SMTP_PASSWORD },
    });
  }
  return transporte;
}

// Nombre y dirección con los que llega el correo (también para la vista previa, aunque el
// envío no esté configurado).
export function remitenteVisible() {
  return {
    nombre: process.env.CAMPANAS_REMITENTE_NOMBRE ?? "Cobranza Purifika",
    correo: process.env.CAMPANAS_SMTP_USER ?? CONTACTO_ESCALAMIENTO.correo,
  };
}

export function remitente() {
  const { nombre, correo } = remitenteVisible();
  return `"${nombre}" <${correo}>`;
}

export async function enviarCorreo({ para, asunto, texto, html }) {
  return obtenerTransporte().sendMail({
    from: remitente(),
    replyTo: process.env.CAMPANAS_SMTP_USER,
    to: para,
    subject: asunto,
    text: texto,
    html,
  });
}
