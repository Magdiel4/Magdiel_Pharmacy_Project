export const operationsController = (service) => ({
  snapshot: async(req,res)=>res.json(await service.snapshot(req.user)),
  create: async(req,res)=>res.status(201).json(await service.create(req.user,req.params.entity,req.body)),
  update: async(req,res)=>res.json(await service.update(req.user,req.params.entity,req.params.id,req.body)),
  profile: async(req,res)=>res.json(await service.profile(req.user,req.body)),
  receive: async(req,res)=>res.status(201).json(await service.receive(req.user,req.body)),
  transfer: async(req,res)=>res.status(201).json(await service.transfer(req.user,req.body)),
  receiveTransfer: async(req,res)=>res.json(await service.receiveTransfer(req.user,req.params.id)),
  cash: async(req,res)=>res.status(201).json(await service.cash(req.user,req.body)),
  payroll: async(req,res)=>res.status(201).json(await service.payroll(req.user,req.body)),
  payPayroll: async(req,res)=>res.json(await service.payPayroll(req.user,req.params.id,req.body)),
  quote: async(req,res)=>res.json(await service.quote(req.user,req.body)),
  order: async(req,res)=>res.status(201).json(await service.order(req.user,req.body)),
  orderStatus: async(req,res)=>res.json(await service.orderStatus(req.user,req.params.id,req.body))
});
