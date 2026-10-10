import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';
import { token } from '../middleware/security.js';
import { operationsController } from '../controllers/operationsController.js';
import { usersController } from '../controllers/usersController.js';
export function apiRouter(auth,operations,users) {
  const router=Router(),c=operationsController(operations);
  router.get('/health',(req,res)=>res.json({status:'ok',mode:env.mode,name:'Farmacias Alvarado'}));
  router.post('/auth/login',rateLimit({windowMs:15*60000,limit:20,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Demasiados intentos. Espera 15 minutos.'}}),async(req,res)=>{const result=await auth.login(req.body);res.cookie('fa_session',result.token,{httpOnly:true,secure:env.production,sameSite:'strict',path:'/api',maxAge:(env.mode==='demo'?8*3600:3600)*1000});res.json({user:result.user});});
  router.post('/auth/logout',async(req,res)=>{await auth.logout(token(req));res.clearCookie('fa_session',{path:'/api',secure:env.production,sameSite:'strict',httpOnly:true});res.json({ok:true});});
  router.use(async(req,res,next)=>{req.user=await auth.user(token(req));next();});
  router.get('/bootstrap',c.snapshot);
  router.post('/records/:entity',c.create);
  router.put('/records/:entity/:id',c.update);
  router.put('/users',c.profile);
  router.post('/users',usersController(users).create);
  router.delete('/users/:id',usersController(users).remove);
  router.post('/inventory/receive',c.receive);
  router.post('/transfers',c.transfer);
  router.post('/transfers/:id/receive',c.receiveTransfer);
  router.post('/cash',c.cash);
  router.post('/payroll',c.payroll);
  router.post('/payroll/:id/pay',c.payPayroll);
  router.post('/orders/quote',c.quote);
  router.post('/orders',c.order);
  router.patch('/orders/:id/status',c.orderStatus);
  return router;
}
