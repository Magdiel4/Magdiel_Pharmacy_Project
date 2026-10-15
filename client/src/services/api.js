export async function api(path, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(
      data.fields?.join('\n') || data.error || 'No se pudo completar la solicitud.',
    );
    error.status = response.status;
    window.dispatchEvent(new CustomEvent('api-error', { detail: error }));
    throw error;
  }
  return data;
}
