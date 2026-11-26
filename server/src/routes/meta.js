import { Router } from 'express';
import { CENTER_CHECKLIST, NETWORK_CHECKLIST, OFFLINE_EXTRA_CHECKLIST, ROLE_LABELS } from '../models/roles.js';
import { Organization } from '../models/Organization.js';
import { User } from '../models/User.js';
import { ROLES } from '../models/roles.js';
import { HttpError } from '../utils/httpError.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ roles: ROLE_LABELS, checklists: { network: NETWORK_CHECKLIST, center: CENTER_CHECKLIST, offlineExtra: OFFLINE_EXTRA_CHECKLIST } });
});

router.get('/agencies', async (_req, res) => {
  res.json({ agencies: await Organization.find({ kind: 'agency', active: true }).select('name code city').sort({ name: 1 }).lean() });
});

router.get('/institutes', async (_req, res) => {
  res.json({ institutes: await Organization.find({ kind: 'institute', active: true }).select('name code city').sort({ name: 1 }).lean() });
});

/** Read-only contact directory for the exam agency: every active user except Super Admins. */
router.get('/directory', async (req, res) => {
  if (![ROLES.AGENCY, ROLES.SUPER_ADMIN].includes(req.user.role)) throw new HttpError(403, 'Only the exam agency can view the user directory');
  const users = await User.find({ role: { $ne: ROLES.SUPER_ADMIN }, status: 'active' })
    .select('name email phone role organization centers')
    .populate('organization', 'name kind city')
    .populate('centers', 'name code city')
    .sort({ role: 1, name: 1 })
    .lean();
  res.json({ users });
});

export default router;
