import { assert } from '../utils/errors.js';

export async function activeArticle(db, id, forSale = false) {
  const article = await db.get('products', id);
  assert(article, 'Artículo no encontrado en el catálogo.', 404);
  assert(article.active, 'El artículo está inactivo.', 409);
  if (forSale)
    assert(
      article.saleable && Number(article.price) > 0,
      'El artículo no está habilitado para venta o no tiene precio.',
      409,
    );
  return article;
}

export const usableBatch = (batch, date) => !batch.expires_at || batch.expires_at > date;
