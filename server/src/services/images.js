import sharp from 'sharp';
import { z } from 'zod';
import { assertImageTable } from '../models/images.js';
import { allow, scope } from './permissions.js';
import { assert, AppError } from '../utils/errors.js';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_STORED_BYTES = 2 * 1024 * 1024;
const formats = ['jpeg', 'png', 'webp'];

async function normalizeImage(input) {
  assert(Buffer.isBuffer(input) && input.length, 'Selecciona una imagen JPG, PNG o WebP.');
  assert(input.length <= MAX_UPLOAD_BYTES, 'La imagen supera el máximo de 5 MB.', 413);
  try {
    const pipeline = sharp(input, { limitInputPixels: 25_000_000 });
    const metadata = await pipeline.metadata();
    assert(formats.includes(metadata.format), 'Solo se permiten imágenes JPG, PNG o WebP.');
    assert(!metadata.pages || metadata.pages === 1, 'Selecciona una imagen sin animación.');
    // Normalizar orientación y formato elimina metadatos EXIF, incluida geolocalización.
    const bytes = await pipeline
      .rotate()
      .resize(1600, 1600, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();
    assert(
      bytes.length <= MAX_STORED_BYTES,
      'La imagen es demasiado compleja. Reduce su tamaño.',
      413,
    );
    return bytes;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('No se pudo leer la imagen. Usa JPG, PNG o WebP de hasta 25 megapíxeles.');
  }
}

export class ImagesService {
  constructor(db, operations) {
    this.db = db;
    this.operations = operations;
  }

  async authorize(user, entity, id, write = false, db = this.db) {
    assertImageTable(entity);
    z.uuid().parse(id);
    allow(user, entity, write);
    if (write)
      assert(
        ['administrador', 'gerente'].includes(user.role),
        'No tienes permiso para modificar fotografías.',
        403,
      );
    const row = await db.get(entity, id);
    assert(row, 'Registro no encontrado.', 404);
    scope(user, row.branch_id);
    return row;
  }

  async read(user, entity, id) {
    await this.authorize(user, entity, id);
    const bytes = await this.db.getImage(entity, id);
    assert(bytes, 'Este registro aún no tiene fotografía.', 404);
    return bytes;
  }

  async save(user, entity, id, input) {
    await this.authorize(user, entity, id, true);
    const bytes = await normalizeImage(input);
    return this.change(user, entity, id, bytes);
  }

  async remove(user, entity, id) {
    return this.change(user, entity, id, null);
  }

  async change(user, entity, id, bytes) {
    return this.db.transaction(async (tx) => {
      await tx.lock(`image:${entity}:${id}`);
      await this.authorize(user, entity, id, true, tx);
      const row = await tx.saveImage(entity, id, bytes);
      await this.operations.audit(
        tx,
        user,
        bytes ? 'Guardar fotografía' : 'Eliminar fotografía',
        entity,
        id,
        {
          size_bytes: bytes?.length || 0,
          format: bytes ? 'webp' : null,
        },
      );
      return { id: row.id, has_image: row.has_image, image_updated_at: row.image_updated_at };
    });
  }
}
