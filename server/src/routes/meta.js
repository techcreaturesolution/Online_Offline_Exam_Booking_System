import { Router } from 'express';
import { CENTER_CHECKLIST, NETWORK_CHECKLIST, OFFLINE_EXTRA_CHECKLIST, ROLE_LABELS } from '../models/roles.js';
import { Organization } from '../models/Organization.js';

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

export default router;
