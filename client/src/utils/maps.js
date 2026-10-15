export function branchMapUrl(branch) {
  if (
    branch.latitude == null ||
    branch.longitude == null ||
    branch.latitude === '' ||
    branch.longitude === ''
  )
    return null;
  const latitude = Number(branch.latitude),
    longitude = Number(branch.longitude);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  )
    return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
}
