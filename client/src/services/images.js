export const imageUrl = (entity, row) =>
  `/api/images/${entity}/${row.id}?v=${encodeURIComponent(row.image_updated_at || '')}`;

export async function updateImage(entity, id, file) {
  const response = await fetch(`/api/images/${entity}/${id}`, {
    method: file ? 'PUT' : 'DELETE',
    credentials: 'same-origin',
    ...(file ? { headers: { 'Content-Type': file.type }, body: file } : {}),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || 'No se pudo guardar la fotografía.');
    error.status = response.status;
    window.dispatchEvent(new CustomEvent('api-error', { detail: error }));
    throw error;
  }
  return data;
}
