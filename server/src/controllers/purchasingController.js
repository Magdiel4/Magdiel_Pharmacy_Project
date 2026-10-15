export const purchasingController = (service) => ({
  create: async (req, res) => res.status(201).json(await service.create(req.user, req.body)),
  remove: async (req, res) => res.json(await service.remove(req.user, req.params.id)),
  status: async (req, res) => res.json(await service.status(req.user, req.params.id, req.body)),
});
