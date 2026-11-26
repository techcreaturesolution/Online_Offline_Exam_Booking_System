import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { Center } from '../models/Center.js';
import { Notification } from '../models/Notification.js';
import { ROLES } from '../models/roles.js';
import { User } from '../models/User.js';

let transport = null;
function mailer() {
  if (!env.smtp.host || !env.smtp.user) return null;
  transport ||= nodemailer.createTransport({ host: env.smtp.host, port: env.smtp.port, secure: env.smtp.port === 465, auth: { user: env.smtp.user, pass: env.smtp.pass } });
  return transport;
}

/** Everyone who works on a booking: institute, center staff (network admin only for online), vendor, agency, super admins. */
export async function bookingAudience(booking) {
  const center = await Center.findById(booking.center).select('vendor').lean();
  const or = [
    { role: ROLES.SUPER_ADMIN },
    { role: ROLES.INSTITUTE, organization: booking.institute },
    { role: ROLES.CENTER, centers: booking.center },
  ];
  if (booking.mode === 'online') or.push({ role: ROLES.NETWORK, centers: booking.center });
  if (center?.vendor) or.push({ role: ROLES.VENDOR, organization: center.vendor });
  if (booking.agency) or.push({ role: ROLES.AGENCY, organization: booking.agency });
  return User.find({ status: 'active', $or: or }).select('_id email role').lean();
}

export async function notifyBooking(booking, title, body, { exclude, roles } = {}) {
  try {
    let users = await bookingAudience(booking);
    if (roles) users = users.filter((u) => roles.includes(u.role));
    if (exclude) users = users.filter((u) => String(u._id) !== String(exclude));
    if (!users.length) return;
    const link = `/bookings/${booking._id}`;
    await Notification.insertMany(users.map((u) => ({ user: u._id, title, body, link })));
    const t = mailer();
    if (t) {
      await Promise.allSettled(
        users.map((u) => t.sendMail({ from: env.smtp.from, to: u.email, subject: title, text: `${body}\n\n${env.publicUrl}${link}` })),
      );
    }
  } catch (err) {
    console.error('[notify]', err.message);
  }
}
