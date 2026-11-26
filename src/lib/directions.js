/** @file Builds opt-in map links containing a boarding pier only, never guest or booking details. */
export function pierDirections(pier) {
  if (typeof pier !== 'string' || !pier.trim()) return null;
  return (
    'https://www.google.com/maps/search/?api=1&query=' +
    encodeURIComponent(
      pier + (['Assi Ghat', 'Dashashwamedh Ghat'].includes(pier) ? ', Varanasi, India' : ''),
    )
  );
}
