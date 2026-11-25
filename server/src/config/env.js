import 'dotenv/config';

const list = (v) =>
  (v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const bool = (v, def = false) => (v === undefined || v === '' ? def : ['1', 'true', 'yes'].includes(String(v).toLowerCase()));

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 5000),
  trustProxy: /^\d+$/.test(process.env.TRUST_PROXY || '') ? Number(process.env.TRUST_PROXY) : bool(process.env.TRUST_PROXY, false),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/thespot_exam_booking',
  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientOrigins: list(process.env.CLIENT_ORIGIN || 'http://localhost:5173'),
  publicUrl: process.env.PUBLIC_URL || 'http://localhost:5173',
  allowInstituteSignup: bool(process.env.ALLOW_INSTITUTE_SIGNUP, true),
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'TheSpot Exam Booking <no-reply@thespotexam.com>',
  },
};

if (env.nodeEnv === 'production' && env.jwtSecret === 'change-me-in-production') {
  throw new Error('JWT_SECRET must be set in production');
}
