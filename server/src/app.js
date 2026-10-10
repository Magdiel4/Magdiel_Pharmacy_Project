import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { apiRouter } from './routes/api.js';
import { authService } from './services/auth.js';
import { Operations } from './services/operations.js';
import { UsersService } from './services/users.js';
import { sameOrigin, errors } from './middleware/security.js';
export function createApp(db, userOptions) {
  const app=express();app.disable('x-powered-by');
  app.use(helmet({contentSecurityPolicy:{directives:{'style-src':["'self'","'unsafe-inline'"],'script-src':["'self'"],'img-src':["'self'",'data:']}}}));
  app.use(express.json({limit:'100kb'}));app.use(sameOrigin);
  app.use('/api',rateLimit({windowMs:60000,limit:300,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Demasiadas solicitudes. Espera un minuto.'}}));
  app.use('/api',(req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
  const operations = new Operations(db);
  app.use('/api',apiRouter(authService(db),operations,new UsersService(db,operations,userOptions)));
  app.use('/api',(req,res)=>res.status(404).json({error:'Ruta no encontrada.'}));
  const dist=fileURLToPath(new URL('../../client/dist',import.meta.url));
  if(existsSync(dist)){app.use(express.static(dist));app.get('/{*path}',(req,res)=>res.sendFile(`${dist}/index.html`));}
  app.use(errors);return app;
}
