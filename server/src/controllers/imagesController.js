export const imagesController = (service) => ({
  authorizeUpload: async (req, res, next) => {
    await service.authorize(req.user, req.params.entity, req.params.id, true);
    next();
  },
  read: async (req, res) => {
    const image = await service.read(req.user, req.params.entity, req.params.id);
    res.type('image/webp').send(image);
  },
  save: async (req, res) => {
    res.json(await service.save(req.user, req.params.entity, req.params.id, req.body));
  },
  remove: async (req, res) => {
    res.json(await service.remove(req.user, req.params.entity, req.params.id));
  },
});
