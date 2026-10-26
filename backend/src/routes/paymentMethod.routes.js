import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import {
    listPaymentMethods, createPaymentMethod, setDefaultPaymentMethod, deletePaymentMethod,
} from '../controllers/paymentMethod.controller.js';

const router = Router();

router.get('/', authenticate, listPaymentMethods);
router.post('/', authenticate, createPaymentMethod);
router.patch('/:id/default', authenticate, setDefaultPaymentMethod);
router.delete('/:id', authenticate, deletePaymentMethod);

export default router;
