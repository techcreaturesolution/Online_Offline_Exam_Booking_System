import { Router } from 'express';
import { Notification } from '../models/Notification.js';

const router = Router();

router.get('/', async (req, res) => {
  const [items, unread] = await Promise.all([
    Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50).lean(),
    Notification.countDocuments({ user: req.user._id, read: false }),
  ]);
  res.json({ notifications: items, unread });
});

router.post('/read-all', async (req, res) => {
  await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
  res.json({ ok: true });
});

router.post('/:id/read', async (req, res) => {
  await Notification.updateOne({ _id: req.params.id, user: req.user._id }, { read: true });
  res.json({ ok: true });
});

export default router;
