// Application review policy, not a substitute for the issuing authority's requirements.
export const boatDocumentTypes = [{
  id: 'registration',
  label: 'Boat registration certificate',
  expiring: true
}, {
  id: 'ownership',
  label: 'Ownership or operator authorization',
  expiring: false
}, {
  id: 'operating_permit',
  label: 'Passenger operation / local permission',
  expiring: true
}, {
  id: 'survey',
  label: 'Survey / fitness certificate',
  expiring: true
}, {
  id: 'insurance',
  label: 'Passenger and third-party insurance',
  expiring: true
}, {
  id: 'safety',
  label: 'Safety equipment inspection',
  expiring: true
}, {
  id: 'seat_plan',
  label: 'Numbered seat layout and capacity evidence',
  expiring: false
}, {
  id: 'captain',
  label: 'Captain / boat operator qualification',
  expiring: true
}];
export const fleetChecks = [['independence', 'No ownership or conflict of interest in this review'], ['ownership', 'Ownership and authority to operate verified'], ['registration', 'Registration and issuer verified'], ['capacity', 'Passenger capacity and numbered seat plan verified'], ['safety', 'Safety equipment and inspection verified'], ['insurance', 'Insurance scope and validity verified'], ['permission', 'Operating area, local permissions and document applicability verified'], ['captain', 'Captain qualifications verified']];
