import { randomUUID } from 'node:crypto';
import { schemas } from '../models/schemas.js';
import { allow, scope, admin, permissions, branchIds, canAccessBranch } from './permissions.js';
import { assert, cents, money, today } from '../utils/errors.js';
const record = (data) => ({ id:randomUUID(), ...data, created_at:new Date().toISOString() });
const available = b => Number(b.quantity)-Number(b.reserved);
export function distanceKm(a,b,c,d) { const rad=x=>x*Math.PI/180; const h=Math.sin(rad(c-a)/2)**2+Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(rad(d-b)/2)**2; return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h)); }
export class Operations {
  constructor(repository) {this.db=repository;}
  async audit(tx,user,action,entity,entityId,details={}) {
    const subject=await tx.get(entity,entityId);
    const branchId=entity==='branches'?entityId:action==='Recibir traslado'?subject?.destination_id:subject?.branch_id??subject?.source_id??user.branch_id;
    await tx.insert('audit_log',record({ actor_id:user.id,actor_name:user.name,branch_id:branchId??null,action,entity,entity_id:entityId,details }));
  }
  async branch(tx,id) { const b=await tx.get('branches',id); assert(b?.active,'Sucursal no disponible.',404); return b; }
  async movement(tx,user,batch,quantity,type,reference) { await tx.insert('stock_movements',record({branch_id:batch.branch_id,product_id:batch.product_id,batch_id:batch.id,quantity,type,reference,actor_id:user.id})); }
  async snapshot(user) {
    const modules=permissions[user.role];
    const mapping={branches:'dashboard',products:'inventory',inventory:'inventory',transfers:'transfers',stock_movements:'inventory',cash_entries:'cash',employees:'employees',payroll:'payroll',assets:'assets',orders:'orders',profiles:'users',audit_log:'audit'};
    const result={};
    for(const [table,module] of Object.entries(mapping)) {
      if(!modules.includes(module)) {result[table]=[];continue;}
      let rows=await this.db.list(table);
      if(table==='profiles') rows=rows.filter(r=>!r.deleted_at);
      if(branchIds(user)!==null && !['products','profiles'].includes(table)) rows=rows.filter(r=>table==='branches'?canAccessBranch(user,r.id):table==='transfers'?canAccessBranch(user,r.source_id)||canAccessBranch(user,r.destination_id):canAccessBranch(user,r.branch_id));
      // Destinos visibles para coordinar traslados; no incluye inventario ajeno.
      result[table]=rows;
    }
    result.destinations=modules.includes('transfers')?(await this.db.list('branches',{active:true})).map(({id,name})=>({id,name})):[];
    return {user,modules,data:result,server_time:new Date().toISOString()};
  }
  async create(user,entity,input) {
    const module=entity==='products'?'inventory':entity;
    assert(['branches','products','employees','assets'].includes(entity),'Entidad inválida');
    allow(user,module,true); if(['branches','products'].includes(entity)) admin(user);
    const data=schemas[entity].parse(input); if(data.branch_id)scope(user,data.branch_id);
    return this.db.transaction(async tx=>{
      if(data.branch_id) await this.branch(tx,data.branch_id);
      if(['branches','products','assets'].includes(entity)) {const key=entity==='branches'?'name':entity==='products'?'sku':'code'; await tx.lock(`${entity}:${data[key]}`); assert(!(await tx.list(entity,{[key]:data[key]})).length,'Ese código o nombre ya existe.',409);}
      const row=await tx.insert(entity,record(data)); await this.audit(tx,user,'Crear',entity,row.id);return row;
    });
  }
  async profile(user,input) {
    allow(user,'users',true); admin(user); const data=schemas.users.parse(input);
    assert(data.id!==user.id,'No puedes modificar tu propio acceso desde esta pantalla.');
    return this.db.transaction(async tx=>{ await tx.lock('users:access'); const actor=await tx.get('profiles',user.id); allow(actor,'users',true); admin(actor); for(const id of data.branch_ids||[])await this.branch(tx,id); const exists=await tx.get('profiles',data.id); assert(!exists?.deleted_at&&!exists?.deletion_pending,'No puedes editar un usuario eliminado o en proceso de eliminación.',409); const row=exists?await tx.update('profiles',data.id,data):await tx.insert('profiles',record(data)); await this.audit(tx,actor,'Asignar acceso','profiles',row.id,{role:row.role,active:row.active,branch_ids:row.branch_ids});return row; });
  }
  async update(user,entity,id,input) {
    assert(['branches','products','employees','assets'].includes(entity),'Entidad inválida');
    allow(user,entity==='products'?'inventory':entity,true);if(['branches','products'].includes(entity))admin(user);
    const data=schemas[entity].parse(input);
    return this.db.transaction(async tx=>{await tx.lock(`${entity}:${id}`);const before=await tx.get(entity,id);assert(before,'Registro no encontrado.',404);if(before.branch_id)scope(user,before.branch_id);if(data.branch_id){scope(user,data.branch_id);await this.branch(tx,data.branch_id);}
      if(['branches','products','assets'].includes(entity)){const key=entity==='branches'?'name':entity==='products'?'sku':'code';await tx.lock(`${entity}:${data[key]}`);assert(!(await tx.list(entity,{[key]:data[key]})).some(r=>r.id!==id),'Ese código o nombre ya existe.',409);}
      const row=await tx.update(entity,id,data);await this.audit(tx,user,'Actualizar',entity,id,{before,after:row});return row;
    });
  }
  async receive(user,input) {
    allow(user,'inventory',true); assert(['administrador','gerente'].includes(user.role),'Solo administración o gerencia puede recibir inventario.',403);
    const data=schemas.receive.parse(input);scope(user,data.branch_id);assert(data.expires_at>today(),'No se pueden ingresar lotes vencidos o que vencen hoy.');
    return this.db.transaction(async tx=>{await this.branch(tx,data.branch_id);assert(await tx.get('products',data.product_id),'Medicamento no encontrado',404);await tx.lock(`stock:${data.branch_id}:${data.product_id}`);
      const existing=(await tx.list('inventory',{branch_id:data.branch_id,product_id:data.product_id,lot:data.lot}))[0];
      if(existing)assert(existing.expires_at===data.expires_at,'El lote ya existe con otra fecha de vencimiento.');
      const batch=existing?await tx.update('inventory',existing.id,{quantity:Number(existing.quantity)+data.quantity}):await tx.insert('inventory',record({branch_id:data.branch_id,product_id:data.product_id,lot:data.lot,expires_at:data.expires_at,quantity:data.quantity,reserved:0}));
      await this.movement(tx,user,batch,data.quantity,'Recepción',data.note);await this.audit(tx,user,'Recibir inventario','inventory',batch.id,{quantity:data.quantity,note:data.note});return batch;
    });
  }
  async transfer(user,input) {
    allow(user,'transfers',true);const data=schemas.transfer.parse(input);scope(user,data.source_id);assert(data.source_id!==data.destination_id,'Selecciona una sucursal de destino distinta.');
    return this.db.transaction(async tx=>{await this.branch(tx,data.source_id);await this.branch(tx,data.destination_id);let batch=await tx.get('inventory',data.batch_id);assert(batch && batch.branch_id===data.source_id,'Lote de origen inválido.');await tx.lock(`stock:${data.source_id}:${batch.product_id}`);batch=await tx.get('inventory',batch.id);assert(batch.expires_at>today(),'No se pueden trasladar lotes vencidos.');assert(available(batch)>=data.quantity,'Stock disponible insuficiente.',409);
      await tx.update('inventory',batch.id,{quantity:Number(batch.quantity)-data.quantity});
      const row=await tx.insert('transfers',record({...data,product_id:batch.product_id,lot:batch.lot,expires_at:batch.expires_at,status:'En tránsito',received_at:null}));
      await this.movement(tx,user,batch,-data.quantity,'Traslado enviado',row.id);await this.audit(tx,user,'Enviar traslado','transfers',row.id,{quantity:data.quantity});return row;
    });
  }
  async receiveTransfer(user,id) {
    allow(user,'transfers',true);
    return this.db.transaction(async tx=>{await tx.lock(`transfer:${id}`);const transfer=await tx.get('transfers',id);assert(transfer,'Traslado no encontrado',404);scope(user,transfer.destination_id);assert(transfer.status==='En tránsito','El traslado ya fue recibido.',409);await this.branch(tx,transfer.destination_id);await tx.lock(`stock:${transfer.destination_id}:${transfer.product_id}`);
      const existing=(await tx.list('inventory',{branch_id:transfer.destination_id,product_id:transfer.product_id,lot:transfer.lot}))[0];
      if(existing)assert(existing.expires_at===transfer.expires_at,'El lote destino tiene otra fecha de vencimiento.');
      const batch=existing?await tx.update('inventory',existing.id,{quantity:Number(existing.quantity)+Number(transfer.quantity)}):await tx.insert('inventory',record({branch_id:transfer.destination_id,product_id:transfer.product_id,lot:transfer.lot,expires_at:transfer.expires_at,quantity:transfer.quantity,reserved:0}));
      const row=await tx.update('transfers',id,{status:'Recibido',received_at:new Date().toISOString()});await this.movement(tx,user,batch,transfer.quantity,'Traslado recibido',id);await this.audit(tx,user,'Recibir traslado','transfers',id);return row;
    });
  }
  async cash(user,input) {
    allow(user,'cash',true);const data=schemas.cash.parse(input);scope(user,data.branch_id);
    return this.db.transaction(async tx=>{await this.branch(tx,data.branch_id);await tx.lock(`cash:${data.branch_id}:${data.reference}`);assert(!(await tx.list('cash_entries',{branch_id:data.branch_id,reference:data.reference})).length,'La referencia ya fue registrada.',409);const row=await tx.insert('cash_entries',record({...data,source_type:'manual',source_id:null}));await this.audit(tx,user,'Registrar movimiento','cash_entries',row.id,{amount:data.amount,type:data.type});return row;});
  }
  async payroll(user,input) {
    allow(user,'payroll',true);const data=schemas.payroll.parse(input);
    return this.db.transaction(async tx=>{await tx.lock(`payroll:${data.employee_id}:${data.period}`);const employee=await tx.get('employees',data.employee_id);assert(employee?.active,'Empleado no disponible.',404);scope(user,employee.branch_id);assert(!(await tx.list('payroll',{employee_id:data.employee_id,period:data.period})).length,'La nómina del empleado ya existe para este período.',409);const net=cents(employee.salary)+cents(data.bonus)-cents(data.deductions);assert(net>0,'El pago neto debe ser mayor que cero.');const row=await tx.insert('payroll',record({...data,branch_id:employee.branch_id,base_salary:Number(employee.salary),net:money(net),status:'Pendiente',paid_at:null,payment_reference:null}));await this.audit(tx,user,'Preparar nómina','payroll',row.id);return row;});
  }
  async payPayroll(user,id,input) {
    allow(user,'payroll',true);const {reference}=schemas.pay.parse(input);
    return this.db.transaction(async tx=>{await tx.lock(`payroll-payment:${id}`);const payroll=await tx.get('payroll',id);assert(payroll,'Nómina no encontrada',404);scope(user,payroll.branch_id);assert(payroll.status==='Pendiente','La nómina ya está pagada.',409);
      const row=await tx.update('payroll',id,{status:'Pagado',paid_at:new Date().toISOString(),payment_reference:reference});await tx.insert('cash_entries',record({branch_id:payroll.branch_id,type:'Egreso',amount:Number(payroll.net),method:'Transferencia',concept:`Nómina ${payroll.period}`,reference:`NOM-${id}`,source_type:'payroll',source_id:id}));await this.audit(tx,user,'Registrar pago de nómina','payroll',id,{reference,amount:payroll.net});return row;});
  }
  async quote(user,input) {
    allow(user,'orders');const data=schemas.quote.parse(input);const product=await this.db.get('products',data.product_id);assert(product,'Medicamento no encontrado.',404);
    const branches=await this.db.list('branches',{active:true});const batches=await this.db.list('inventory',{product_id:data.product_id});
    return branches.filter(b=>canAccessBranch(user,b.id)).map(b=>{const stock=batches.filter(r=>r.branch_id===b.id&&r.expires_at>today()).reduce((s,r)=>s+available(r),0);const distance=distanceKm(data.latitude,data.longitude,Number(b.latitude),Number(b.longitude));return {branch_id:b.id,name:b.name,available:stock,distance_km:Math.round(distance*10)/10,eta_minutes:Math.ceil(15+distance/25*60),can_deliver:stock>=data.quantity&&distance<=30,total:money(cents(product.price)*data.quantity),prescription:product.prescription};}).sort((a,b)=>Number(b.can_deliver)-Number(a.can_deliver)||a.distance_km-b.distance_km);
  }
  async order(user,input) {
    allow(user,'orders',true);const data=schemas.order.parse(input);scope(user,data.branch_id);
    return this.db.transaction(async tx=>{await tx.lock(`stock:${data.branch_id}:${data.product_id}`);const branch=await this.branch(tx,data.branch_id);const product=await tx.get('products',data.product_id);assert(product,'Medicamento no encontrado.',404);assert(!product.prescription||data.prescription_verified,'Se requiere verificar la receta antes de crear el pedido.');const distance=distanceKm(data.latitude,data.longitude,Number(branch.latitude),Number(branch.longitude));assert(distance<=30,'La dirección está fuera de la cobertura estimada de 30 km.');
      const batches=(await tx.list('inventory',{branch_id:data.branch_id,product_id:data.product_id})).filter(b=>b.expires_at>today()&&available(b)>0).sort((a,b)=>a.expires_at.localeCompare(b.expires_at));assert(batches.reduce((s,b)=>s+available(b),0)>=data.quantity,'El stock disponible cambió. Consulta disponibilidad nuevamente.',409);
      const eta=Math.ceil(15+distance/25*60);const row=await tx.insert('orders',record({...data,total:money(cents(product.price)*data.quantity),status:'Preparando',eta_minutes:eta,promised_at:new Date(Date.now()+eta*60000).toISOString(),delivered_at:null}));
      let remaining=data.quantity;for(const batch of batches){const qty=Math.min(remaining,available(batch));if(!qty)continue;await tx.update('inventory',batch.id,{reserved:Number(batch.reserved)+qty});await tx.insert('order_allocations',record({order_id:row.id,batch_id:batch.id,quantity:qty}));remaining-=qty;}
      await this.audit(tx,user,'Reservar pedido','orders',row.id,{quantity:data.quantity});return row;
    });
  }
  async orderStatus(user,id,input) {
    allow(user,'orders',true);const {status}=schemas.status.parse(input);
    return this.db.transaction(async tx=>{await tx.lock(`order:${id}`);const order=await tx.get('orders',id);assert(order,'Pedido no encontrado.',404);scope(user,order.branch_id);assert(({Preparando:['En ruta','Cancelado'],'En ruta':['Entregado','Cancelado']}[order.status]||[]).includes(status),'Transición de estado inválida o pedido ya finalizado.',409);
      await tx.lock(`stock:${order.branch_id}:${order.product_id}`);
      if(status==='Entregado'||status==='Cancelado'){for(const allocation of await tx.list('order_allocations',{order_id:id})){const batch=await tx.get('inventory',allocation.batch_id);assert(Number(batch.reserved)>=Number(allocation.quantity),'Reserva inconsistente.',409);if(status==='Entregado')assert(batch.expires_at>today(),'El lote reservado venció. Cancela el pedido y vuelve a reservar.');await tx.update('inventory',batch.id,{reserved:Number(batch.reserved)-Number(allocation.quantity),quantity:Number(batch.quantity)-(status==='Entregado'?Number(allocation.quantity):0)});if(status==='Entregado')await this.movement(tx,user,batch,-Number(allocation.quantity),'Venta entregada',id);}}
      const row=await tx.update('orders',id,{status,...(status==='Entregado'?{delivered_at:new Date().toISOString()}:{})});
      if(status==='Entregado')await tx.insert('cash_entries',record({branch_id:order.branch_id,type:'Ingreso',amount:Number(order.total),method:order.payment_method,concept:`Pedido de ${order.customer}`,reference:`PED-${id}`,source_type:'order',source_id:id}));
      await this.audit(tx,user,`Pedido: ${status}`,'orders',id);return row;
    });
  }
}
